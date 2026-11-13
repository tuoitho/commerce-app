package live

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
)

const (
	sessionID = "11111111-1111-1111-1111-111111111111"
	adminID   = "22222222-2222-2222-2222-222222222222"
	productA  = "aaaaaaaa-0000-0000-0000-00000000000a"
	productB  = "bbbbbbbb-0000-0000-0000-00000000000b"
	variantA1 = "aaaaaaaa-0000-0000-0000-0000000000a1"
	variantA2 = "aaaaaaaa-0000-0000-0000-0000000000a2"
	variantB1 = "bbbbbbbb-0000-0000-0000-0000000000b1"
)

var fixedNow = time.Date(2026, 11, 13, 10, 10, 0, 0, time.UTC)

func intPtr(v int) *int { return &v }

func newTestUseCase(repo *fakeRepo, media *fakeMedia, b *fakeBroadcaster) *UseCase {
	return New(Dependencies{
		Repo:            repo,
		Media:           media,
		Broadcaster:     b,
		Clock:           func() time.Time { return fixedNow },
		WebRTCPublicURL: "http://localhost:8889",
		HLSPublicURL:    "http://localhost:8888",
	})
}

func seedValidation(repo *fakeRepo) {
	repo.validation.Products[productA] = domain.LiveValidationProduct{ID: productA, Active: true}
	repo.validation.Products[productB] = domain.LiveValidationProduct{ID: productB, Active: false}
	repo.validation.Variants[variantA1] = domain.LiveValidationVariant{ID: variantA1, ProductID: productA, Active: true, RegularPriceVND: "1000000"}
	repo.validation.Variants[variantA2] = domain.LiveValidationVariant{ID: variantA2, ProductID: productA, Active: false, RegularPriceVND: "2000000"}
	repo.validation.Variants[variantB1] = domain.LiveValidationVariant{ID: variantB1, ProductID: productB, Active: true, RegularPriceVND: "3000000"}
}

func seedLiveSession(repo *fakeRepo) *domain.LiveSession {
	s := &domain.LiveSession{ID: sessionID, Title: "Flash sale", Status: domain.LiveStatusLive, CreatedBy: adminID, HeartCount: 42, PeakViewers: 7, StartedAt: time.Date(2026, 11, 13, 10, 0, 0, 0, time.UTC)}
	repo.sessions[sessionID] = s
	repo.products[sessionID] = []domain.LiveCatalogProduct{
		{ProductID: productA, Position: 0, Name: "Phone A", Brand: "Aura", ImageURL: "a.jpg", Active: true},
		{ProductID: productB, Position: 1, Name: "Phone B", Brand: "Aura", Active: false},
	}
	repo.variants[sessionID] = []domain.LiveCatalogVariant{
		{VariantID: variantA1, ProductID: productA, Active: true, StockQuantity: 5, RegularPriceVND: "1000000", HasLivePrice: true, LivePriceVND: "900000", Quota: intPtr(10), Sold: 3, LiveActive: true, OptionLabel: "128GB"},
		{VariantID: variantA2, ProductID: productA, Active: true, StockQuantity: 0, RegularPriceVND: "2000000", OptionLabel: "256GB"},
		{VariantID: variantB1, ProductID: productB, Active: true, StockQuantity: 5, RegularPriceVND: "3000000"},
	}
	repo.comments[sessionID] = []domain.LiveComment{
		{ID: "cccccccc-0000-0000-0000-000000000001", SessionID: sessionID, AuthorName: "Lan", AuthorRole: "customer", Content: "Còn hàng không?"},
		{ID: "cccccccc-0000-0000-0000-000000000002", SessionID: sessionID, AuthorName: "Minh", AuthorRole: "customer", Content: "spam", Hidden: true},
	}
	return s
}

func fieldsOf(t *testing.T, err error) map[string]string {
	t.Helper()
	var valErr *domain.ValidationError
	require.True(t, errors.As(err, &valErr), "error = %v, want validation error", err)
	return valErr.Fields
}

