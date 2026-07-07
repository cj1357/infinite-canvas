package service

import (
	"context"

	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/repository"
)

type AdminService struct {
	repo    *repository.Repository
	gateway *ModelGatewayService
}

func NewAdminService(repo *repository.Repository, gateway *ModelGatewayService) *AdminService {
	return &AdminService{repo: repo, gateway: gateway}
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
