package domain

import (
	"context"
	"io"
	"regexp"
	"time"
)

const (
	MaxAvatarBytes        int64 = 5 * 1024 * 1024 // 5 MB
	MaxAvatarRequestBytes int64 = 6 * 1024 * 1024 // 6 MB multipart ceiling
	MaxDisplayNameRunes         = 80
	MinPasswordBytes            = 8
	MaxPasswordBytes            = 72
)

var (
	AccountPhoneRegex = regexp.MustCompile(`^0[0-9]{9,10}$`)
	AvatarKeyRegex    = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$`)
)

type UpdateProfileInput struct {
	DisplayName *string
	Phone       *string
}

type UploadAvatarInput struct {
	Reader              io.Reader
	Size                int64
	DeclaredContentType string
}

type ChangePasswordInput struct {
	CurrentPassword string
	NewPassword     string
}

type AccountSession struct {
	User          UserPublic
	AccessToken   string
	RefreshToken  string
	RefreshExpiry time.Time
}

type AvatarStore interface {
	PutObject(ctx context.Context, objectKey string, reader io.Reader, size int64, contentType string) error
	StatObject(ctx context.Context, objectKey string) (*ChatObjectInfo, error)
	GetObject(ctx context.Context, objectKey string) (io.ReadCloser, error)
	RemoveObject(ctx context.Context, objectKey string) error
}

type AccountRepository interface {
	GetByID(ctx context.Context, userID string) (*User, error)
	UpdateProfile(ctx context.Context, userID string, displayName, phone *string) (*User, error)
	UpdateAvatar(ctx context.Context, userID string, avatarKey *string) (*User, *string, error)
	ChangePasswordAndRotateSession(ctx context.Context, userID, passwordHash, newTokenHash string, expiresAt time.Time) (*User, error)
}
