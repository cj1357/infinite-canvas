package service

import (
	"errors"
	"fmt"
	"strings"

	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/repository"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type ReferenceService struct {
	repo *repository.Repository
}

type ReferenceSetInput struct {
	ProjectID    string         `json:"projectId"`
	Title        string         `json:"title"`
	Description  string         `json:"description"`
	Source       string         `json:"source"`
	MetadataJSON datatypes.JSON `json:"metadataJson"`
}

type ReferenceIntentInput struct {
	AssetID       string         `json:"assetId"`
	MediaObjectID string         `json:"mediaObjectId"`
	Role          string         `json:"role"`
	Weight        float64        `json:"weight"`
	Enabled       bool           `json:"enabled"`
	SortOrder     int            `json:"sortOrder"`
	Note          string         `json:"note"`
	CropJSON      datatypes.JSON `json:"cropJson"`
	AnalysisJSON  datatypes.JSON `json:"analysisJson"`
	Confirmed     bool           `json:"confirmed"`
	MetadataJSON  datatypes.JSON `json:"metadataJson"`
}

type ReferenceSetDetail struct {
	ReferenceSet model.ReferenceSet    `json:"referenceSet"`
	Intents      []model.ReferenceIntent `json:"intents"`
}

type CompileReferenceSetPreviewInput struct {
	Prompt  string         `json:"prompt"`
	Locale  string         `json:"locale"`
	Ability string         `json:"ability"`
	Model   string         `json:"model"`
	Params  map[string]any `json:"params"`
}

type CompileReferenceSetPreviewOutput struct {
	CompiledPrompt        string                  `json:"compiledPrompt"`
	CompiledReferenceJSON map[string]any          `json:"compiledReferenceJson"`
	Warnings              []string                `json:"warnings"`
	EnabledReferences     []model.ReferenceIntent `json:"enabledReferences"`
}

func NewReferenceService(repo *repository.Repository) *ReferenceService {
	return &ReferenceService{repo: repo}
}

func (s *ReferenceService) ListReferenceSets(userID string, q model.Query) (model.ListResult[model.ReferenceSet], error) {
	return s.repo.ListReferenceSets(userID, q)
}

func (s *ReferenceService) GetReferenceSet(userID string, id string) (ReferenceSetDetail, error) {
	item, err := s.repo.GetReferenceSet(userID, id)
	if err != nil {
		return ReferenceSetDetail{}, err
	}
	intents, err := s.repo.ListUserReferenceIntents(userID, id)
	return ReferenceSetDetail{ReferenceSet: item, Intents: intents}, err
}

func (s *ReferenceService) CreateReferenceSet(userID string, input ReferenceSetInput) (model.ReferenceSet, error) {
	if strings.TrimSpace(input.Title) == "" {
		return model.ReferenceSet{}, errors.New("参考图集合标题不能为空")
	}
	item := model.ReferenceSet{
		UserID:       userID,
		ProjectID:    input.ProjectID,
		Title:        strings.TrimSpace(input.Title),
		Description:  input.Description,
		Source:       defaultString(input.Source, "canvas"),
		MetadataJSON: jsonObject(input.MetadataJSON),
	}
	return item, s.repo.SaveReferenceSet(&item)
}

func (s *ReferenceService) UpdateReferenceSet(userID string, id string, input ReferenceSetInput) (model.ReferenceSet, error) {
	item, err := s.repo.GetReferenceSet(userID, id)
	if err != nil {
		return item, err
	}
	if strings.TrimSpace(input.Title) != "" {
		item.Title = strings.TrimSpace(input.Title)
	}
	item.ProjectID = input.ProjectID
	item.Description = input.Description
	if input.Source != "" {
		item.Source = input.Source
	}
	item.MetadataJSON = jsonObject(input.MetadataJSON)
	return item, s.repo.SaveReferenceSet(&item)
}

func (s *ReferenceService) CreateReferenceIntent(userID string, referenceSetID string, input ReferenceIntentInput) (model.ReferenceIntent, error) {
	if _, err := s.repo.GetReferenceSet(userID, referenceSetID); err != nil {
		return model.ReferenceIntent{}, err
	}
	if input.Role == "" {
		input.Role = "subject"
	}
	if input.Weight == 0 {
		input.Weight = 1
	}
	if err := s.validateIntent(userID, input); err != nil {
		return model.ReferenceIntent{}, err
	}
	item := model.ReferenceIntent{
		UserID:         userID,
		ReferenceSetID: referenceSetID,
		AssetID:        input.AssetID,
		MediaObjectID:  input.MediaObjectID,
		Role:           input.Role,
		Weight:         input.Weight,
		Enabled:        input.Enabled,
		SortOrder:      input.SortOrder,
		Note:           input.Note,
		CropJSON:       jsonObject(input.CropJSON),
		AnalysisJSON:   jsonObject(input.AnalysisJSON),
		Confirmed:      input.Confirmed,
		MetadataJSON:   jsonObject(input.MetadataJSON),
	}
	return item, s.repo.SaveReferenceIntent(&item)
}

