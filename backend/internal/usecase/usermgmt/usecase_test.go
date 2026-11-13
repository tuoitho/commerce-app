package usermgmt

import (
	"context"
	"errors"
	"math"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
)

type fakeRepo struct {
	listCalls  int
	lastFilter domain.UserListFilter
	items      []domain.UserListItem
	total      int64
	detailID   string
	detail     *domain.UserAdminDetail
	detailErr  error
}

func (f *fakeRepo) ListUsers(ctx context.Context, filter domain.UserListFilter) ([]domain.UserListItem, int64, error) {
	f.listCalls++
	f.lastFilter = filter
	return f.items, f.total, nil
}

func (f *fakeRepo) LockCustomer(ctx context.Context, id string, reason *string) (bool, error) {
	return false, nil
}

func (f *fakeRepo) UnlockUser(ctx context.Context, id string) (bool, error) {
	return false, nil
}

func (f *fakeRepo) GetUserDetail(ctx context.Context, id string) (*domain.UserAdminDetail, error) {
	f.detailID = id
	if f.detailErr != nil {
		return nil, f.detailErr
	}
	return f.detail, nil
}

const validUUID = "7b0c6c0e-8a5e-4c1b-9a3e-1f2d3c4b5a69"

// Requirement 3.1: search is trimmed and passed with role/status and paging.
func TestList_PassesNormalizedFilter(t *testing.T) {
	repo := &fakeRepo{items: []domain.UserListItem{{ID: "u1"}}, total: 41}
	uc := New(Dependencies{Repo: repo})

	res, err := uc.List(context.Background(), ListInput{Search: "  Khach@  ", Role: "customer", Status: "locked", Page: 3, Limit: 20})
	require.NoError(t, err)
	assert.Equal(t, domain.UserListFilter{Search: "Khach@", Role: "customer", Status: "locked", Limit: 20, Offset: 40}, repo.lastFilter)
	assert.Equal(t, int64(41), res.Total)
	assert.Len(t, res.Items, 1)
}

// Requirement 3.7: search is limited to 100 characters after trimming.
func TestList_SearchLength(t *testing.T) {
	uc := New(Dependencies{Repo: &fakeRepo{}})

	_, err := uc.List(context.Background(), ListInput{Search: " " + strings.Repeat("ạ", 100) + " ", Page: 1, Limit: 20})
	assert.NoError(t, err)

	_, err = uc.List(context.Background(), ListInput{Search: strings.Repeat("ạ", 101), Page: 1, Limit: 20})
	var ve *domain.ValidationError
	require.ErrorAs(t, err, &ve)
	assert.Contains(t, ve.Fields, "search")
}

// Requirement 2.7: invalid page and limit are validation errors, reported together with search.
func TestList_PagingValidation(t *testing.T) {
	repo := &fakeRepo{}
	uc := New(Dependencies{Repo: repo})

	for _, in := range []ListInput{{Page: 0, Limit: 20}, {Page: 1, Limit: 0}, {Page: 1, Limit: 101}} {
		_, err := uc.List(context.Background(), in)
		var ve *domain.ValidationError
		require.ErrorAs(t, err, &ve, "input %+v", in)
	}

	_, err := uc.List(context.Background(), ListInput{Page: 0, Limit: 101, Search: strings.Repeat("a", 101), Role: "x"})
	var ve *domain.ValidationError
	require.ErrorAs(t, err, &ve)
	assert.Contains(t, ve.Fields, "page")
	assert.Contains(t, ve.Fields, "limit")
	assert.Contains(t, ve.Fields, "search")
	assert.Zero(t, repo.listCalls)
}

// Requirement 3.6: role and status must be known values; empty means no filter.
func TestList_FilterValidation(t *testing.T) {
	repo := &fakeRepo{}
	uc := New(Dependencies{Repo: repo})

	_, err := uc.List(context.Background(), ListInput{Role: "owner", Status: "banned", Page: 1, Limit: 20})
	var fe *domain.FilterValidationError
	require.ErrorAs(t, err, &fe)
	assert.Equal(t, "Giá trị lọc không hợp lệ", fe.Fields["role"])
	assert.Equal(t, "Giá trị lọc không hợp lệ", fe.Fields["status"])
	assert.Zero(t, repo.listCalls)

	for _, in := range []ListInput{
		{Role: "", Status: "", Page: 1, Limit: 20},
		{Role: "admin", Status: "active", Page: 1, Limit: 20},
	} {
		_, err := uc.List(context.Background(), in)
		assert.NoError(t, err)
	}
}