func TestCreate_ValidatesInput(t *testing.T) {
	tooMany := make([]domain.LiveProductInput, domain.LiveMaxProducts+1)
	for i := range tooMany {
		tooMany[i] = domain.LiveProductInput{ProductID: productA}
	}
	cases := []struct {
		name     string
		title    string
		products []domain.LiveProductInput
		field    string
		message  string
	}{
		{"empty title", "   ", nil, "title", "Tiêu đề phải từ 1 đến 120 ký tự"},
		{"title too long", strings.Repeat("á", 121), nil, "title", "Tiêu đề phải từ 1 đến 120 ký tự"},
		{"too many products", "Live", tooMany, "products", "Tối đa 50 sản phẩm"},
		{"unknown product", "Live", []domain.LiveProductInput{{ProductID: "99999999-0000-0000-0000-000000000000"}}, "products[0].productId", "Sản phẩm không tồn tại hoặc đã ngừng kinh doanh"},
		{"malformed product id", "Live", []domain.LiveProductInput{{ProductID: "nope"}}, "products[0].productId", "Sản phẩm không tồn tại hoặc đã ngừng kinh doanh"},
		{"inactive product", "Live", []domain.LiveProductInput{{ProductID: productB}}, "products[0].productId", "Sản phẩm không tồn tại hoặc đã ngừng kinh doanh"},
		{"duplicate product", "Live", []domain.LiveProductInput{{ProductID: productA}, {ProductID: productA}}, "products[1].productId", "Sản phẩm bị trùng"},
		{"variant of another product", "Live", []domain.LiveProductInput{{ProductID: productA, Variants: []domain.LiveVariantInput{{VariantID: variantB1, LivePriceVND: "1"}}}}, "products[0].variants[0].variantId", "Biến thể không thuộc sản phẩm hoặc đã ngừng kinh doanh"},
		{"inactive variant", "Live", []domain.LiveProductInput{{ProductID: productA, Variants: []domain.LiveVariantInput{{VariantID: variantA2, LivePriceVND: "1"}}}}, "products[0].variants[0].variantId", "Biến thể không thuộc sản phẩm hoặc đã ngừng kinh doanh"},
		{"duplicate variant", "Live", []domain.LiveProductInput{{ProductID: productA, Variants: []domain.LiveVariantInput{{VariantID: variantA1, LivePriceVND: "1"}, {VariantID: variantA1, LivePriceVND: "2"}}}}, "products[0].variants[1].variantId", "Biến thể bị trùng"},
		{"non integer price", "Live", []domain.LiveProductInput{{ProductID: productA, Variants: []domain.LiveVariantInput{{VariantID: variantA1, LivePriceVND: "1.5"}}}}, "products[0].variants[0].livePriceVnd", "Giá live phải là số nguyên dương"},
		{"zero price", "Live", []domain.LiveProductInput{{ProductID: productA, Variants: []domain.LiveVariantInput{{VariantID: variantA1, LivePriceVND: "0"}}}}, "products[0].variants[0].livePriceVnd", "Giá live phải là số nguyên dương"},
		{"price not below regular", "Live", []domain.LiveProductInput{{ProductID: productA, Variants: []domain.LiveVariantInput{{VariantID: variantA1, LivePriceVND: "1000000"}}}}, "products[0].variants[0].livePriceVnd", "Giá live phải nhỏ hơn giá thường"},
		{"quota too small", "Live", []domain.LiveProductInput{{ProductID: productA, Variants: []domain.LiveVariantInput{{VariantID: variantA1, LivePriceVND: "900000", Quota: intPtr(0)}}}}, "products[0].variants[0].quota", "Số suất phải từ 1 đến 100000"},
		{"quota too large", "Live", []domain.LiveProductInput{{ProductID: productA, Variants: []domain.LiveVariantInput{{VariantID: variantA1, LivePriceVND: "900000", Quota: intPtr(100001)}}}}, "products[0].variants[0].quota", "Số suất phải từ 1 đến 100000"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := newFakeRepo()
			seedValidation(repo)
			uc := newTestUseCase(repo, &fakeMedia{}, &fakeBroadcaster{})

			_, err := uc.Create(context.Background(), adminID, tc.title, tc.products)
			assert.Equal(t, tc.message, fieldsOf(t, err)[tc.field])
			assert.Empty(t, repo.calls, "nothing may be written for invalid input")
		})
	}
}

