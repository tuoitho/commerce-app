package fakerepos

import (
	"context"
	"crypto/hmac"
	"fmt"
	"strings"
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
		if strings.EqualFold(u.Email, email) {
			return nil, domain.ErrEmailInUse
		}
	}
	if role == "" {
		role = domain.RoleCustomer
	}
	id := fmt.Sprintf("%d", f.next)
	f.next++
	u := &domain.User{ID: id, Email: email, PasswordHash: passwordHash, Role: role, Status: domain.UserStatusActive, CreatedAt: time.Now(), UpdatedAt: time.Now()}
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
		if strings.EqualFold(u.Email, email) {
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

func (f *Users) Lock(id string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if u, ok := f.byID[id]; ok {
		now := time.Now()
		u.Status = domain.UserStatusLocked
		u.LockedAt = &now
	}
}

func (f *Users) Unlock(id string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if u, ok := f.byID[id]; ok {
		u.Status = domain.UserStatusActive
		u.LockedAt = nil
		u.LockReason = nil
	}
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

func (f *Sessions) ActiveTokenCount(userID string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	count := 0
	for _, t := range f.byHash {
		if t.UserID == userID && t.RevokedAt == nil {
			count++
		}
	}
	return count
}

type PasswordResets struct {
	mu       sync.Mutex
	records  []*domain.PasswordResetOTPRecord
	Users    *Users
	Sessions *Sessions
	next     int
}

func NewPasswordResets(users *Users, sessions *Sessions) *PasswordResets {
	return &PasswordResets{
		Users:    users,
		Sessions: sessions,
		next:     1,
	}
}

var _ domain.PasswordResetRepository = (*PasswordResets)(nil)

func (f *PasswordResets) CreateChallenge(ctx context.Context, input domain.CreatePasswordResetInput) (*domain.CreatePasswordResetResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	recent := 0
	for _, r := range f.records {
		if strings.EqualFold(r.Email, input.Email) && !r.CreatedAt.Before(input.WindowStart) {
			recent++
		}
	}
	if recent >= input.MaxRequests {
		return nil, domain.ErrOTPRateLimited
	}

	now := time.Now()
	var userIDPtr *string
	var otpHashPtr *string
	var recipientEmail string
	shouldSend := false

	if user, err := f.Users.GetByEmail(ctx, input.Email); err == nil && !user.IsLocked() {
		uid := user.ID
		userIDPtr = &uid
		h := input.OTPHash
		otpHashPtr = &h
		recipientEmail = user.Email
		shouldSend = true

		for _, r := range f.records {
			if r.UserID != nil && *r.UserID == uid && r.ConsumedAt == nil {
				consumed := now
				r.ConsumedAt = &consumed
			}
		}
	}

	id := fmt.Sprintf("otp-%d", f.next)
	f.next++
	f.records = append(f.records, &domain.PasswordResetOTPRecord{
		ID:        id,
		Email:     input.Email,
		UserID:    userIDPtr,
		OTPHash:   otpHashPtr,
		Attempts:  0,
		ExpiresAt: input.ExpiresAt,
		CreatedAt: now,
	})

	return &domain.CreatePasswordResetResult{
		RecordID:       id,
		RecipientEmail: recipientEmail,
		ShouldSend:     shouldSend,
	}, nil
}

func (f *PasswordResets) DeleteChallenge(ctx context.Context, id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	for i, r := range f.records {
		if r.ID == id {
			f.records = append(f.records[:i], f.records[i+1:]...)
			return nil
		}
	}
	return nil
}

func (f *PasswordResets) VerifyAndResetPassword(ctx context.Context, input domain.VerifyPasswordResetInput) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	var latest *domain.PasswordResetOTPRecord
	for i := len(f.records) - 1; i >= 0; i-- {
		if strings.EqualFold(f.records[i].Email, input.Email) {
			latest = f.records[i]
			break
		}
	}
	if latest == nil || latest.ConsumedAt != nil || latest.UserID == nil || latest.OTPHash == nil || latest.Attempts >= input.MaxAttempts {
		return domain.ErrInvalidOrExpiredOTP
	}

	fail := func() error {
		latest.Attempts++
		if latest.Attempts >= input.MaxAttempts {
			consumed := time.Now()
			latest.ConsumedAt = &consumed
		}
		return domain.ErrInvalidOrExpiredOTP
	}

	if !latest.ExpiresAt.After(input.Now) {
		return fail()
	}

	f.Users.mu.Lock()
	user, ok := f.Users.byID[*latest.UserID]
	if !ok || user.IsLocked() {
		f.Users.mu.Unlock()
		return fail()
	}
	if !hmac.Equal([]byte(input.ExpectedOTPHash), []byte(*latest.OTPHash)) {
		f.Users.mu.Unlock()
		return fail()
	}
	user.PasswordHash = input.NewPasswordHash
	user.UpdatedAt = time.Now()
	f.Users.mu.Unlock()

	consumed := time.Now()
	latest.ConsumedAt = &consumed
	for _, r := range f.records {
		if r.UserID != nil && *r.UserID == user.ID && r.ConsumedAt == nil {
			r.ConsumedAt = &consumed
		}
	}
	return f.Sessions.RevokeRefreshTokensByUserID(ctx, user.ID)
}

func (f *PasswordResets) ExpireLatest(email string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for i := len(f.records) - 1; i >= 0; i-- {
		if strings.EqualFold(f.records[i].Email, email) {
			f.records[i].ExpiresAt = time.Now().Add(-time.Minute)
			return
		}
	}
}

func (f *PasswordResets) LatestRecord(email string) *domain.PasswordResetOTPRecord {
	f.mu.Lock()
	defer f.mu.Unlock()
	for i := len(f.records) - 1; i >= 0; i-- {
		if strings.EqualFold(f.records[i].Email, email) {
			cp := *f.records[i]
			return &cp
		}
	}
	return nil
}

func (f *PasswordResets) AgeAll(email string, delta time.Duration) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, r := range f.records {
		if strings.EqualFold(r.Email, email) {
			r.CreatedAt = r.CreatedAt.Add(-delta)
		}
	}
}

type SentOTPEmail struct {
	To  string
	OTP string
	TTL time.Duration
}

type FakeMailer struct {
	mu      sync.Mutex
	Sent    []SentOTPEmail
	NextErr error
}

var _ domain.Mailer = (*FakeMailer)(nil)

func NewFakeMailer() *FakeMailer {
	return &FakeMailer{}
}

func (m *FakeMailer) SendPasswordResetOTP(ctx context.Context, toEmail, otp string, ttl time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.NextErr != nil {
		return m.NextErr
	}
	m.Sent = append(m.Sent, SentOTPEmail{To: toEmail, OTP: otp, TTL: ttl})
	return nil
}

func (m *FakeMailer) LastOTP() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.Sent) == 0 {
		return ""
	}
	return m.Sent[len(m.Sent)-1].OTP
}

func (m *FakeMailer) SentCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.Sent)
}
