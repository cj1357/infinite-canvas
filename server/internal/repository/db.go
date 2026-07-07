package repository

import (
	"errors"

	"infinite-canvas/server/internal/config"
	"infinite-canvas/server/internal/model"

	"gorm.io/datatypes"
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
	if err := db.AutoMigrate(
		&model.User{},
		&model.Session{},
		&model.CanvasProject{},
		&model.Asset{},
		&model.GenerationLog{},
		&model.MediaObject{},
		&model.CreativeAsset{},
		&model.ReferenceSet{},
		&model.ReferenceIntent{},
		&model.GenerationRun{},
		&model.GenerationOutput{},
		&model.GenerationJob{},
		&model.UserCreditAccount{},
		&model.UsageRequest{},
		&model.CreditLedger{},
		&model.ModelRateRule{},
		&model.ModelCapability{},
		&model.PromptTemplate{},
		&model.AgentSession{},
		&model.AgentMessage{},
		&model.AgentToolCall{},
		&model.Plan{},
		&model.Order{},
		&model.PaymentEvent{},
		&model.NewAPIConfig{},
	); err != nil {
		return err
	}
	return seedModelCapabilities(db)
}

func seedModelCapabilities(db *gorm.DB) error {
	var count int64
	if err := db.Model(&model.ModelCapability{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	return db.Create(&model.ModelCapability{
		Model:                     "default",
		DisplayNameJSON:           datatypes.JSON([]byte(`{"zh-CN":"默认模型","en-US":"Default model"}`)),
		Ability:                   "image",
		ModelFamily:               "generic",
		MaxReferences:             4,
		MaxOutputs:                4,
		SupportedRatiosJSON:      datatypes.JSON([]byte(`["1:1","3:4","4:3","9:16","16:9"]`)),
		SupportedResolutionsJSON: datatypes.JSON([]byte(`["1024x1024"]`)),
		Enabled:                  true,
		RecommendedRolesJSON:     datatypes.JSON([]byte(`["subject","style","composition","element"]`)),
		MetadataJSON:             datatypes.JSON([]byte(`{}`)),
	}).Error
}