func (s *ReferenceService) UpdateReferenceIntent(userID string, id string, input ReferenceIntentInput) (model.ReferenceIntent, error) {
	item, err := s.repo.GetReferenceIntent(userID, id)
	if err != nil {
		return item, err
	}
	if input.Role == "" {
		input.Role = item.Role
	}
	if input.Weight == 0 {
		input.Weight = item.Weight
	}
	if input.Weight == 0 {
		input.Weight = 1
	}
	if err := s.validateIntent(userID, input); err != nil {
		return item, err
	}
	item.AssetID = input.AssetID
	item.MediaObjectID = input.MediaObjectID
	item.Role = input.Role
	item.Weight = input.Weight
	item.Enabled = input.Enabled
	item.SortOrder = input.SortOrder
	item.Note = input.Note
	item.CropJSON = jsonObject(input.CropJSON)
	item.AnalysisJSON = jsonObject(input.AnalysisJSON)
	item.Confirmed = input.Confirmed
	item.MetadataJSON = jsonObject(input.MetadataJSON)
	return item, s.repo.SaveReferenceIntent(&item)
}

func (s *ReferenceService) CompileReferenceSetPreview(userID string, referenceSetID string, input CompileReferenceSetPreviewInput) (CompileReferenceSetPreviewOutput, error) {
	set, err := s.repo.GetReferenceSet(userID, referenceSetID)
	if err != nil {
		return CompileReferenceSetPreviewOutput{}, err
	}
	intents, err := s.repo.ListUserReferenceIntents(userID, referenceSetID)
	if err != nil {
		return CompileReferenceSetPreviewOutput{}, err
	}
	enabled := make([]model.ReferenceIntent, 0, len(intents))
	for _, item := range intents {
		if item.Enabled {
			enabled = append(enabled, item)
		}
	}
	warnings := s.compileWarnings(input, len(enabled))
	lines := []string{strings.TrimSpace(input.Prompt)}
	if len(enabled) > 0 {
		if strings.HasPrefix(strings.ToLower(input.Locale), "en") {
			lines = append(lines, "", "Reference instructions:")
		} else {
			lines = append(lines, "", "参考图要求:")
		}
	}
	references := make([]map[string]any, 0, len(enabled))
	for index, item := range enabled {
		lines = append(lines, fmt.Sprintf("%d. %s: %s Weight %.2f. %s", index+1, roleInstruction(input.Locale, item.Role), mediaRef(item), item.Weight, item.Note))
		references = append(references, map[string]any{
			"id":            item.ID,
			"role":          item.Role,
			"weight":        item.Weight,
			"assetId":       item.AssetID,
			"mediaObjectId": item.MediaObjectID,
			"note":          item.Note,
			"crop":          item.CropJSON,
		})
	}
	compiledReference := map[string]any{
		"referenceSetId": set.ID,
		"title":          set.Title,
		"references":     references,
	}
	return CompileReferenceSetPreviewOutput{
		CompiledPrompt:        strings.TrimSpace(strings.Join(lines, "\n")),
		CompiledReferenceJSON: compiledReference,
		Warnings:              warnings,
		EnabledReferences:     enabled,
	}, nil
}

func (s *ReferenceService) validateIntent(userID string, input ReferenceIntentInput) error {
	if !validReferenceRole(input.Role) {
		return errors.New("参考图角色无效")
	}
	if input.MediaObjectID == "" && input.AssetID == "" {
		return errors.New("参考图必须绑定媒体或素材")
	}
	if input.Weight < 0.1 || input.Weight > 2 {
		return errors.New("参考图权重必须在 0.1 到 2 之间")
	}
	if input.SortOrder < 0 {
		return errors.New("排序不能为负数")
	}
	if input.MediaObjectID != "" {
		if _, err := s.repo.GetMediaObject(userID, input.MediaObjectID); err != nil {
			return err
		}
	}
	if input.AssetID != "" {
		if _, err := s.repo.GetCreativeAsset(userID, input.AssetID); err != nil {
			return err
		}
	}
	return nil
}

func (s *ReferenceService) compileWarnings(input CompileReferenceSetPreviewInput, references int) []string {
	modelName := input.Model
	if modelName == "" {
		modelName = "default"
	}
	ability := input.Ability
	if ability == "" {
		ability = "image"
	}
	capability, err := s.repo.FindModelCapability(modelName, ability)
	if errors.Is(err, gorm.ErrRecordNotFound) && modelName != "default" {
		capability, err = s.repo.FindModelCapability("default", ability)
	}
	if err != nil || capability.MaxReferences <= 0 || references <= capability.MaxReferences {
		return nil
	}
	return []string{fmt.Sprintf("当前模型最多支持 %d 张参考图，已启用 %d 张", capability.MaxReferences, references)}
}

func validReferenceRole(role string) bool {
	switch role {
	case "", "subject", "style", "composition", "element":
		return true
	default:
		return false
	}
}

func roleInstruction(locale string, role string) string {
	if strings.HasPrefix(strings.ToLower(locale), "en") {
		switch role {
		case "style":
			return "Use this image as style reference"
		case "composition":
			return "Use this image as composition reference"
		case "element":
			return "Use this image as local element reference"
		default:
			return "Keep the subject consistent with this image"
		}
	}
	switch role {
	case "style":
		return "风格参考"
	case "composition":
		return "构图参考"
	case "element":
		return "局部元素参考"
	default:
		return "主体一致参考"
	}
}

func mediaRef(item model.ReferenceIntent) string {
	if item.MediaObjectID != "" {
		return "media:" + item.MediaObjectID
	}
	if item.AssetID != "" {
		return "asset:" + item.AssetID
	}
	return "unbound"
}

func jsonObject(value datatypes.JSON) datatypes.JSON {
	if len(value) == 0 || string(value) == "null" {
		return datatypes.JSON([]byte("{}"))
	}
	return value
}

func defaultString(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}
