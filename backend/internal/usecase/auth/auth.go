package auth

import (
	"context"
	"errors"
	"net/mail"
	"strings"
	"time"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security"
	"commerce-backend/internal/security/jwt"
)

const (
	minPasswordLen = 8
	issuer         = "commerce-backend"
)

type Repositories struct {
	Users    domain.UserRepository
	Sessions domain.SessionRepository
}

type UseCase struct {
	repos                Repositories
	jwt                  *jwt.Manager
	accessTTL            time.Duration
	refreshTTL           time.Duration
	hashPassword         func(string) (string, error)
	checkPassword        func(string, string) bool
	generateRefreshToken func() (security.RefreshTokenPair, error)
}

type Dependencies struct {
	Repos                Repositories
	JWT                  *jwt.Manager
	AccessTTL            time.Duration
	RefreshTTL           time.Duration
	HashPassword         func(string) (string, error)
	CheckPassword        func(string, string) bool
	GenerateRefreshToken func() (security.RefreshTokenPair, error)
}

func New(deps Dependencies) *UseCase {
	return &UseCase{
		repos:                deps.Repos,
		jwt:                  deps.JWT,
		accessTTL:            deps.AccessTTL,
		refreshTTL:           deps.RefreshTTL,
		hashPassword:         deps.HashPassword,
		checkPassword:        deps.CheckPassword,
		generateRefreshToken: deps.GenerateRefreshToken,
	}
}

type Session struct {
	User          domain.UserPublic
	AccessToken   string
	RefreshToken  string
	RefreshExpiry time.Time
}

func (uc *UseCase) Register(ctx context.Context, email, password string) (*Session, error) {
	email = strings.TrimSpace(email)
	fields := validateCredentials(email, password)
	if len(fields) > 0 {
		return nil, domain.NewValidationError(fields)
	}

	passwordHash, err := uc.hashPassword(password)
	if err != nil {
		return nil, err
	}

	user, err := uc.repos.Users.Create(ctx, email, passwordHash, domain.RoleCustomer)
	if err != nil {
		return nil, err
	}

	return uc.issueSession(ctx, user)
}

func (uc *UseCase) Login(ctx context.Context, email, password string) (*Session, error) {
	user, err := uc.repos.Users.GetByEmail(ctx, strings.TrimSpace(email))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, domain.ErrInvalidCredentials
		}
		return nil, err
	}
	if !uc.checkPassword(password, user.PasswordHash) {
		return nil, domain.ErrInvalidCredentials
	}
	if user.IsLocked() {
		return nil, domain.ErrAccountLocked
	}
	return uc.issueSession(ctx, user)
}

func (uc *UseCase) Refresh(ctx context.Context, refreshToken string) (*Session, error) {
	token, user, err := uc.validRefreshToken(ctx, refreshToken)
	if err != nil {
		return nil, err
	}

	if err := uc.repos.Sessions.RevokeRefreshTokenByID(ctx, token.ID); err != nil {
		return nil, err
	}

	return uc.issueSession(ctx, user)
}

func (uc *UseCase) Logout(ctx context.Context, refreshToken string) error {
	if refreshToken == "" {
		return nil
	}
	token, _, err := uc.validRefreshToken(ctx, refreshToken)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidToken) {
			return nil
		}
		return err
	}
	return uc.repos.Sessions.RevokeRefreshTokenByID(ctx, token.ID)
}

func (uc *UseCase) Me(ctx context.Context, userID string) (domain.UserPublic, error) {
	user, err := uc.repos.Users.GetByID(ctx, userID)
	if err != nil {
		return domain.UserPublic{}, err
	}
	return user.Public(), nil
}

func (uc *UseCase) validRefreshToken(ctx context.Context, refreshToken string) (*domain.RefreshToken, *domain.User, error) {
	if refreshToken == "" {
		return nil, nil, domain.ErrInvalidToken
	}
	token, user, err := uc.repos.Sessions.GetRefreshTokenByHash(ctx, security.HashRefreshToken(refreshToken))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, nil, domain.ErrInvalidToken
		}
		return nil, nil, err
	}
	if token.RevokedAt != nil || token.ExpiresAt.Before(time.Now()) || user.IsLocked() {
		return nil, nil, domain.ErrInvalidToken
	}
	return token, user, nil
}

func (uc *UseCase) issueSession(ctx context.Context, user *domain.User) (*Session, error) {
	accessToken, err := uc.jwt.GenerateAccessToken(user.ID, user.Role, uc.accessTTL)
	if err != nil {
		return nil, err
	}

	pair, err := uc.generateRefreshToken()
	if err != nil {
		return nil, err
	}
	refreshExpiry := time.Now().Add(uc.refreshTTL)
	if _, err := uc.repos.Sessions.CreateRefreshToken(ctx, user.ID, pair.Hash, refreshExpiry); err != nil {
		return nil, err
	}

	return &Session{
		User:          user.Public(),
		AccessToken:   accessToken,
		RefreshToken:  pair.Plaintext,
		RefreshExpiry: refreshExpiry,
	}, nil
}

func validateCredentials(email, password string) map[string]string {
	fields := map[string]string{}
	if _, err := mail.ParseAddress(email); err != nil || !strings.Contains(email, "@") {
		fields["email"] = "must be a valid email address"
	}
	if len(password) < minPasswordLen {
		fields["password"] = "must be at least 8 characters"
	}
	return fields
}
