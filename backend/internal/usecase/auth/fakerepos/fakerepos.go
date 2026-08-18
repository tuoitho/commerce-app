package fakerepos

import (
	"context"
	"fmt"
	"sync"
	"time"

	"commerce-backend/internal/domain"
)

type Users struct {
	mu   sync.Mutex
	byID map[string]*domain.User
	next int
}

func NewUsers() *Users {
	return &Users{byID: map[string]*domain.User{}, next: 1}
}

func (f *Users) Create(ctx context.Context, email, passwordHash, role string) (*domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, u := range f.byID {
		if u.Email == email {
			return nil, domain.ErrEmailInUse
		}
	}
	if role == "" {
		role = domain.RoleCustomer
	}
	id := fmt.Sprintf("%d", f.next)
	f.next++
	u := &domain.User{ID: id, Email: email, PasswordHash: passwordHash, Role: role, CreatedAt: time.Now(), UpdatedAt: time.Now()}
	f.byID[u.ID] = u
	return u, nil
}

func (f *Users) CountByRole(ctx context.Context, role string) (int64, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var count int64
	for _, u := range f.byID {
		if u.Role == role {
			count++
		}
	}
	return count, nil
}

func (f *Users) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, u := range f.byID {
		if u.Email == email {
			return u, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (f *Users) GetByID(ctx context.Context, id string) (*domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if u, ok := f.byID[id]; ok {
		return u, nil
	}
	return nil, domain.ErrNotFound
}

func (f *Users) ByID(id string) *domain.User {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.byID[id]
}

type Sessions struct {
	mu     sync.Mutex
	byHash map[string]*domain.RefreshToken
	byID   map[string]*domain.RefreshToken
	Users  *Users
	next   int
}

func NewSessions(users *Users) *Sessions {
	return &Sessions{
		byHash: map[string]*domain.RefreshToken{},
		byID:   map[string]*domain.RefreshToken{},
		Users:  users,
		next:   1,
	}
}

func (f *Sessions) CreateRefreshToken(ctx context.Context, userID, tokenHash string, expiresAt time.Time) (*domain.RefreshToken, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	id := fmt.Sprintf("t%d", f.next)
	f.next++
	t := &domain.RefreshToken{ID: id, UserID: userID, TokenHash: tokenHash, ExpiresAt: expiresAt, CreatedAt: time.Now()}
	f.byHash[t.TokenHash] = t
	f.byID[t.ID] = t
	return t, nil
}

func (f *Sessions) GetRefreshTokenByHash(ctx context.Context, tokenHash string) (*domain.RefreshToken, *domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	t, ok := f.byHash[tokenHash]
	if !ok {
		return nil, nil, domain.ErrNotFound
	}
	u, ok := f.Users.byID[t.UserID]
	if !ok {
		return nil, nil, domain.ErrNotFound
	}
	return t, u, nil
}

func (f *Sessions) RevokeRefreshTokenByID(ctx context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if t, ok := f.byID[id]; ok {
		now := time.Now()
		t.RevokedAt = &now
	}
	return nil
}

func (f *Sessions) RevokeRefreshTokensByUserID(ctx context.Context, userID string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	now := time.Now()
	for _, t := range f.byHash {
		if t.UserID == userID && t.RevokedAt == nil {
			t.RevokedAt = &now
		}
	}
	return nil
}

var _ domain.UserRepository = (*Users)(nil)
var _ domain.SessionRepository = (*Sessions)(nil)
