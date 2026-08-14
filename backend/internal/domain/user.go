package domain

import "time"

type User struct {
	ID           string
	Email        string
	PasswordHash string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (u *User) Public() UserPublic {
	return UserPublic{ID: u.ID, Email: u.Email}
}

type UserPublic struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}
