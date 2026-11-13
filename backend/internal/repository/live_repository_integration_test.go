//go:build integration

package repository

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	liveuc "commerce-backend/internal/usecase/live"
)

type noMedia struct{}

func (noMedia) Ping(context.Context) error                       { return nil }
func (noMedia) PathOnline(context.Context, string) (bool, error) { return false, nil }

func TestLiveRepositoryIntegration(t *testing.T) {
	ctx := context.Background()
	conn, pool := startLiveIntegrationDB(t)
	repo := NewLiveRepository(pool)
	quota := func(v int) *int { return &v }
	reset := func(t *testing.T) {
		t.Helper()
		_, err := conn.Exec(ctx, `DELETE FROM order_items; DELETE FROM orders; DELETE FROM live_sessions; DELETE FROM addresses`)
		require.NoError(t, err)
	}
	cart := []domain.LiveProductInput{
		{ProductID: liveProductA, Variants: []domain.LiveVariantInput{{VariantID: liveVariantA1, LivePriceVND: "900000", Quota: quota(5)}}},
		{ProductID: liveProductB},
	}

	t.Run("create stores the live cart in order and rejects a second live session", func(t *testing.T) {
		reset(t)
		session, err := repo.CreateSession(ctx, "Flash sale", liveAdminID, cart)
		require.NoError(t, err)
		assert.Equal(t, domain.LiveStatusLive, session.Status)

		_, err = repo.CreateSession(ctx, "Another", liveAdminID, nil)
		require.ErrorIs(t, err, domain.ErrLivestreamAlreadyActive)

		current, err := repo.GetCurrentSession(ctx)
		require.NoError(t, err)
		assert.Equal(t, session.ID, current.ID)

		products, variants, err := repo.ListCatalog(ctx, session.ID)
		require.NoError(t, err)
		require.Len(t, products, 2)
		assert.Equal(t, liveProductA, products[0].ProductID)
		assert.Equal(t, liveProductB, products[1].ProductID)
		byID := map[string]domain.LiveCatalogVariant{}
		for _, v := range variants {
			byID[v.VariantID] = v
		}
		a1 := byID[liveVariantA1]
		assert.True(t, a1.HasLivePrice)
		assert.True(t, a1.LiveActive)
		assert.Equal(t, domain.MoneyVND("900000"), a1.LivePriceVND)
		require.NotNil(t, a1.Quota)
		assert.Equal(t, 5, *a1.Quota)
		assert.False(t, byID[liveVariantA2].HasLivePrice)
		assert.Equal(t, domain.MoneyVND("2000000"), byID[liveVariantA2].RegularPriceVND)
	})

	t.Run("replace keeps sold units, reorders, and clears a removed pin", func(t *testing.T) {
		reset(t)
		session, err := repo.CreateSession(ctx, "Flash sale", liveAdminID, cart)
		require.NoError(t, err)
		_, err = conn.Exec(ctx, `UPDATE live_variant_prices SET sold_quantity = 3 WHERE session_id = $1`, session.ID)
		require.NoError(t, err)
		require.NoError(t, repo.SetPinnedProduct(ctx, session.ID, &[]string{liveProductB}[0]))

		require.NoError(t, repo.ReplaceProducts(ctx, session.ID, []domain.LiveProductInput{
			{ProductID: liveProductA, Variants: []domain.LiveVariantInput{{VariantID: liveVariantA1, LivePriceVND: "850000", Quota: quota(8)}}},
		}))

		data, err := repo.ValidationData(ctx, session.ID, []string{liveProductA}, []string{liveVariantA1})
		require.NoError(t, err)
		assert.Equal(t, 3, data.Sold[liveVariantA1])
		assert.True(t, data.Products[liveProductA].Active)
		assert.Equal(t, liveProductA, data.Variants[liveVariantA1].ProductID)

		reloaded, err := repo.GetSession(ctx, session.ID)
		require.NoError(t, err)
		assert.Nil(t, reloaded.PinnedProductID, "pin of a removed product is cleared")

		products, variants, err := repo.ListCatalog(ctx, session.ID)
		require.NoError(t, err)
		require.Len(t, products, 1)
		for _, v := range variants {
			if v.VariantID == liveVariantA1 {
				assert.Equal(t, domain.MoneyVND("850000"), v.LivePriceVND)
				assert.Equal(t, 3, v.Sold)
			}
		}

		require.NoError(t, repo.ReplaceProducts(ctx, session.ID, nil))
		products, _, err = repo.ListCatalog(ctx, session.ID)
		require.NoError(t, err)
		assert.Empty(t, products, "an empty list clears the live cart")
	})

	t.Run("pin, end, and operations on an ended session", func(t *testing.T) {
		reset(t)
		session, err := repo.CreateSession(ctx, "Flash sale", liveAdminID, cart)
		require.NoError(t, err)
		require.NoError(t, repo.SetPinnedProduct(ctx, session.ID, &[]string{liveProductA}[0]))
		reloaded, err := repo.GetSession(ctx, session.ID)
		require.NoError(t, err)
		require.NotNil(t, reloaded.PinnedProductID)
		assert.Equal(t, liveProductA, *reloaded.PinnedProductID)

		ended, err := repo.EndSession(ctx, session.ID, domain.LiveEndReasonSignalLost)
		require.NoError(t, err)
		assert.Equal(t, domain.LiveStatusEnded, ended.Status)
		require.NotNil(t, ended.EndReason)
		assert.Equal(t, domain.LiveEndReasonSignalLost, *ended.EndReason)
		require.NotNil(t, ended.EndedAt)

		_, err = repo.EndSession(ctx, session.ID, domain.LiveEndReasonAdmin)
		require.ErrorIs(t, err, domain.ErrLivestreamEnded)
		require.ErrorIs(t, repo.ReplaceProducts(ctx, session.ID, nil), domain.ErrLivestreamEnded)
		require.ErrorIs(t, repo.SetPinnedProduct(ctx, session.ID, nil), domain.ErrLivestreamEnded)
		_, err = repo.GetCurrentSession(ctx)
		require.ErrorIs(t, err, domain.ErrLivestreamNotFound)

		missing := "99999999-0000-0000-0000-000000000000"
		_, err = repo.EndSession(ctx, missing, domain.LiveEndReasonAdmin)
		require.ErrorIs(t, err, domain.ErrLivestreamNotFound)
		_, err = repo.GetSession(ctx, missing)
		require.ErrorIs(t, err, domain.ErrLivestreamNotFound)
	})

	t.Run("discontinued products and deleted variants leave the live cart", func(t *testing.T) {
		reset(t)
		defer func() {
			_, _ = conn.Exec(ctx, `UPDATE products SET active = true WHERE id = $1`, liveProductB)
		}()
		session, err := repo.CreateSession(ctx, "Flash sale", liveAdminID, []domain.LiveProductInput{
			{ProductID: liveProductA, Variants: []domain.LiveVariantInput{{VariantID: liveVariantA1, LivePriceVND: "900000"}, {VariantID: liveVariantA2, LivePriceVND: "1900000"}}},
			{ProductID: liveProductB},
		})
		require.NoError(t, err)
		require.NoError(t, repo.SetPinnedProduct(ctx, session.ID, &[]string{liveProductB}[0]))
		uc := liveuc.New(liveuc.Dependencies{Repo: repo, Media: noMedia{}, WebRTCPublicURL: "http://m", HLSPublicURL: "http://m"})

		_, err = conn.Exec(ctx, `UPDATE products SET active = false WHERE id = $1`, liveProductB)
		require.NoError(t, err)
		view, err := uc.SessionView(ctx, session.ID)
		require.NoError(t, err)
		require.Len(t, view.Products, 1, "a discontinued product is no longer shown")
		assert.Equal(t, liveProductA, view.Products[0].ProductID)
		assert.Nil(t, view.PinnedProductID, "a pin on a discontinued product reads as no pin (D12)")

		_, err = conn.Exec(ctx, `DELETE FROM variant_option_values WHERE variant_id = $1; DELETE FROM product_variants WHERE id = $1`, liveVariantA2)
		require.NoError(t, err)
		view, err = uc.SessionView(ctx, session.ID)
		require.NoError(t, err)
		require.Len(t, view.Products[0].LivePrices, 1, "a deleted variant takes its live price with it")
		assert.Equal(t, liveVariantA1, view.Products[0].LivePrices[0].VariantID)
		var prices int
		require.NoError(t, conn.QueryRow(ctx, `SELECT count(*) FROM live_variant_prices WHERE session_id = $1`, session.ID).Scan(&prices))
		assert.Equal(t, 1, prices)
	})

	t.Run("hearts accumulate and peak viewers only grow", func(t *testing.T) {
		reset(t)
		session, err := repo.CreateSession(ctx, "Flash sale", liveAdminID, nil)
		require.NoError(t, err)
		require.NoError(t, repo.AddHearts(ctx, session.ID, 7))
		require.NoError(t, repo.AddHearts(ctx, session.ID, 5))
		require.NoError(t, repo.UpdatePeakViewers(ctx, session.ID, 9))
		require.NoError(t, repo.UpdatePeakViewers(ctx, session.ID, 4))
		reloaded, err := repo.GetSession(ctx, session.ID)
		require.NoError(t, err)
		assert.EqualValues(t, 12, reloaded.HeartCount)
		assert.Equal(t, 9, reloaded.PeakViewers)

		seen := time.Date(2026, 11, 13, 10, 0, 0, 0, time.UTC)
		require.NoError(t, repo.TouchSignal(ctx, session.ID, seen))
		reloaded, err = repo.GetSession(ctx, session.ID)
		require.NoError(t, err)
		require.NotNil(t, reloaded.LastSignalAt)
		assert.True(t, seen.Equal(*reloaded.LastSignalAt))
	})

	t.Run("insert, hide and last comment time", func(t *testing.T) {
		reset(t)
		session, err := repo.CreateSession(ctx, "Flash sale", liveAdminID, nil)
		require.NoError(t, err)
		_, err = conn.Exec(ctx, `INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
			VALUES ($1, 'Nguyễn Lan', '0900000000', 1, 'HN', 1, 'W', 'D', true)`, liveCustomerID)
		require.NoError(t, err)

		last, err := repo.LastCommentAt(ctx, session.ID, liveCustomerID)
		require.NoError(t, err)
		assert.Nil(t, last)

		c, err := repo.InsertComment(ctx, session.ID, liveCustomerID, "Còn hàng không?")
		require.NoError(t, err)
		assert.Equal(t, "Nguyễn Lan", c.AuthorName, "default address recipient name is preferred")
		assert.Equal(t, "customer", c.AuthorRole)
		assert.False(t, c.Hidden)

		last, err = repo.LastCommentAt(ctx, session.ID, liveCustomerID)
		require.NoError(t, err)
		require.NotNil(t, last)
		assert.WithinDuration(t, c.CreatedAt, *last, time.Millisecond)

		hidden, err := repo.HideComment(ctx, c.ID)
		require.NoError(t, err)
		assert.True(t, hidden.Hidden)
		again, err := repo.HideComment(ctx, c.ID)
		require.NoError(t, err)
		assert.True(t, again.Hidden)

		_, err = repo.HideComment(ctx, "99999999-0000-0000-0000-000000000000")
		require.ErrorIs(t, err, domain.ErrLiveCommentNotFound)
	})

	t.Run("recent comments are oldest first, limited, and may exclude hidden ones", func(t *testing.T) {
		reset(t)
		session, err := repo.CreateSession(ctx, "Flash sale", liveAdminID, nil)
		require.NoError(t, err)
		_, err = conn.Exec(ctx, `INSERT INTO live_comments (session_id, user_id, content, created_at, hidden_at) VALUES
			($1, $2, 'first', now() - interval '3 minutes', NULL),
			($1, $3, 'hidden', now() - interval '2 minutes', now()),
			($1, $4, 'shop reply', now() - interval '1 minute', NULL)`,
			session.ID, liveCustomerID, liveCustomer2, liveAdminID)
		require.NoError(t, err)

		visible, err := repo.ListRecentComments(ctx, session.ID, false, 50)
		require.NoError(t, err)
		require.Len(t, visible, 2)
		assert.Equal(t, "first", visible[0].Content)
		assert.Equal(t, "lan", visible[0].AuthorName, "falls back to the email local part")
		assert.Equal(t, "customer", visible[0].AuthorRole)
		assert.Equal(t, domain.LiveShopAuthorName, visible[1].AuthorName)
		assert.Equal(t, "admin", visible[1].AuthorRole)

		all, err := repo.ListRecentComments(ctx, session.ID, true, 2)
		require.NoError(t, err)
		require.Len(t, all, 2)
		assert.Equal(t, "hidden", all[0].Content)
		assert.True(t, all[0].Hidden)

		count, err := repo.CountComments(ctx, session.ID)
		require.NoError(t, err)
		assert.EqualValues(t, 3, count)
	})
}
