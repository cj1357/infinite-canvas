package service

import (
	"errors"

	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/repository"

	"gorm.io/datatypes"
)

type DataService struct {
	repo *repository.Repository
}

type CanvasProjectInput struct {
	Title        string         `json:"title"`
	Description  string         `json:"description"`
	DataJSON     datatypes.JSON `json:"dataJson"`
	MetadataJSON datatypes.JSON `json:"metadataJson"`
}

type AssetInput struct {
	Kind       string         `json:"kind"`
	Title      string         `json:"title"`
	StorageKey string         `json:"storageKey"`
	TagsJSON   datatypes.JSON `json:"tagsJson"`
	DataJSON   datatypes.JSON `json:"dataJson"`
}

type GenerationLogInput struct {
	ProjectID    string         `json:"projectId"`
	Ability      string         `json:"ability"`
	Model        string         `json:"model"`
	Status       string         `json:"status"`
	Prompt       string         `json:"prompt"`
	ResultJSON   datatypes.JSON `json:"resultJson"`
	ParamsJSON   datatypes.JSON `json:"paramsJson"`
	UsageID      string         `json:"usageId"`
	ErrorMessage string         `json:"errorMessage"`
}

type ImportLocalDataRequest struct {
	CanvasProjects []CanvasProjectInput `json:"canvasProjects"`
	Assets         []AssetInput         `json:"assets"`
	GenerationLogs []GenerationLogInput `json:"generationLogs"`
}

func NewDataService(repo *repository.Repository) *DataService {
	return &DataService{repo: repo}
}

func (s *DataService) ListCanvasProjects(userID string, q model.Query) (model.ListResult[model.CanvasProject], error) {
	return s.repo.ListCanvasProjects(userID, q)
}

func (s *DataService) CreateCanvasProject(userID string, input CanvasProjectInput) (model.CanvasProject, error) {
	if input.Title == "" {
		return model.CanvasProject{}, errors.New("画布标题不能为空")
	}
	item := model.CanvasProject{
		UserID:       userID,
		Title:        input.Title,
		Description:  input.Description,
		DataJSON:     jsonOrObject(input.DataJSON),
		MetadataJSON: jsonOrObject(input.MetadataJSON),
		Version:      1,
	}
	return item, s.repo.SaveCanvasProject(&item)
}

func (s *DataService) UpdateCanvasProject(userID string, id string, input CanvasProjectInput) (model.CanvasProject, error) {
	item, err := s.repo.GetCanvasProject(userID, id)
	if err != nil {
		return item, err
	}
	if input.Title != "" {
		item.Title = input.Title
	}
	item.Description = input.Description
	item.DataJSON = jsonOrObject(input.DataJSON)
	item.MetadataJSON = jsonOrObject(input.MetadataJSON)
	item.Version++
	return item, s.repo.SaveCanvasProject(&item)
}

func (s *DataService) DeleteCanvasProject(userID string, id string) error {
	return s.repo.DeleteCanvasProject(userID, id)
}

func (s *DataService) ListAssets(userID string, q model.Query) (model.ListResult[model.Asset], error) {
	return s.repo.ListAssets(userID, q)
}

func (s *DataService) CreateAsset(userID string, input AssetInput) (model.Asset, error) {
	if input.Kind == "" || input.Title == "" {
		return model.Asset{}, errors.New("素材类型和标题不能为空")
	}
	item := model.Asset{
		UserID:     userID,
		Kind:       input.Kind,
		Title:      input.Title,
		StorageKey: input.StorageKey,
		TagsJSON:   jsonOrArray(input.TagsJSON),
		DataJSON:   jsonOrObject(input.DataJSON),
	}
	return item, s.repo.SaveAsset(&item)
}

func (s *DataService) UpdateAsset(userID string, id string, input AssetInput) (model.Asset, error) {
	item, err := s.repo.GetAsset(userID, id)
	if err != nil {
		return item, err
	}
	if input.Kind != "" {
		item.Kind = input.Kind
	}
	if input.Title != "" {
		item.Title = input.Title
	}
	item.StorageKey = input.StorageKey
	item.TagsJSON = jsonOrArray(input.TagsJSON)
	item.DataJSON = jsonOrObject(input.DataJSON)
	return item, s.repo.SaveAsset(&item)
}

func (s *DataService) DeleteAsset(userID string, id string) error {
	return s.repo.DeleteAsset(userID, id)
}

func (s *DataService) ListGenerationLogs(userID string, q model.Query) (model.ListResult[model.GenerationLog], error) {
	return s.repo.ListGenerationLogs(userID, q)
}

func (s *DataService) CreateGenerationLog(userID string, input GenerationLogInput) (model.GenerationLog, error) {
	if input.Ability == "" {
		return model.GenerationLog{}, errors.New("ability 不能为空")
	}
	item := model.GenerationLog{
		UserID:       userID,
		ProjectID:    input.ProjectID,
		Ability:      input.Ability,
		Model:        input.Model,
		Status:       input.Status,
		Prompt:       input.Prompt,
		ResultJSON:   jsonOrObject(input.ResultJSON),
		ParamsJSON:   jsonOrObject(input.ParamsJSON),
		UsageID:      input.UsageID,
		ErrorMessage: input.ErrorMessage,
	}
	if item.Status == "" {
		item.Status = "completed"
	}
	return item, s.repo.SaveGenerationLog(&item)
}

func (s *DataService) DeleteGenerationLog(userID string, id string) error {
	return s.repo.DeleteGenerationLog(userID, id)
}

func (s *DataService) ImportLocalData(userID string, req ImportLocalDataRequest) (map[string]int, error) {
	result := map[string]int{"canvasProjects": 0, "assets": 0, "generationLogs": 0}
	for _, item := range req.CanvasProjects {
		if _, err := s.CreateCanvasProject(userID, item); err != nil {
			return result, err
		}
		result["canvasProjects"]++
	}
	for _, item := range req.Assets {
		if _, err := s.CreateAsset(userID, item); err != nil {
			return result, err
		}
		result["assets"]++
	}
	for _, item := range req.GenerationLogs {
		if _, err := s.CreateGenerationLog(userID, item); err != nil {
			return result, err
		}
		result["generationLogs"]++
	}
	return result, nil
}

func jsonOrObject(value datatypes.JSON) datatypes.JSON {
	if len(value) == 0 || string(value) == "null" {
		return datatypes.JSON([]byte("{}"))
	}
	return value
}

func jsonOrArray(value datatypes.JSON) datatypes.JSON {
	if len(value) == 0 || string(value) == "null" {
		return datatypes.JSON([]byte("[]"))
	}
	return value
}
