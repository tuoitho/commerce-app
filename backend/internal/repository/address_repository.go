package repository

import (
	"context"

	"github.com/jackc/pgx/v5"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type addressDB interface {
	sqlc.DBTX
	Begin(context.Context) (pgx.Tx, error)
}

type AddressRepository struct {
	db   addressDB
	area domain.AreaRepository
}

func NewAddressRepository(db addressDB, area domain.AreaRepository) *AddressRepository {
	return &AddressRepository{
		db:   db,
		area: area,
	}
}

var _ domain.AddressRepository = (*AddressRepository)(nil)

func (r *AddressRepository) ListByUser(ctx context.Context, userID string) ([]domain.Address, error) {
	q := sqlc.New(r.db)
	rows, err := q.ListAddressesByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return []domain.Address{}, nil
	}
	result := make([]domain.Address, len(rows))
	for i, row := range rows {
		result[i] = mapAddress(row)
	}
	return result, nil
}

func (r *AddressRepository) GetByID(ctx context.Context, userID, id string) (*domain.Address, error) {
	q := sqlc.New(r.db)
	row, err := q.GetAddressByID(ctx, sqlc.GetAddressByIDParams{ID: id, UserID: userID})
	if err != nil {
		return nil, mapNotFound(err, domain.ErrAddressNotFound)
	}
	addr := mapAddress(row)
	return &addr, nil
}

func (r *AddressRepository) Create(ctx context.Context, userID string, input domain.AddressInput) (*domain.Address, error) {
	p, w, err := r.area.Resolve(ctx, input.ProvinceCode, input.WardCode)
	if err != nil {
		return nil, err
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	if _, err := q.LockUser(ctx, userID); err != nil {
		return nil, mapNotFound(err, domain.ErrNotFound)
	}

	count, err := q.CountAddressesByUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	isDefault := input.IsDefault
	if count == 0 {
		isDefault = true
	} else if isDefault {
		if err := q.ClearDefaultAddresses(ctx, userID); err != nil {
			return nil, err
		}
	}

	inserted, err := q.InsertAddress(ctx, sqlc.InsertAddressParams{
		UserID:        userID,
		RecipientName: input.RecipientName,
		Phone:         input.Phone,
		ProvinceCode:  int32(input.ProvinceCode),
		ProvinceName:  p.Name,
		WardCode:      int32(input.WardCode),
		WardName:      w.Name,
		DetailAddress: input.DetailAddress,
		IsDefault:     isDefault,
	})
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	addr := mapAddress(inserted)
	return &addr, nil
}

func (r *AddressRepository) Update(ctx context.Context, userID, id string, input domain.AddressInput) (*domain.Address, error) {
	p, w, err := r.area.Resolve(ctx, input.ProvinceCode, input.WardCode)
	if err != nil {
		return nil, err
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	if _, err := q.LockUser(ctx, userID); err != nil {
		return nil, mapNotFound(err, domain.ErrNotFound)
	}

	if _, err := q.GetAddressByID(ctx, sqlc.GetAddressByIDParams{ID: id, UserID: userID}); err != nil {
		return nil, mapNotFound(err, domain.ErrAddressNotFound)
	}

	if input.IsDefault {
		if err := q.ClearDefaultAddresses(ctx, userID); err != nil {
			return nil, err
		}
	}

	updated, err := q.UpdateAddress(ctx, sqlc.UpdateAddressParams{
		ID:            id,
		UserID:        userID,
		RecipientName: input.RecipientName,
		Phone:         input.Phone,
		ProvinceCode:  int32(input.ProvinceCode),
		ProvinceName:  p.Name,
		WardCode:      int32(input.WardCode),
		WardName:      w.Name,
		DetailAddress: input.DetailAddress,
		IsDefault:     input.IsDefault,
	})
	if err != nil {
		return nil, mapNotFound(err, domain.ErrAddressNotFound)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	addr := mapAddress(updated)
	return &addr, nil
}

func (r *AddressRepository) Delete(ctx context.Context, userID, id string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	if _, err := q.LockUser(ctx, userID); err != nil {
		return mapNotFound(err, domain.ErrNotFound)
	}

	if _, err := q.GetAddressByID(ctx, sqlc.GetAddressByIDParams{ID: id, UserID: userID}); err != nil {
		return mapNotFound(err, domain.ErrAddressNotFound)
	}

	if err := q.DeleteAddress(ctx, sqlc.DeleteAddressParams{ID: id, UserID: userID}); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *AddressRepository) SetDefault(ctx context.Context, userID, id string) (*domain.Address, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	if _, err := q.LockUser(ctx, userID); err != nil {
		return nil, mapNotFound(err, domain.ErrNotFound)
	}

	if _, err := q.GetAddressByID(ctx, sqlc.GetAddressByIDParams{ID: id, UserID: userID}); err != nil {
		return nil, mapNotFound(err, domain.ErrAddressNotFound)
	}

	if err := q.ClearDefaultAddresses(ctx, userID); err != nil {
		return nil, err
	}

	updated, err := q.SetAddressDefault(ctx, sqlc.SetAddressDefaultParams{
		ID:     id,
		UserID: userID,
	})
	if err != nil {
		return nil, mapNotFound(err, domain.ErrAddressNotFound)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	addr := mapAddress(updated)
	return &addr, nil
}

func mapAddress(a sqlc.Address) domain.Address {
	return domain.Address{
		ID:            a.ID,
		UserID:        a.UserID,
		RecipientName: a.RecipientName,
		Phone:         a.Phone,
		ProvinceCode:  int(a.ProvinceCode),
		ProvinceName:  a.ProvinceName,
		WardCode:      int(a.WardCode),
		WardName:      a.WardName,
		DetailAddress: a.DetailAddress,
		IsDefault:     a.IsDefault,
		CreatedAt:     a.CreatedAt,
		UpdatedAt:     a.UpdatedAt,
	}
}
