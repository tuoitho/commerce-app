package domain

import "time"

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
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (u *User) IsLocked() bool {
	return u.Status == UserStatusLocked
}

func (u *User) Public() UserPublic {
	return UserPublic{
		ID:    u.ID,
		Email: u.Email,
		Role:  u.Role,
	}
}

type UserPublic struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Role  string `json:"role"`
}
