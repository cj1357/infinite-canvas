package service

import (
	"context"
	"errors"

	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/repository"

	"gorm.io/gorm"
)

type AdminService struct {
	repo       *repository.Repository
	gateway    *ModelGatewayService
	prompts    *PromptTemplateService
	generation *GenerationService
	billing    *BillingService
}

func NewAdminService(repo *repository.Repository, gateway *ModelGatewayService, prompts *PromptTemplateService, generation *GenerationService, billing *BillingService) *AdminService {
	return &AdminService{repo: repo, gateway: gateway, prompts: prompts, generation: generation, billing: billing}
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

func (s *AdminService) ListGenerationRuns(q model.Query) (model.ListResult[model.GenerationRun], error) {
	return s.repo.AdminListGenerationRuns(q)
}

func (s *AdminService) ListGenerationJobs(q model.Query) (model.ListResult[model.GenerationJob], error) {
	return s.repo.AdminListGenerationJobs(q)
}

func (s *AdminService) RetryGenerationRun(ctx context.Context, id string) (model.GenerationJob, error) {
	run, err := s.repo.AdminGetGenerationRun(id)
	if err != nil {
		return model.GenerationJob{}, err
	}
	return s.generation.RetryGenerationRun(ctx, run.UserID, run.ID)
}

func (s *AdminService) RefundGenerationRun(ctx context.Context, id string) (model.GenerationRun, error) {
	run, err := s.repo.AdminGetGenerationRun(id)
	if err != nil {
		return run, err
	}
	if run.Status == "succeeded" {
		return run, errors.New("已完成任务不能通过失败退款处理")
	}
	if run.UsageID == "" {
		return run, errors.New("任务没有可退款的用量记录")
	}
	if err := s.billing.Fail(ctx, run.UsageID, "管理员手动退款"); err != nil {
		return run, err
	}
	run.Status = "failed"
	run.ErrorKey = "admin.refunded"
	run.ErrorMessage = "管理员手动退款"
	job, err := s.repo.GetLatestGenerationJobByRun(run.UserID, run.ID)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return run, err
	}
	if err == nil && (job.Status == "queued" || job.Status == "retrying" || job.Status == "running") {
		job.Status = "canceled"
		job.ErrorKey = "admin.refunded"
		job.ErrorMessage = "管理员手动退款"
		if err := s.repo.SaveGenerationJob(&job); err != nil {
			return run, err
		}
	}
	return run, s.repo.SaveGenerationRun(&run)
}
