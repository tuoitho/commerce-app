package repository

import (
	"context"
	"encoding/json"
	"errors"
	"math/big"

	"github.com/jackc/pgx/v5"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type cartDB interface {
	sqlc.DBTX
	Begin(context.Context) (pgx.Tx, error)
}

type CartRepository struct{ db cartDB }

func NewCartRepository(db cartDB) *CartRepository { return &CartRepository{db: db} }

var _ domain.CartRepository = (*CartRepository)(nil)

func (r *CartRepository) Get(ctx context.Context, userID string) (*domain.Cart, error) {
	return r.transaction(ctx, userID, func(q *sqlc.Queries) error { return nil })
}

func (r *CartRepository) AddVariant(ctx context.Context, userID, variantID string) (*domain.Cart, error) {
	return r.transaction(ctx, userID, func(q *sqlc.Queries) error {
		v, err := q.LockVariant(ctx, variantID)
		if err != nil {
			return mapNotFound(err, domain.ErrVariantNotFound)
		}
		if err := availabilityError(v.Active, v.ProductActive, v.StockQuantity, 1); err != nil {
			return err
		}
		_, err = q.InsertOrIncrementCart(ctx, sqlc.InsertOrIncrementCartParams{UserID: userID, VariantID: variantID, SnapshotBrandName: v.BrandName, SnapshotProductName: v.ProductName, SnapshotModel: v.Model, SnapshotImageUrl: v.ImageUrl, Column7: []byte(v.Options), Column8: v.StockQuantity})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domain.ErrStockLimit
			}
			return err
		}
		return nil
	})
}

func (r *CartRepository) SetQuantity(ctx context.Context, userID, itemID string, quantity int64) (*domain.Cart, error) {
	return r.transaction(ctx, userID, func(q *sqlc.Queries) error {
		item, err := q.LockCartItem(ctx, sqlc.LockCartItemParams{ID: itemID, UserID: userID})
		if err != nil {
			return mapNotFound(err, domain.ErrCartItemNotFound)
		}
		v, err := q.LockVariant(ctx, item.VariantID)
		if err != nil {
			return mapNotFound(err, domain.ErrVariantNotFound)
		}
		// Unavailable and out-of-stock lines can only be removed. Insufficient
		// lines remain editable so a valid lower quantity can recover them.
		if err := quantityMutationError(v.Active, v.ProductActive, v.StockQuantity, quantity); err != nil {
			return err
		}
		return q.SetCartQuantity(ctx, sqlc.SetCartQuantityParams{ID: itemID, UserID: userID, Column3: quantity})
	})
}

func quantityMutationError(active, productActive bool, stock, quantity int64) error {
	if !productActive || !active || stock == 0 {
		return domain.ErrCartItemUnavailable
	}
	return availabilityError(active, productActive, stock, quantity)
}

func (r *CartRepository) SetSelected(ctx context.Context, userID, itemID string, selected bool) (*domain.Cart, error) {
	return r.transaction(ctx, userID, func(q *sqlc.Queries) error {
		item, err := q.LockCartItem(ctx, sqlc.LockCartItemParams{ID: itemID, UserID: userID})
		if err != nil {
			return mapNotFound(err, domain.ErrCartItemNotFound)
		}
		if selected {
			v, err := q.LockVariant(ctx, item.VariantID)
			if err != nil {
				return mapNotFound(err, domain.ErrVariantNotFound)
			}
			if err := availabilityError(v.Active, v.ProductActive, v.StockQuantity, item.Quantity); err != nil {
				return domain.ErrCartItemUnavailable
			}
		}
		return q.SetCartSelected(ctx, sqlc.SetCartSelectedParams{ID: itemID, UserID: userID, Selected: selected})
	})
}

func (r *CartRepository) SetAllSelected(ctx context.Context, userID string, selected bool) (*domain.Cart, error) {
	return r.transaction(ctx, userID, func(q *sqlc.Queries) error {
		return q.SetAllCartSelected(ctx, sqlc.SetAllCartSelectedParams{UserID: userID, Selected: selected})
	})
}

func (r *CartRepository) Remove(ctx context.Context, userID, itemID string) (*domain.Cart, error) {
	return r.transaction(ctx, userID, func(q *sqlc.Queries) error {
		if _, err := q.LockCartItem(ctx, sqlc.LockCartItemParams{ID: itemID, UserID: userID}); err != nil {
			return mapNotFound(err, domain.ErrCartItemNotFound)
		}
		return q.RemoveCartItem(ctx, sqlc.RemoveCartItemParams{ID: itemID, UserID: userID})
	})
}

