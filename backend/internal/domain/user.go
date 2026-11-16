package domain

import (
	"strings"
	"time"
)

const (
	RoleCustomer = "customer"
	RoleAdmin    = "admin"
)

const (
	UserStatusActive = "active"
	UserStatusLocked = "locked"
)

type User struct {
	ID           string
	Email        string
	PasswordHash string
	Role         string
	Status       string
	LockedAt     *time.Time
	LockReason   *string
	DisplayName  *string
	Phone        *string
	AvatarKey    *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (u *User) IsLocked() bool {
	return u.Status == UserStatusLocked
}

func (u *User) AvatarURL() *string {
	if u.AvatarKey == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*u.AvatarKey)
	if trimmed == "" {
		return nil
	}
	url := "/media/avatars/" + trimmed
	return &url
}

func (u *User) Public() UserPublic {
	return UserPublic{
		ID:          u.ID,
		Email:       u.Email,
		Role:        u.Role,
		DisplayName: u.DisplayName,
		Phone:       u.Phone,
		AvatarURL:   u.AvatarURL(),
	}
}

type UserPublic struct {
	ID          string  `json:"id"`
	Email       string  `json:"email"`
	Role        string  `json:"role"`
	DisplayName *string `json:"displayName"`
	Phone       *string `json:"phone"`
	AvatarURL   *string `json:"avatarUrl"`
}
