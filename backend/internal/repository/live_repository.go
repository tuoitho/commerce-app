package repository

import (
	"context"
	"errors"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/repository/sqlc"
)

type liveDB interface {
	sqlc.DBTX
	Begin(context.Context) (pgx.Tx, error)
}

type LiveRepository struct{ db liveDB }

func NewLiveRepository(db liveDB) *LiveRepository { return &LiveRepository{db: db} }

var _ domain.LiveRepository = (*LiveRepository)(nil)

func (r *LiveRepository) GetSession(ctx context.Context, id string) (*domain.LiveSession, error) {
	row, err := sqlc.New(r.db).GetLiveSession(ctx, id)
	if err != nil {
		return nil, mapNotFound(err, domain.ErrLivestreamNotFound)
	}
	return mapLiveSession(row), nil
}

func (r *LiveRepository) GetCurrentSession(ctx context.Context) (*domain.LiveSession, error) {
	row, err := sqlc.New(r.db).GetCurrentLiveSession(ctx)
	if err != nil {
		return nil, mapNotFound(err, domain.ErrLivestreamNotFound)
	}
	return mapLiveSession(row), nil
}

func (r *LiveRepository) ValidationData(ctx context.Context, sessionID string, productIDs, variantIDs []string) (*domain.LiveValidationData, error) {
	q := sqlc.New(r.db)
	data := &domain.LiveValidationData{
		Products: map[string]domain.LiveValidationProduct{},
		Variants: map[string]domain.LiveValidationVariant{},
		Sold:     map[string]int{},
	}
	products, err := q.ListProductsForLiveValidation(ctx, nonNilIDs(productIDs))
	if err != nil {
		return nil, err
	}
	for _, p := range products {
		data.Products[p.ID] = domain.LiveValidationProduct{ID: p.ID, Active: p.Active}
	}
	variants, err := q.ListVariantsForLiveValidation(ctx, nonNilIDs(variantIDs))
	if err != nil {
		return nil, err
	}
	for _, v := range variants {
		data.Variants[v.ID] = domain.LiveValidationVariant{ID: v.ID, ProductID: v.ProductID, Active: v.Active, RegularPriceVND: domain.MoneyVND(v.PriceVnd)}
	}
	if sessionID != "" {
		sold, err := q.ListLiveVariantSold(ctx, sessionID)
		if err != nil {
			return nil, err
		}
		for _, s := range sold {
			data.Sold[s.VariantID] = int(s.SoldQuantity)
		}
	}
	return data, nil
}

func (r *LiveRepository) CreateSession(ctx context.Context, title, createdBy string, products []domain.LiveProductInput) (*domain.LiveSession, error) {
	var session *domain.LiveSession
	err := r.inTx(ctx, func(q *sqlc.Queries) error {
		row, err := q.CreateLiveSession(ctx, sqlc.CreateLiveSessionParams{Title: title, CreatedBy: createdBy})
		if err != nil {
			if isUniqueViolation(err) {
				return domain.ErrLivestreamAlreadyActive
			}
			return err
		}
		session = mapLiveSession(row)
		return writeLiveProducts(ctx, q, row.ID, products)
	})
	if err != nil {
		return nil, err
	}
	return session, nil
}

func (r *LiveRepository) ReplaceProducts(ctx context.Context, sessionID string, products []domain.LiveProductInput) error {
	return r.inTx(ctx, func(q *sqlc.Queries) error {
		session, err := lockLiveSession(ctx, q, sessionID)
		if err != nil {
			return err
		}
		if err := writeLiveProducts(ctx, q, sessionID, products); err != nil {
			return err
		}
		if session.PinnedProductID.Valid && !containsProduct(products, uuidString(session.PinnedProductID)) {
			return q.SetLivePinnedProduct(ctx, sqlc.SetLivePinnedProductParams{ID: sessionID})
		}
		return nil
	})
}

