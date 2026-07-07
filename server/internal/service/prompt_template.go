package service

import (
	"bytes"
	"text/template"

	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/repository"
)

type PromptTemplateService struct {
	repo *repository.Repository
}

type PromptTemplatePreviewInput struct {
	TemplateID string         `json:"templateId"`
	Content    string         `json:"content"`
	Variables  map[string]any `json:"variables"`
}

type PromptTemplatePreviewOutput struct {
	Content string `json:"content"`
}

func NewPromptTemplateService(repo *repository.Repository) *PromptTemplateService {
	return &PromptTemplateService{repo: repo}
}

func (s *PromptTemplateService) List(q model.Query) (model.ListResult[model.PromptTemplate], error) {
	return s.repo.ListPromptTemplates(q)
}

func (s *PromptTemplateService) Save(item *model.PromptTemplate) error {
	if item.Version <= 0 {
		item.Version = 1
	}
	return s.repo.SavePromptTemplate(item)
}

func (s *PromptTemplateService) SelectPromptTemplate(locale string, ability string, modelFamily string, templateKey string) (model.PromptTemplate, error) {
	return s.repo.FindPromptTemplate(locale, ability, modelFamily, templateKey)
}

func (s *PromptTemplateService) Preview(input PromptTemplatePreviewInput) (PromptTemplatePreviewOutput, error) {
	content := input.Content
	if input.TemplateID != "" {
		item, err := s.repo.GetPromptTemplate(input.TemplateID)
		if err != nil {
			return PromptTemplatePreviewOutput{}, err
		}
		content = item.Content
	}
	result, err := renderPromptTemplate(content, input.Variables)
	return PromptTemplatePreviewOutput{Content: result}, err
}

func renderPromptTemplate(content string, variables map[string]any) (string, error) {
	tpl, err := template.New("prompt").Option("missingkey=zero").Parse(content)
	if err != nil {
		return "", err
	}
	var output bytes.Buffer
	if err := tpl.Execute(&output, variables); err != nil {
		return "", err
	}
	return output.String(), nil
}
