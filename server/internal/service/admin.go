package service

import (
	"context"

	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/repository"
)

type AdminService struct {
	repo    *repository.Repository
	gateway *ModelGatewayService
	prompts *PromptTemplateService
}

func NewAdminService(repo *repository.Repository, gateway *ModelGatewayService, prompts *PromptTemplateService) *AdminService {
	return &AdminService{repo: repo, gateway: gateway, prompts: prompts}
}

func (s *AdminService) ListUsers(q model.Query) (model.ListResult[model.User], error) {
	return s.repo.ListUsers(q)
}

func (s *AdminService) ModelGatewaySettings() (ModelGatewaySettings, error) {
	return s.gateway.Settings()
}

func (s *AdminService) SaveModelGatewaySettings(input ModelGatewayConfigInput) (ModelGatewaySettings, error) {
	return s.gateway.SaveSettings(input)
}

func (s *AdminService) TestModelGatewaySettings(ctx context.Context) (ModelGatewayTestResult, error) {
	return s.gateway.Test(ctx)
}

func (s *AdminService) ListModelCapabilities(q model.Query) (model.ListResult[model.ModelCapability], error) {
	return s.repo.ListModelCapabilities(q)
}

func (s *AdminService) SaveModelCapability(item *model.ModelCapability) error {
	return s.repo.SaveModelCapability(item)
}

func (s *AdminService) ListPromptTemplates(q model.Query) (model.ListResult[model.PromptTemplate], error) {
	return s.prompts.List(q)
}

func (s *AdminService) SavePromptTemplate(item *model.PromptTemplate) error {
	return s.prompts.Save(item)
}

func (s *AdminService) PreviewPromptTemplate(input PromptTemplatePreviewInput) (PromptTemplatePreviewOutput, error) {
	return s.prompts.Preview(input)
}