func (r *LiveRepository) SetPinnedProduct(ctx context.Context, sessionID string, productID *string) error {
	return r.inTx(ctx, func(q *sqlc.Queries) error {
		if _, err := lockLiveSession(ctx, q, sessionID); err != nil {
			return err
		}
		params := sqlc.SetLivePinnedProductParams{ID: sessionID}
		if productID != nil {
			if err := params.ProductID.Scan(*productID); err != nil {
				return err
			}
		}
		return q.SetLivePinnedProduct(ctx, params)
	})
}

func (r *LiveRepository) EndSession(ctx context.Context, sessionID, reason string) (*domain.LiveSession, error) {
	q := sqlc.New(r.db)
	row, err := q.EndLiveSession(ctx, sqlc.EndLiveSessionParams{ID: sessionID, EndReason: pgtype.Text{String: reason, Valid: true}})
	if errors.Is(err, pgx.ErrNoRows) {
		if _, getErr := q.GetLiveSession(ctx, sessionID); getErr != nil {
			return nil, mapNotFound(getErr, domain.ErrLivestreamNotFound)
		}
		return nil, domain.ErrLivestreamEnded
	}
	if err != nil {
		return nil, err
	}
	return mapLiveSession(row), nil
}

func (r *LiveRepository) ListCatalog(ctx context.Context, sessionID string) ([]domain.LiveCatalogProduct, []domain.LiveCatalogVariant, error) {
	q := sqlc.New(r.db)
	productRows, err := q.ListLiveSessionProducts(ctx, sessionID)
	if err != nil {
		return nil, nil, err
	}
	variantRows, err := q.ListLiveSessionVariants(ctx, sessionID)
	if err != nil {
		return nil, nil, err
	}
	products := make([]domain.LiveCatalogProduct, 0, len(productRows))
	for _, p := range productRows {
		products = append(products, domain.LiveCatalogProduct{
			ProductID: p.ProductID,
			Position:  int(p.Position),
			Name:      p.Name,
			Brand:     p.Brand,
			ImageURL:  p.ImageUrl,
			Active:    p.Active,
		})
	}
	variants := make([]domain.LiveCatalogVariant, 0, len(variantRows))
	for _, v := range variantRows {
		variant := domain.LiveCatalogVariant{
			VariantID:       v.VariantID,
			ProductID:       v.ProductID,
			Active:          v.Active,
			StockQuantity:   v.StockQuantity,
			RegularPriceVND: domain.MoneyVND(v.RegularPriceVnd),
			HasLivePrice:    v.HasLivePrice,
			Sold:            int(v.SoldQuantity),
			LiveActive:      v.LiveActive,
			OptionLabel:     v.OptionLabel,
		}
		if v.HasLivePrice {
			variant.LivePriceVND = domain.MoneyVND(v.LivePriceVnd)
		}
		if v.HasQuota {
			quota := int(v.Quota)
			variant.Quota = &quota
		}
		variants = append(variants, variant)
	}
	return products, variants, nil
}

func (r *LiveRepository) ListRecentComments(ctx context.Context, sessionID string, includeHidden bool, limit int) ([]domain.LiveComment, error) {
	rows, err := sqlc.New(r.db).ListRecentLiveComments(ctx, sqlc.ListRecentLiveCommentsParams{
		SessionID:     sessionID,
		IncludeHidden: includeHidden,
		RowLimit:      int32(limit),
	})
	if err != nil {
		return nil, err
	}
	comments := make([]domain.LiveComment, len(rows))
	// Rows arrive newest first; viewers read oldest to newest.
	for i, row := range rows {
		comments[len(rows)-1-i] = domain.LiveComment{
			ID:         row.ID,
			SessionID:  row.SessionID,
			UserID:     row.UserID,
			AuthorName: row.AuthorName,
			AuthorRole: row.AuthorRole,
			Content:    row.Content,
			Hidden:     row.HiddenAt.Valid,
			CreatedAt:  row.CreatedAt.UTC(),
		}
	}
	return comments, nil
}

