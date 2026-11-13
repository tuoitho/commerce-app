package usermgmt

import (
	"context"
	"errors"
	"math"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

const (
	maxSearchLen = 100
	maxLimit     = 100
	maxReasonLen = 500

	invalidFilterMessage = "Giá trị lọc không hợp lệ"
)

type Dependencies struct {
	Repo domain.UserAdminRepository
}

type UseCase struct {
	repo domain.UserAdminRepository
}

func New(deps Dependencies) *UseCase {
	return &UseCase{repo: deps.Repo}
}

// ListInput carries already-parsed paging; the caller maps an unparseable
// page or limit to 0 so it is reported as invalid here.
type ListInput struct {
	Search string
	Role   string
	Status string
	Page   int
	Limit  int
}

type ListResult struct {
	Items []domain.UserListItem
	Total int64
}

func (uc *UseCase) List(ctx context.Context, in ListInput) (ListResult, error) {
	search := strings.TrimSpace(in.Search)

	fields := map[string]string{}
	if in.Page < 1 {
		fields["page"] = "must be a positive integer"
	}
	if in.Limit < 1 || in.Limit > maxLimit {
		fields["limit"] = "must be a positive integer between 1 and 100"
	}
	if utf8.RuneCountInString(search) > maxSearchLen {
		fields["search"] = "must be at most 100 characters"
	}
	if len(fields) > 0 {
		return ListResult{}, domain.NewValidationError(fields)
	}

	filterFields := map[string]string{}
	if in.Role != "" && in.Role != domain.RoleCustomer && in.Role != domain.RoleAdmin {
		filterFields["role"] = invalidFilterMessage
	}
	if in.Status != "" && in.Status != domain.UserStatusActive && in.Status != domain.UserStatusLocked {
		filterFields["status"] = invalidFilterMessage
	}
	if len(filterFields) > 0 {
		return ListResult{}, domain.NewFilterValidationError(filterFields)
	}

	// A page far past the end must still yield an empty page, so the offset
	// saturates instead of overflowing into a negative value.
	offset := math.MaxInt
	if in.Page-1 <= math.MaxInt/in.Limit {
		offset = (in.Page - 1) * in.Limit
	}
	items, total, err := uc.repo.ListUsers(ctx, domain.UserListFilter{
		Search: search,
		Role:   in.Role,
		Status: in.Status,
		Limit:  in.Limit,
		Offset: offset,
	})
	if err != nil {
		return ListResult{}, err
	}
	return ListResult{Items: items, Total: total}, nil
}

// isUserID accepts only the canonical 36-character uuid form; uuid.Parse also
// takes urn:uuid:, braced and undashed forms that PostgreSQL rejects.
func isUserID(id string) bool {
	if len(id) != 36 {
		return false
	}
	_, err := uuid.Parse(id)
	return err == nil
}

func (uc *UseCase) Get(ctx context.Context, id string) (*domain.UserAdminDetail, error) {
	if !isUserID(id) {
		return nil, domain.ErrUserNotFound
	}
	return uc.repo.GetUserDetail(ctx, id)
}

// errConcurrentStateChange reports an account that was neither lockable nor in
// a state explaining the refusal, which only happens when another request
// changed it between the conditional update and the re-read.
var errConcurrentStateChange = errors.New("user state changed concurrently")

func (uc *UseCase) Lock(ctx context.Context, id string, reason *string) (*domain.UserAdminDetail, error) {
	var normalized *string
	if reason != nil {
		trimmed := strings.TrimSpace(*reason)
		if utf8.RuneCountInString(trimmed) > maxReasonLen {
			return nil, domain.NewValidationError(map[string]string{"reason": "Lý do khóa tối đa 500 ký tự"})
		}
		if trimmed != "" {
			normalized = &trimmed
		}
	}
	if !isUserID(id) {
		return nil, domain.ErrUserNotFound
	}

	locked, err := uc.repo.LockCustomer(ctx, id, normalized)
	if err != nil {
		return nil, err
	}
	current, err := uc.repo.GetUserDetail(ctx, id)
	if err != nil {
		return nil, err
	}
	if locked {
		return current, nil
	}
	switch {
	case current.User.Role == domain.RoleAdmin:
		return nil, domain.ErrCannotLockAdmin
	case current.User.IsLocked():
		return nil, domain.ErrUserAlreadyLocked
	default:
		return nil, errConcurrentStateChange
	}
}

func (uc *UseCase) Unlock(ctx context.Context, id string) (*domain.UserAdminDetail, error) {
	if !isUserID(id) {
		return nil, domain.ErrUserNotFound
	}

	unlocked, err := uc.repo.UnlockUser(ctx, id)
	if err != nil {
		return nil, err
	}
	current, err := uc.repo.GetUserDetail(ctx, id)
	if err != nil {
		return nil, err
	}
	if !unlocked {
		return nil, domain.ErrUserNotLocked
	}
	return current, nil
}
