package security

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
)

const refreshTokenBytes = 32

type RefreshTokenPair struct {
	Plaintext string
	Hash      string
}

func GenerateRefreshToken() (RefreshTokenPair, error) {
	raw := make([]byte, refreshTokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return RefreshTokenPair{}, err
	}
	plaintext := base64.RawURLEncoding.EncodeToString(raw)
	return RefreshTokenPair{
		Plaintext: plaintext,
		Hash:      HashRefreshToken(plaintext),
	}, nil
}

func HashRefreshToken(plaintext string) string {
	sum := sha256.Sum256([]byte(plaintext))
	return hex.EncodeToString(sum[:])
}
