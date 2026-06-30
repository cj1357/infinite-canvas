package repository

import (
	"errors"

	"infinite-canvas/server/internal/config"
	"infinite-canvas/server/internal/model"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type Repository struct {
	DB *gorm.DB
}

func Open(cfg config.Config) (*gorm.DB, error) {
	if cfg.DatabaseURL == "" {
		return nil, errors.New("DATABASE_URL 不能为空")
	}
	return gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{})
}

func New(db *gorm.DB) *Repository {
	return &Repository{DB: db}
}

func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&model.User{},
		&model.Session{},
		&model.CanvasProject{},
		&model.Asset{},
		&model.GenerationLog{},
		&model.MediaObject{},
		&model.UserCreditAccount{},
		&model.UsageRequest{},
		&model.CreditLedger{},
		&model.ModelRateRule{},
		&model.Plan{},
		&model.Order{},
		&model.PaymentEvent{},
		&model.NewAPIConfig{},
	)
}
