package model

import "time"

type UserRole string
type UserStatus string

const (
	UserRoleUser  UserRole = "user"
	UserRoleAdmin UserRole = "admin"

	UserStatusActive   UserStatus = "active"
	UserStatusDisabled UserStatus = "disabled"
)

type User struct {
	BaseModel
	Email        string     `json:"email" gorm:"uniqueIndex;size:191;not null"`
	Username     string     `json:"username" gorm:"uniqueIndex;size:80;not null"`
	DisplayName  string     `json:"displayName" gorm:"size:80"`
	AvatarURL    string     `json:"avatarUrl" gorm:"size:500"`
	PasswordHash string     `json:"-" gorm:"size:120;not null"`
	Role         UserRole   `json:"role" gorm:"size:20;not null;default:user"`
	Status       UserStatus `json:"status" gorm:"size:20;not null;default:active"`
	LastLoginAt  *time.Time `json:"lastLoginAt"`
}

type Session struct {
	BaseModel
	UserID    string     `json:"userId" gorm:"index;size:36;not null"`
	TokenHash string     `json:"-" gorm:"uniqueIndex;size:64;not null"`
	ExpiresAt time.Time  `json:"expiresAt" gorm:"index;not null"`
	RevokedAt *time.Time `json:"revokedAt" gorm:"index"`
	User      User       `json:"-" gorm:"foreignKey:UserID"`
}
