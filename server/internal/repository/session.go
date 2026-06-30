package repository

import (
	"time"

	"infinite-canvas/server/internal/model"
)

func (r *Repository) CreateSession(session *model.Session) error {
	return r.DB.Create(session).Error
}

func (r *Repository) FindActiveSessionByHash(tokenHash string, now time.Time) (model.Session, error) {
	var session model.Session
	err := r.DB.Preload("User").
		Where("token_hash = ? AND expires_at > ? AND revoked_at IS NULL", tokenHash, now).
		First(&session).Error
	return session, err
}

func (r *Repository) RevokeSession(tokenHash string, now time.Time) error {
	return r.DB.Model(&model.Session{}).
		Where("token_hash = ? AND revoked_at IS NULL", tokenHash).
		Update("revoked_at", now).Error
}