func TestCreate_MediaServerUnavailable(t *testing.T) {
	repo := newFakeRepo()
	uc := newTestUseCase(repo, &fakeMedia{pingErr: errBoom}, &fakeBroadcaster{})

	_, err := uc.Create(context.Background(), adminID, "Live", nil)
	require.ErrorIs(t, err, domain.ErrMediaServerUnavailable)
	assert.Empty(t, repo.calls)
}

func TestCreate_AlreadyActivePropagates(t *testing.T) {
	repo := newFakeRepo()
	repo.createErr = domain.ErrLivestreamAlreadyActive
	uc := newTestUseCase(repo, &fakeMedia{}, &fakeBroadcaster{})

	_, err := uc.Create(context.Background(), adminID, "Live", nil)
	require.ErrorIs(t, err, domain.ErrLivestreamAlreadyActive)
}

func TestCreate_ReturnsAdminSessionWithMedia(t *testing.T) {
	repo := newFakeRepo()
	seedValidation(repo)
	uc := newTestUseCase(repo, &fakeMedia{}, &fakeBroadcaster{})

	got, err := uc.Create(context.Background(), adminID, "  Flash sale  ", []domain.LiveProductInput{
		{ProductID: productA, Variants: []domain.LiveVariantInput{{VariantID: variantA1, LivePriceVND: "900000", Quota: intPtr(10)}}},
	})
	require.NoError(t, err)
	assert.Equal(t, "Flash sale", got.Title)
	require.NotNil(t, got.Media)
	assert.Equal(t, "http://localhost:8889/live/"+sessionID+"/whip", got.Media.WhipURL)
	assert.Equal(t, "http://localhost:8889/live/"+sessionID+"/whep", got.Media.WhepURL)
	assert.Equal(t, "http://localhost:8888/live/"+sessionID+"/index.m3u8", got.Media.HLSURL)
	require.Len(t, repo.created, 1)
	assert.Equal(t, domain.MoneyVND("900000"), repo.created[0].Variants[0].LivePriceVND)
}

func TestSessionView_BuildsCustomerProjection(t *testing.T) {
	repo := newFakeRepo()
	s := seedLiveSession(repo)
	s.PinnedProductID = strPtr(productA)
	uc := newTestUseCase(repo, &fakeMedia{}, &fakeBroadcaster{viewers: map[string]int{sessionID: 12}})

	view, err := uc.SessionView(context.Background(), sessionID)
	require.NoError(t, err)

	assert.Equal(t, 12, view.ViewerCount)
	assert.EqualValues(t, 42, view.HeartCount)
	require.Len(t, view.Products, 1, "inactive products are hidden")
	p := view.Products[0]
	assert.Equal(t, domain.MoneyVND("900000"), p.MinPriceVND)
	assert.Equal(t, domain.MoneyVND("2000000"), p.MaxPriceVND)
	assert.Equal(t, domain.MoneyVND("1000000"), p.RegularMinPriceVND)
	assert.Equal(t, domain.MoneyVND("2000000"), p.RegularMaxPriceVND)
	assert.True(t, p.HasLivePrice)
	assert.True(t, p.InStock)
	require.Len(t, p.LivePrices, 1)
	lp := p.LivePrices[0]
	assert.Equal(t, "128GB", lp.OptionLabel)
	assert.Equal(t, 3, lp.Sold)
	require.NotNil(t, lp.Remaining)
	assert.Equal(t, 7, *lp.Remaining)
	assert.True(t, lp.Active)
	require.NotNil(t, view.PinnedProductID)
	assert.Equal(t, productA, *view.PinnedProductID)
	require.Len(t, view.Comments, 1, "hidden comments are not shown to customers")
	require.NotNil(t, view.Media)
	assert.Empty(t, view.Media.WhipURL, "customers never receive the publish URL")
}

func TestSessionView_PinnedInactiveProductIsNull(t *testing.T) {
	repo := newFakeRepo()
	s := seedLiveSession(repo)
	s.PinnedProductID = strPtr(productB)
	uc := newTestUseCase(repo, &fakeMedia{}, &fakeBroadcaster{})

	view, err := uc.SessionView(context.Background(), sessionID)
	require.NoError(t, err)
	assert.Nil(t, view.PinnedProductID)
}