// Requirement 4.4: a malformed id is a missing user and never reaches the repository.
func TestGet_MalformedIDIsNotFound(t *testing.T) {
	repo := &fakeRepo{}
	uc := New(Dependencies{Repo: repo})

	_, err := uc.Get(context.Background(), "not-a-uuid")
	assert.True(t, errors.Is(err, domain.ErrUserNotFound))
	assert.Empty(t, repo.detailID)
}

func TestGet_ReturnsRepositoryDetail(t *testing.T) {
	detail := &domain.UserAdminDetail{User: domain.User{ID: validUUID}}
	repo := &fakeRepo{detail: detail}
	uc := New(Dependencies{Repo: repo})

	got, err := uc.Get(context.Background(), validUUID)
	require.NoError(t, err)
	assert.Same(t, detail, got)

	repo.detailErr = domain.ErrUserNotFound
	_, err = uc.Get(context.Background(), validUUID)
	assert.ErrorIs(t, err, domain.ErrUserNotFound)
}

type lockRepo struct {
	fakeRepo
	lockCalls    int
	lockedReason *string
	lockOK       bool
	unlockCalls  int
	unlockOK     bool
}

func (f *lockRepo) LockCustomer(ctx context.Context, id string, reason *string) (bool, error) {
	f.lockCalls++
	f.lockedReason = reason
	return f.lockOK, nil
}

func (f *lockRepo) UnlockUser(ctx context.Context, id string) (bool, error) {
	f.unlockCalls++
	return f.unlockOK, nil
}

func detailWith(role, status string) *domain.UserAdminDetail {
	return &domain.UserAdminDetail{User: domain.User{ID: validUUID, Role: role, Status: status}}
}

// Requirement 5.2: the reason is trimmed, empty becomes nil, and the fresh detail is returned.
func TestLock_NormalizesReasonAndReturnsDetail(t *testing.T) {
	repo := &lockRepo{lockOK: true}
	repo.detail = detailWith(domain.RoleCustomer, domain.UserStatusLocked)
	uc := New(Dependencies{Repo: repo})

	reason := "  Spam đánh giá  "
	got, err := uc.Lock(context.Background(), validUUID, &reason)
	require.NoError(t, err)
	assert.Same(t, repo.detail, got)
	require.NotNil(t, repo.lockedReason)
	assert.Equal(t, "Spam đánh giá", *repo.lockedReason)

	blank := "   "
	_, err = uc.Lock(context.Background(), validUUID, &blank)
	require.NoError(t, err)
	assert.Nil(t, repo.lockedReason)

	_, err = uc.Lock(context.Background(), validUUID, nil)
	require.NoError(t, err)
	assert.Nil(t, repo.lockedReason)
}

// Requirement 5.10: reasons over 500 characters are rejected before any business check.
func TestLock_ReasonLength(t *testing.T) {
	repo := &lockRepo{lockOK: true}
	repo.detail = detailWith(domain.RoleCustomer, domain.UserStatusLocked)
	uc := New(Dependencies{Repo: repo})

	ok := " " + strings.Repeat("ạ", 500) + " "
	_, err := uc.Lock(context.Background(), validUUID, &ok)
	require.NoError(t, err)

	tooLong := strings.Repeat("ạ", 501)
	for _, id := range []string{validUUID, "not-a-uuid"} {
		_, err = uc.Lock(context.Background(), id, &tooLong)
		var ve *domain.ValidationError
		require.ErrorAs(t, err, &ve)
		assert.Equal(t, "Lý do khóa tối đa 500 ký tự", ve.Fields["reason"])
	}
	assert.Equal(t, 1, repo.lockCalls)
}

