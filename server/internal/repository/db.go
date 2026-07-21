package repository

import (
	"encoding/json"
	"errors"

	"infinite-canvas/server/internal/config"
	"infinite-canvas/server/internal/model"

	"gorm.io/datatypes"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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
	items := []model.ModelCapability{
		{
			Model: "default", Ability: "image", ModelFamily: "generic",
			DisplayNameJSON: datatypes.JSON([]byte(`{"zh-CN":"默认模型","en-US":"Default model"}`)),
			MaxReferences:   4, MaxOutputs: 4,
			SupportedRatiosJSON:      datatypes.JSON([]byte(`["1:1","3:4","4:3","9:16","16:9"]`)),
			SupportedResolutionsJSON: datatypes.JSON([]byte(`["1024x1024"]`)),
			Enabled:                  true,
			RecommendedRolesJSON:     datatypes.JSON([]byte(`["subject","style","composition","element"]`)),
			MetadataJSON:             datatypes.JSON([]byte(`{}`)),
		},
		imageCapabilitySeed(
			"google/gemini-3.1-flash-lite-image",
			[]string{"1K"},
			[]string{"1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"},
		),
		imageCapabilitySeed(
			"google/gemini-3.1-flash-image",
			[]string{"512", "1K", "2K", "4K"},
			[]string{"1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"},
		),
		imageCapabilitySeed(
			"google/gemini-3-pro-image",
			[]string{"1K", "2K"},
			[]string{"1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"},
		),
	}
	return db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "model"}, {Name: "ability"}},
		DoNothing: true,
	}).Create(&items).Error
}

func imageCapabilitySeed(modelName string, resolutions []string, ratios []string) model.ModelCapability {
	resolutionsJSON, _ := json.Marshal(resolutions)
	ratiosJSON, _ := json.Marshal(ratios)
	return model.ModelCapability{
		Model: modelName, Ability: "image", ModelFamily: "gemini-image",
		DisplayNameJSON: datatypes.JSON([]byte(`{}`)),
		MaxReferences:   14, MaxOutputs: 1,
		SupportedRatiosJSON:      datatypes.JSON(ratiosJSON),
		SupportedResolutionsJSON: datatypes.JSON(resolutionsJSON),
		Enabled:                  true,
		RecommendedRolesJSON:     datatypes.JSON([]byte(`["subject","style","composition","element"]`)),
		MetadataJSON:             datatypes.JSON([]byte(`{"provider":"google-vertex"}`)),
	}
}