func TestSessionView_NotFoundAndMalformedID(t *testing.T) {
	uc := newTestUseCase(newFakeRepo(), &fakeMedia{}, &fakeBroadcaster{})
	_, err := uc.SessionView(context.Background(), "not-a-uuid")
	require.ErrorIs(t, err, domain.ErrLivestreamNotFound)
	_, err = uc.SessionView(context.Background(), "99999999-0000-0000-0000-000000000000")
	require.ErrorIs(t, err, domain.ErrLivestreamNotFound)
}

func TestEndedSession_CustomerAndAdminProjections(t *testing.T) {
	repo := newFakeRepo()
	s := seedLiveSession(repo)
	ended := time.Date(2026, 11, 13, 10, 30, 0, 0, time.UTC)
	reason := domain.LiveEndReasonAdmin
	s.Status, s.EndedAt, s.EndReason = domain.LiveStatusEnded, &ended, &reason
	repo.variants[sessionID][0].LiveActive = false
	uc := newTestUseCase(repo, &fakeMedia{}, &fakeBroadcaster{})

	view, err := uc.SessionView(context.Background(), sessionID)
	require.NoError(t, err)
	assert.Empty(t, view.Products)
	assert.Empty(t, view.Comments)
	assert.Nil(t, view.Media)
	assert.NotNil(t, view.Products, "empty lists serialize as []")

	admin, err := uc.AdminSession(context.Background(), sessionID)
	require.NoError(t, err)
	require.Len(t, admin.Products, 1)
	assert.False(t, admin.Products[0].LivePrices[0].Active)
	assert.Equal(t, 3, admin.Products[0].LivePrices[0].Sold)
	assert.Len(t, admin.Comments, 2, "admins see hidden comments")
	assert.EqualValues(t, 1800, admin.Summary.DurationSeconds)
	assert.Equal(t, 7, admin.Summary.PeakViewers)
	assert.EqualValues(t, 2, admin.Summary.CommentCount)
	assert.EqualValues(t, 42, admin.Summary.HeartCount)
	require.NotNil(t, admin.Summary.EndReason)
	assert.Equal(t, "admin", *admin.Summary.EndReason)
}

func TestCurrentSummary(t *testing.T) {
	repo := newFakeRepo()
	uc := newTestUseCase(repo, &fakeMedia{}, &fakeBroadcaster{})
	got, err := uc.CurrentSummary(context.Background())
	require.NoError(t, err)
	assert.Nil(t, got)

	seedLiveSession(repo)
	got, err = uc.CurrentSummary(context.Background())
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, sessionID, got.ID)
}

func TestReplaceProducts_ValidatesAgainstSoldAndBroadcasts(t *testing.T) {
	repo := newFakeRepo()
	seedValidation(repo)
	seedLiveSession(repo)
	repo.validation.Sold[variantA1] = 5
	b := &fakeBroadcaster{}
	uc := newTestUseCase(repo, &fakeMedia{}, b)

	_, err := uc.ReplaceProducts(context.Background(), sessionID, []domain.LiveProductInput{
		{ProductID: productA, Variants: []domain.LiveVariantInput{{VariantID: variantA1, LivePriceVND: "900000", Quota: intPtr(4)}}},
	})
	assert.Equal(t, "Số suất không được nhỏ hơn số đã bán (5)", fieldsOf(t, err)["products[0].variants[0].quota"])

	_, err = uc.ReplaceProducts(context.Background(), sessionID, []domain.LiveProductInput{
		{ProductID: productA, Variants: []domain.LiveVariantInput{{VariantID: variantA1, LivePriceVND: "900000", Quota: intPtr(5)}}},
	})
	require.NoError(t, err)
	events := b.eventsOf(domain.LiveEventProducts)
	require.Len(t, events, 1)
	payload := events[0].Payload.(domain.LiveProductsEvent)
	assert.Len(t, payload.Products, 1)
}