// Requirements 5.8, 5.9, 5.11: failed conditional lock is classified from the current account.
func TestLock_ClassifiesFailures(t *testing.T) {
	cases := []struct {
		name   string
		detail *domain.UserAdminDetail
		err    error
		want   error
	}{
		{"missing", nil, domain.ErrUserNotFound, domain.ErrUserNotFound},
		{"admin", detailWith(domain.RoleAdmin, domain.UserStatusActive), nil, domain.ErrCannotLockAdmin},
		{"already locked", detailWith(domain.RoleCustomer, domain.UserStatusLocked), nil, domain.ErrUserAlreadyLocked},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &lockRepo{lockOK: false}
			repo.detail = tc.detail
			repo.detailErr = tc.err
			uc := New(Dependencies{Repo: repo})
			_, err := uc.Lock(context.Background(), validUUID, nil)
			assert.ErrorIs(t, err, tc.want)
		})
	}

	repo := &lockRepo{}
	uc := New(Dependencies{Repo: repo})
	_, err := uc.Lock(context.Background(), "not-a-uuid", nil)
	assert.ErrorIs(t, err, domain.ErrUserNotFound)
	assert.Zero(t, repo.lockCalls)
}

// Requirements 6.2, 6.4, 6.5: unlock returns the detail or classifies the failure.
func TestUnlock(t *testing.T) {
	repo := &lockRepo{unlockOK: true}
	repo.detail = detailWith(domain.RoleCustomer, domain.UserStatusActive)
	uc := New(Dependencies{Repo: repo})
	got, err := uc.Unlock(context.Background(), validUUID)
	require.NoError(t, err)
	assert.Same(t, repo.detail, got)

	repo = &lockRepo{unlockOK: false}
	repo.detail = detailWith(domain.RoleAdmin, domain.UserStatusActive)
	uc = New(Dependencies{Repo: repo})
	_, err = uc.Unlock(context.Background(), validUUID)
	assert.ErrorIs(t, err, domain.ErrUserNotLocked)

	repo = &lockRepo{unlockOK: false}
	repo.detailErr = domain.ErrUserNotFound
	uc = New(Dependencies{Repo: repo})
	_, err = uc.Unlock(context.Background(), validUUID)
	assert.ErrorIs(t, err, domain.ErrUserNotFound)

	repo = &lockRepo{}
	uc = New(Dependencies{Repo: repo})
	_, err = uc.Unlock(context.Background(), "nope")
	assert.ErrorIs(t, err, domain.ErrUserNotFound)
	assert.Zero(t, repo.unlockCalls)
}

// Requirement 2.7: a page far past the end never overflows the offset.
func TestList_HugePageKeepsOffsetNonNegative(t *testing.T) {
	repo := &fakeRepo{}
	uc := New(Dependencies{Repo: repo})

	for _, page := range []int{107374184, math.MaxInt64} {
		_, err := uc.List(context.Background(), ListInput{Page: page, Limit: 100})
		require.NoError(t, err)
		assert.GreaterOrEqual(t, repo.lastFilter.Offset, 0, "page %d", page)
	}
}

// Requirement 4.4: only the canonical 36-character form reaches the repository.
func TestGet_NonCanonicalUUIDIsNotFound(t *testing.T) {
	repo := &lockRepo{lockOK: true, unlockOK: true}
	uc := New(Dependencies{Repo: repo})

	for _, id := range []string{"urn:uuid:" + validUUID, "{" + validUUID + "}", "x" + validUUID + "x", strings.ReplaceAll(validUUID, "-", "")} {
		_, err := uc.Get(context.Background(), id)
		assert.ErrorIs(t, err, domain.ErrUserNotFound, id)
		_, err = uc.Lock(context.Background(), id, nil)
		assert.ErrorIs(t, err, domain.ErrUserNotFound, id)
		_, err = uc.Unlock(context.Background(), id)
		assert.ErrorIs(t, err, domain.ErrUserNotFound, id)
	}
	assert.Empty(t, repo.detailID)
	assert.Zero(t, repo.lockCalls)
	assert.Zero(t, repo.unlockCalls)
}