func (r *CartRepository) transaction(ctx context.Context, userID string, mutate func(*sqlc.Queries) error) (*domain.Cart, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	q := sqlc.New(tx)
	if _, err = q.LockUser(ctx, userID); err != nil {
		_ = tx.Rollback(ctx)
		return nil, mapNotFound(err, domain.ErrNotFound)
	}
	if err = q.ReconcileCart(ctx, userID); err == nil {
		err = q.RefreshCartSnapshots(ctx, userID)
	}
	if err == nil {
		err = mutate(q)
	}
	if err != nil && !isBusiness(err) {
		_ = tx.Rollback(ctx)
		return nil, err
	}
	cart, loadErr := loadCart(ctx, q, userID)
	if loadErr != nil {
		_ = tx.Rollback(ctx)
		return nil, loadErr
	}
	if commitErr := tx.Commit(ctx); commitErr != nil {
		return nil, commitErr
	}
	return cart, err
}

func loadCart(ctx context.Context, q *sqlc.Queries, userID string) (*domain.Cart, error) {
	rows, err := q.ListCartRows(ctx, userID)
	if err != nil {
		return nil, err
	}
	cart := &domain.Cart{Items: make([]domain.CartItem, 0, len(rows)), SelectedTotalVND: "0"}
	for _, row := range rows {
		qty := row.Quantity
		if qty > int64(1<<63-1)-cart.TotalUnits {
			return nil, errors.New("cart total units exceeds int64")
		}
		cart.TotalUnits += qty
		stock := row.StockQuantity
		item, line, available, err := mapCartRow(row, qty, stock)
		if err != nil {
			return nil, err
		}
		if available && row.Selected {
			cart.SelectedLineCount++
			cart.SelectedTotalVND, err = domain.AddMoneyVND(cart.SelectedTotalVND, line)
			if err != nil {
				return nil, err
			}
		}
		cart.Items = append(cart.Items, item)
	}
	return cart, nil
}

func mapCartRow(row sqlc.ListCartRowsRow, quantity, stock int64) (domain.CartItem, domain.MoneyVND, bool, error) {
	item := domain.CartItem{ID: row.ID, VariantID: row.VariantID, ProductID: row.ProductID, BrandName: row.SnapshotBrandName, ProductName: row.SnapshotProductName, Model: row.SnapshotModel, ImageURL: row.SnapshotImageUrl, StockQuantity: stock, Quantity: quantity, Selected: row.Selected}
	if err := json.Unmarshal([]byte(row.SnapshotOptions), &item.Options); err != nil {
		return domain.CartItem{}, "", false, err
	}
	item.Availability = domain.CartAvailable
	if !row.ProductActive || !row.VariantActive {
		item.Availability = domain.CartUnavailable
	} else if stock == 0 {
		item.Availability = domain.CartOutOfStock
	} else if quantity > stock {
		item.Availability = domain.CartInsufficientStock
	}
	if item.Availability != domain.CartUnavailable {
		item.BrandName, item.ProductName, item.Model = row.BrandName, row.ProductName, row.Model
	}
	if item.Availability != domain.CartAvailable && item.Availability != domain.CartInsufficientStock {
		return item, "", false, nil
	}
	item.UnitPriceVND = domain.MoneyVNDPtr(domain.MoneyVND(row.PriceVnd))
	item.IsLivePrice = row.IsLivePrice
	line := domain.MoneyVND(new(big.Int).Mul(numericInt(row.PriceVnd), big.NewInt(row.Quantity)).String())
	item.LineTotalVND = &line
	return item, line, item.Availability == domain.CartAvailable, nil
}

func availabilityError(active, productActive bool, stock, quantity int64) error {
	if !productActive || !active {
		return domain.ErrVariantUnavailable
	}
	if stock == 0 {
		return domain.ErrOutOfStock
	}
	if quantity > stock {
		return domain.ErrStockLimit
	}
	return nil
}
func isBusiness(err error) bool {
	return errors.Is(err, domain.ErrVariantUnavailable) || errors.Is(err, domain.ErrOutOfStock) || errors.Is(err, domain.ErrStockLimit) || errors.Is(err, domain.ErrCartItemUnavailable) || errors.Is(err, domain.ErrCartItemNotFound) || errors.Is(err, domain.ErrVariantNotFound)
}
func mapNotFound(err, target error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return target
	}
	return err
}
func numericInt(s string) *big.Int {
	n, _ := new(big.Int).SetString(s, 10)
	if n == nil {
		return new(big.Int)
	}
	return n
}