func (r *LiveRepository) CountComments(ctx context.Context, sessionID string) (int64, error) {
	return sqlc.New(r.db).CountLiveComments(ctx, sessionID)
}

func (r *LiveRepository) InsertComment(ctx context.Context, sessionID, userID, content string) (*domain.LiveComment, error) {
	q := sqlc.New(r.db)
	id, err := q.InsertLiveComment(ctx, sqlc.InsertLiveCommentParams{SessionID: sessionID, UserID: userID, Content: content})
	if err != nil {
		return nil, err
	}
	return getLiveComment(ctx, q, id)
}

func (r *LiveRepository) HideComment(ctx context.Context, id string) (*domain.LiveComment, error) {
	q := sqlc.New(r.db)
	if _, err := q.HideLiveComment(ctx, id); err != nil {
		return nil, mapNotFound(err, domain.ErrLiveCommentNotFound)
	}
	return getLiveComment(ctx, q, id)
}

func (r *LiveRepository) LastCommentAt(ctx context.Context, sessionID, userID string) (*time.Time, error) {
	at, err := sqlc.New(r.db).LastLiveCommentAtByUser(ctx, sqlc.LastLiveCommentAtByUserParams{SessionID: sessionID, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	at = at.UTC()
	return &at, nil
}

func getLiveComment(ctx context.Context, q *sqlc.Queries, id string) (*domain.LiveComment, error) {
	row, err := q.GetLiveComment(ctx, id)
	if err != nil {
		return nil, mapNotFound(err, domain.ErrLiveCommentNotFound)
	}
	return &domain.LiveComment{
		ID:         row.ID,
		SessionID:  row.SessionID,
		UserID:     row.UserID,
		AuthorName: row.AuthorName,
		AuthorRole: row.AuthorRole,
		Content:    row.Content,
		Hidden:     row.HiddenAt.Valid,
		CreatedAt:  row.CreatedAt.UTC(),
	}, nil
}

func (r *LiveRepository) TouchSignal(ctx context.Context, sessionID string, at time.Time) error {
	return sqlc.New(r.db).TouchLiveSignal(ctx, sqlc.TouchLiveSignalParams{ID: sessionID, SignalAt: pgtype.Timestamptz{Time: at, Valid: true}})
}

func (r *LiveRepository) AddHearts(ctx context.Context, sessionID string, delta int64) error {
	return sqlc.New(r.db).AddLiveHearts(ctx, sqlc.AddLiveHeartsParams{ID: sessionID, Delta: delta})
}

func (r *LiveRepository) UpdatePeakViewers(ctx context.Context, sessionID string, viewers int) error {
	return sqlc.New(r.db).UpdateLivePeakViewers(ctx, sqlc.UpdateLivePeakViewersParams{ID: sessionID, Viewers: int32(viewers)})
}

func (r *LiveRepository) inTx(ctx context.Context, fn func(*sqlc.Queries) error) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	if err := fn(sqlc.New(tx)); err != nil {
		_ = tx.Rollback(ctx)
		return err
	}
	return tx.Commit(ctx)
}

func lockLiveSession(ctx context.Context, q *sqlc.Queries, sessionID string) (sqlc.LiveSession, error) {
	session, err := q.LockLiveSession(ctx, sessionID)
	if err != nil {
		return session, mapNotFound(err, domain.ErrLivestreamNotFound)
	}
	if session.Status != domain.LiveStatusLive {
		return session, domain.ErrLivestreamEnded
	}
	return session, nil
}

// writeLiveProducts makes the stored live cart match products exactly while
// keeping the sold count of every variant whose live price is kept.
func writeLiveProducts(ctx context.Context, q *sqlc.Queries, sessionID string, products []domain.LiveProductInput) error {
	productIDs := []string{}
	variantIDs := []string{}
	for _, p := range products {
		productIDs = append(productIDs, p.ProductID)
		for _, v := range p.Variants {
			variantIDs = append(variantIDs, v.VariantID)
		}
	}
	if err := q.DeleteLiveSessionProductsExcept(ctx, sqlc.DeleteLiveSessionProductsExceptParams{SessionID: sessionID, ProductIds: productIDs}); err != nil {
		return err
	}
	if err := q.DeleteLiveVariantPricesExcept(ctx, sqlc.DeleteLiveVariantPricesExceptParams{SessionID: sessionID, VariantIds: variantIDs}); err != nil {
		return err
	}
	for i, p := range products {
		if err := q.UpsertLiveSessionProduct(ctx, sqlc.UpsertLiveSessionProductParams{SessionID: sessionID, ProductID: p.ProductID, Position: int32(i)}); err != nil {
			return err
		}
		for _, v := range p.Variants {
			params := sqlc.UpsertLiveVariantPriceParams{
				SessionID:    sessionID,
				ProductID:    p.ProductID,
				VariantID:    v.VariantID,
				LivePriceVnd: toNumeric(string(v.LivePriceVND)),
			}
			if v.Quota != nil {
				params.Quota = pgtype.Int4{Int32: int32(*v.Quota), Valid: true}
			}
			if err := q.UpsertLiveVariantPrice(ctx, params); err != nil {
				if isPostgresCode(err, "23514") {
					// An order consumed quota between validation and this write.
					return domain.NewValidationError(map[string]string{"products": "Số suất không được nhỏ hơn số đã bán"})
				}
				return err
			}
		}
	}
	return nil
}

// consumeLiveQuota takes quantity units of a variant's live-price quota inside
// the caller's transaction. When fewer units remain the order is refused: with
// LiveQuotaExceededError while some remain, or as a product change when the
// quota ran out concurrently and the live price no longer applies.
func consumeLiveQuota(ctx context.Context, q *sqlc.Queries, sessionID, variantID, productName string, quantity int64) error {
	if quantity <= math.MaxInt32 {
		_, err := q.ConsumeLiveQuota(ctx, sqlc.ConsumeLiveQuotaParams{SessionID: sessionID, VariantID: variantID, Quantity: int32(quantity)})
		if err == nil {
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
	}
	remaining, err := q.GetLiveQuotaRemaining(ctx, sqlc.GetLiveQuotaRemainingParams{SessionID: sessionID, VariantID: variantID})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if remaining < 1 {
		return domain.NewProductChangedError([]string{productName})
	}
	return &domain.LiveQuotaExceededError{ProductName: productName, Remaining: int64(remaining)}
}

func mapLiveSession(row sqlc.LiveSession) *domain.LiveSession {
	s := &domain.LiveSession{
		ID:          row.ID,
		Title:       row.Title,
		Status:      row.Status,
		CreatedBy:   row.CreatedBy,
		HeartCount:  row.HeartCount,
		PeakViewers: int(row.PeakViewers),
		StartedAt:   row.StartedAt.UTC(),
	}
	if row.PinnedProductID.Valid {
		id := uuidString(row.PinnedProductID)
		s.PinnedProductID = &id
	}
	if row.LastSignalAt.Valid {
		at := row.LastSignalAt.Time.UTC()
		s.LastSignalAt = &at
	}
	if row.EndedAt.Valid {
		at := row.EndedAt.Time.UTC()
		s.EndedAt = &at
	}
	if row.EndReason.Valid {
		reason := row.EndReason.String
		s.EndReason = &reason
	}
	return s
}

func containsProduct(products []domain.LiveProductInput, id string) bool {
	for _, p := range products {
		if p.ProductID == id {
			return true
		}
	}
	return false
}

func uuidString(id pgtype.UUID) string {
	value, _ := id.Value()
	s, _ := value.(string)
	return s
}

func nonNilIDs(ids []string) []string {
	if ids == nil {
		return []string{}
	}
	return ids
}