func TestReplaceProducts_EndedSession(t *testing.T) {
	repo := newFakeRepo()
	seedValidation(repo)
	s := seedLiveSession(repo)
	s.Status = domain.LiveStatusEnded
	uc := newTestUseCase(repo, &fakeMedia{}, &fakeBroadcaster{})

	_, err := uc.ReplaceProducts(context.Background(), sessionID, nil)
	require.ErrorIs(t, err, domain.ErrLivestreamEnded)
}

func TestSetPin(t *testing.T) {
	repo := newFakeRepo()
	seedLiveSession(repo)
	b := &fakeBroadcaster{}
	uc := newTestUseCase(repo, &fakeMedia{}, b)

	_, err := uc.SetPin(context.Background(), sessionID, strPtr(productB))
	assert.Equal(t, "Sản phẩm không thuộc giỏ hàng live", fieldsOf(t, err)["productId"], "inactive product cannot be pinned")

	got, err := uc.SetPin(context.Background(), sessionID, strPtr(productA))
	require.NoError(t, err)
	require.NotNil(t, got.PinnedProductID)
	assert.Equal(t, productA, *got.PinnedProductID)

	got, err = uc.SetPin(context.Background(), sessionID, nil)
	require.NoError(t, err)
	assert.Nil(t, got.PinnedProductID)
	assert.Len(t, b.eventsOf(domain.LiveEventProducts), 2)
}

func TestEnd_FlushesThenEndsThenAnnouncesThenCloses(t *testing.T) {
	repo := newFakeRepo()
	seedLiveSession(repo)
	b := &fakeBroadcaster{log: &repo.calls}
	uc := newTestUseCase(repo, &fakeMedia{}, b)

	got, err := uc.End(context.Background(), sessionID, domain.LiveEndReasonAdmin)
	require.NoError(t, err)
	assert.Equal(t, domain.LiveStatusEnded, got.Status)
	assert.Equal(t, []string{"flush", "end", "broadcast:" + domain.LiveEventEnded, "close"}, repo.calls)
	ended := b.eventsOf(domain.LiveEventEnded)[0].Payload.(domain.LiveEndedEvent)
	assert.Equal(t, domain.LiveEndReasonAdmin, ended.Reason)

	_, err = uc.End(context.Background(), sessionID, domain.LiveEndReasonAdmin)
	require.ErrorIs(t, err, domain.ErrLivestreamEnded)
}

func TestLiveQuotaChanged_BroadcastsForCurrentSession(t *testing.T) {
	repo := newFakeRepo()
	b := &fakeBroadcaster{}
	uc := newTestUseCase(repo, &fakeMedia{}, b)

	uc.LiveQuotaChanged(context.Background())
	assert.Empty(t, b.events)

	seedLiveSession(repo)
	uc.LiveQuotaChanged(context.Background())
	assert.Len(t, b.eventsOf(domain.LiveEventProducts), 1)
}

func strPtr(v string) *string { return &v }

