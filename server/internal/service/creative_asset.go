package service

import (
	"errors"
	"strings"

	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/repository"

	"gorm.io/datatypes"
)

type CreativeAssetService struct {
	repo *repository.Repository
}

type CreativeAssetInput struct {
	MediaObjectID              string         `json:"mediaObjectId"`
	Kind                       string         `json:"kind"`
	Title                      string         `json:"title"`
	Description                string         `json:"description"`
	TagsJSON                   datatypes.JSON `json:"tagsJson"`
	Favorite                   bool           `json:"favorite"`
	Rating                     int            `json:"rating"`
	DefaultReferenceIntentJSON datatypes.JSON `json:"defaultReferenceIntentJson"`
	LocalizedTextJSON          datatypes.JSON `json:"localizedTextJson"`
	MetadataJSON               datatypes.JSON `json:"metadataJson"`
}

func NewCreativeAssetService(repo *repository.Repository) *CreativeAssetService {
	return &CreativeAssetService{repo: repo}
}

func (s *CreativeAssetService) ListCreativeAssets(userID string, q model.Query) (model.ListResult[model.CreativeAsset], error) {
	return s.repo.ListCreativeAssets(userID, q)
}

func (s *CreativeAssetService) CreateCreativeAsset(userID string, input CreativeAssetInput) (model.CreativeAsset, error) {
	item, err := s.buildAsset(userID, model.CreativeAsset{}, input)
	if err != nil {
		return item, err
	}
	return item, s.repo.SaveCreativeAsset(&item)
}

func (s *CreativeAssetService) UpdateCreativeAsset(userID string, id string, input CreativeAssetInput) (model.CreativeAsset, error) {
	item, err := s.repo.GetCreativeAsset(userID, id)
	if err != nil {
		return item, err
	}
	item, err = s.buildAsset(userID, item, input)
	if err != nil {
		return item, err
	}
	return item, s.repo.SaveCreativeAsset(&item)
}

func (s *CreativeAssetService) DeleteCreativeAsset(userID string, id string) error {
	return s.repo.DeleteCreativeAsset(userID, id)
}

func (s *CreativeAssetService) SaveGenerationOutputAsAsset(userID string, outputID string, input CreativeAssetInput) (model.CreativeAsset, error) {
	output, err := s.repo.GetGenerationOutput(userID, outputID)
	if err != nil {
		return model.CreativeAsset{}, err
	}
	input.MediaObjectID = output.MediaObjectID
	if input.Title == "" {
		input.Title = "生成素材"
	}
	if input.Kind == "" {
		input.Kind = "image"
	}
	metadata := map[string]any{"generationOutputId": output.ID, "generationRunId": output.GenerationRunID}
	if len(input.MetadataJSON) == 0 {
		input.MetadataJSON = mustJSON(metadata)
	}
	return s.CreateCreativeAsset(userID, input)
}

func (s *CreativeAssetService) buildAsset(userID string, item model.CreativeAsset, input CreativeAssetInput) (model.CreativeAsset, error) {
	if strings.TrimSpace(input.Title) == "" && item.Title == "" {
		return item, errors.New("素材标题不能为空")
	}
	if input.MediaObjectID != "" {
		media, err := s.repo.GetMediaObject(userID, input.MediaObjectID)
		if err != nil {
			return item, err
		}
		item.MediaObjectID = input.MediaObjectID
		if input.Kind == "" {
			input.Kind = media.Kind
		}
	}
	if input.Kind == "" {
		input.Kind = item.Kind
	}
	if input.Kind == "" {
		input.Kind = "image"
	}
	item.UserID = userID
	item.Kind = input.Kind
	if strings.TrimSpace(input.Title) != "" {
		item.Title = strings.TrimSpace(input.Title)
	}
	item.Description = input.Description
	item.TagsJSON = jsonOrArray(input.TagsJSON)
	item.Favorite = input.Favorite
	item.Rating = input.Rating
	item.DefaultReferenceIntentJSON = jsonObject(input.DefaultReferenceIntentJSON)
	item.LocalizedTextJSON = jsonObject(input.LocalizedTextJSON)
	item.MetadataJSON = jsonObject(input.MetadataJSON)
	return item, nil
}
