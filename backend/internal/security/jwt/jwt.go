package jwt

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var ErrInvalidToken = errors.New("invalid token")

type Manager struct {
	secret []byte
	issuer string
	now    func() time.Time
}

func NewManager(secret, issuer string) *Manager {
	return &Manager{secret: []byte(secret), issuer: issuer, now: time.Now}
}

type TokenClaims struct {
	jwt.RegisteredClaims
}

func (m *Manager) GenerateAccessToken(userID string, ttl time.Duration) (string, error) {
	now := m.now()
	claims := TokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			Issuer:    m.issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(m.secret)
}

func (m *Manager) ParseAccessToken(tokenStr string) (string, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &TokenClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return m.secret, nil
	}, jwt.WithIssuer(m.issuer), jwt.WithExpirationRequired())
	if err != nil {
		return "", ErrInvalidToken
	}
	claims, ok := token.Claims.(*TokenClaims)
	if !ok || !token.Valid || claims.Subject == "" {
		return "", ErrInvalidToken
	}
	return claims.Subject, nil
}