func TestComment(t *testing.T) {
	const customerID = "33333333-3333-3333-3333-333333333333"
	setup := func() (*fakeRepo, *fakeBroadcaster, *UseCase, *time.Time) {
		repo := newFakeRepo()
		seedLiveSession(repo)
		repo.comments[sessionID] = nil
		b := &fakeBroadcaster{}
		now := fixedNow
		uc := New(Dependencies{Repo: repo, Media: &fakeMedia{}, Broadcaster: b, Clock: func() time.Time { return now }})
		return repo, b, uc, &now
	}

	t.Run("stores, trims and broadcasts", func(t *testing.T) {
		repo, b, uc, _ := setup()
		repo.now = fixedNow
		c, err := uc.Comment(context.Background(), sessionID, customerID, domain.RoleCustomer, "  Còn hàng không?  ")
		require.NoError(t, err)
		assert.Equal(t, "Còn hàng không?", c.Content)
		events := b.eventsOf(domain.LiveEventComment)
		require.Len(t, events, 1)
		assert.Equal(t, *c, events[0].Payload.(domain.LiveComment))
	})

	t.Run("content length is validated", func(t *testing.T) {
		_, _, uc, _ := setup()
		for _, content := range []string{"   ", strings.Repeat("á", 201)} {
			_, err := uc.Comment(context.Background(), sessionID, customerID, domain.RoleCustomer, content)
			assert.Equal(t, "Bình luận phải từ 1 đến 200 ký tự", fieldsOf(t, err)["content"])
		}
		_, err := uc.Comment(context.Background(), sessionID, customerID, domain.RoleCustomer, strings.Repeat("á", 200))
		require.NoError(t, err)
	})

	t.Run("customers must wait two seconds between comments", func(t *testing.T) {
		repo, _, uc, now := setup()
		repo.now = fixedNow
		_, err := uc.Comment(context.Background(), sessionID, customerID, domain.RoleCustomer, "một")
		require.NoError(t, err)
		*now = fixedNow.Add(1999 * time.Millisecond)
		_, err = uc.Comment(context.Background(), sessionID, customerID, domain.RoleCustomer, "hai")
		require.ErrorIs(t, err, domain.ErrRateLimited)
		*now = fixedNow.Add(2 * time.Second)
		_, err = uc.Comment(context.Background(), sessionID, customerID, domain.RoleCustomer, "ba")
		require.NoError(t, err)
	})

	t.Run("admins are not rate limited and are labelled as the shop", func(t *testing.T) {
		repo, _, uc, _ := setup()
		repo.now = fixedNow
		for i := 0; i < 3; i++ {
			c, err := uc.Comment(context.Background(), sessionID, adminID, domain.RoleAdmin, "Còn nhé")
			require.NoError(t, err)
			assert.Equal(t, domain.LiveShopAuthorName, c.AuthorName)
		}
	})

	t.Run("ended and unknown sessions", func(t *testing.T) {
		repo, _, uc, _ := setup()
		repo.sessions[sessionID].Status = domain.LiveStatusEnded
		_, err := uc.Comment(context.Background(), sessionID, customerID, domain.RoleCustomer, "hi")
		require.ErrorIs(t, err, domain.ErrLivestreamEnded)
		_, err = uc.Comment(context.Background(), "99999999-0000-0000-0000-000000000000", customerID, domain.RoleCustomer, "hi")
		require.ErrorIs(t, err, domain.ErrLivestreamNotFound)
	})
}

func TestHideComment(t *testing.T) {
	repo := newFakeRepo()
	seedLiveSession(repo)
	b := &fakeBroadcaster{}
	uc := newTestUseCase(repo, &fakeMedia{}, b)

	c, err := uc.HideComment(context.Background(), "cccccccc-0000-0000-0000-000000000001")
	require.NoError(t, err)
	assert.True(t, c.Hidden)
	events := b.eventsOf(domain.LiveEventCommentHidden)
	require.Len(t, events, 1)
	assert.Equal(t, sessionID, events[0].SessionID)
	assert.Equal(t, domain.LiveCommentHiddenEvent{CommentID: "cccccccc-0000-0000-0000-000000000001"}, events[0].Payload)

	_, err = uc.HideComment(context.Background(), "cccccccc-0000-0000-0000-000000000099")
	require.ErrorIs(t, err, domain.ErrLiveCommentNotFound)
}

