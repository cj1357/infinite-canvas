package service

import (
	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/repository"
)

type AdminService struct {
	repo   *repository.Repository
	newapi *NewAPIService
}

func NewAdminService(repo *repository.Repository, newapi *NewAPIService) *AdminService {
	return &AdminService{repo: repo, newapi: newapi}
}

func (s *AdminService) ListUsers(q model.Query) (model.ListResult[model.User], error) {
	return s.repo.ListUsers(q)
}

func (s *AdminService) NewAPISettings() (NewAPISettings, error) {
	return s.newapi.Settings()
}

func (s *AdminService) SaveNewAPISettings(input NewAPIConfigInput) (NewAPISettings, error) {
	return s.newapi.SaveSettings(input)
}