func TestAuthorizeMedia(t *testing.T) {
	repo := newFakeRepo()
	seedLiveSession(repo)
	ended := &domain.LiveSession{ID: "33333333-0000-0000-0000-000000000000", Status: domain.LiveStatusEnded}
	repo.sessions[ended.ID] = ended
	uc := newTestUseCase(repo, &fakeMedia{}, &fakeBroadcaster{})

	cases := []struct {
		name   string
		action string
		path   string
		role   string
		want   bool
	}{
		{"admin publishes to the live session", "publish", "live/" + sessionID, domain.RoleAdmin, true},
		{"customer cannot publish", "publish", "live/" + sessionID, domain.RoleCustomer, false},
		{"customer reads the live session", "read", "live/" + sessionID, domain.RoleCustomer, true},
		{"admin reads the live session", "read", "live/" + sessionID, domain.RoleAdmin, true},
		{"ended session cannot be read", "read", "live/" + ended.ID, domain.RoleCustomer, false},
		{"ended session cannot be published", "publish", "live/" + ended.ID, domain.RoleAdmin, false},
		{"unknown session", "read", "live/99999999-0000-0000-0000-000000000000", domain.RoleCustomer, false},
		{"path outside live/", "read", "other/" + sessionID, domain.RoleCustomer, false},
		{"malformed id", "read", "live/abc", domain.RoleCustomer, false},
		{"other actions are refused", "playback", "live/" + sessionID, domain.RoleAdmin, false},
		{"api is refused", "api", "", domain.RoleAdmin, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := uc.AuthorizeMedia(context.Background(), tc.action, tc.path, tc.role)
			require.NoError(t, err)
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestCheckSignal(t *testing.T) {
	setup := func() (*fakeRepo, *fakeMedia, *fakeBroadcaster, *UseCase, *time.Time) {
		repo := newFakeRepo()
		seedLiveSession(repo) // started 10:00
		media := &fakeMedia{online: map[string]bool{}}
		b := &fakeBroadcaster{}
		now := time.Date(2026, 11, 13, 10, 0, 5, 0, time.UTC)
		uc := New(Dependencies{Repo: repo, Media: media, Broadcaster: b, Clock: func() time.Time { return now }, SignalTimeout: 10 * time.Minute})
		return repo, media, b, uc, &now
	}
	signals := func(b *fakeBroadcaster) []bool {
		var out []bool
		for _, e := range b.eventsOf(domain.LiveEventSignal) {
			out = append(out, e.Payload.(domain.LiveSignalEvent).Online)
		}
		return out
	}
	path := domain.LivePath(sessionID)

	t.Run("announces each change of the publisher state", func(t *testing.T) {
		repo, media, b, uc, now := setup()
		uc.CheckSignal(context.Background())
		assert.Empty(t, signals(b), "offline at start is the default state")

		media.online[path] = true
		uc.CheckSignal(context.Background())
		uc.CheckSignal(context.Background())
		require.NotNil(t, repo.sessions[sessionID].LastSignalAt)
		assert.Equal(t, *now, *repo.sessions[sessionID].LastSignalAt)

		view, err := uc.SessionView(context.Background(), sessionID)
		require.NoError(t, err)
		assert.True(t, view.SignalOnline)

		media.online[path] = false
		uc.CheckSignal(context.Background())
		media.online[path] = true
		uc.CheckSignal(context.Background())
		assert.Equal(t, []bool{true, false, true}, signals(b))
	})

	t.Run("media errors count as offline", func(t *testing.T) {
		_, media, b, uc, _ := setup()
		media.online[path] = true
		uc.CheckSignal(context.Background())
		media.onErr = errBoom
		uc.CheckSignal(context.Background())
		assert.Equal(t, []bool{true, false}, signals(b))
	})

	t.Run("ends the session after the timeout without signal", func(t *testing.T) {
		repo, media, b, uc, now := setup()
		media.online[path] = true
		uc.CheckSignal(context.Background()) // last signal 10:00:05
		media.online[path] = false

		*now = now.Add(10*time.Minute - time.Second)
		uc.CheckSignal(context.Background())
		assert.True(t, repo.sessions[sessionID].IsLive())

		*now = now.Add(time.Second)
		uc.CheckSignal(context.Background())
		assert.False(t, repo.sessions[sessionID].IsLive())
		require.NotNil(t, repo.sessions[sessionID].EndReason)
		assert.Equal(t, domain.LiveEndReasonSignalLost, *repo.sessions[sessionID].EndReason)
		ended := b.eventsOf(domain.LiveEventEnded)
		require.Len(t, ended, 1)
		assert.Equal(t, domain.LiveEndReasonSignalLost, ended[0].Payload.(domain.LiveEndedEvent).Reason)
	})

	t.Run("a session that never received signal times out from its start", func(t *testing.T) {
		repo, _, _, uc, now := setup()
		*now = repo.sessions[sessionID].StartedAt.Add(10 * time.Minute)
		uc.CheckSignal(context.Background())
		assert.False(t, repo.sessions[sessionID].IsLive())
	})

	t.Run("does not call the media server when nothing is live", func(t *testing.T) {
		repo, media, _, uc, _ := setup()
		repo.sessions[sessionID].Status = domain.LiveStatusEnded
		uc.CheckSignal(context.Background())
		assert.Zero(t, media.calls)
	})
}
