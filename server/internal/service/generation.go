package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/repository"

	"gorm.io/datatypes"
)

type GenerationService struct {
	repo       *repository.Repository
	billing    *BillingService
	references *ReferenceService
	gateway    *ModelGatewayService
	media      *MediaObjectService
	client     *http.Client
}

type GenerationRunInput struct {
	ProjectID      string         `json:"projectId"`
	ReferenceSetID string         `json:"referenceSetId"`
	ParentRunID    string         `json:"parentRunId"`
	Ability        string         `json:"ability"`
	Model          string         `json:"model"`
	Prompt         string         `json:"prompt"`
	Params         map[string]any `json:"params"`
}

func NewGenerationService(repo *repository.Repository, billing *BillingService, references *ReferenceService, gateway *ModelGatewayService, media *MediaObjectService) *GenerationService {
	return &GenerationService{repo: repo, billing: billing, references: references, gateway: gateway, media: media, client: &http.Client{Timeout: 60 * time.Second}}
}

func (s *GenerationService) CreateGenerationRun(ctx context.Context, userID string, input GenerationRunInput) (model.GenerationRun, error) {
	if strings.TrimSpace(input.Prompt) == "" {
		return model.GenerationRun{}, errors.New("prompt 不能为空")
	}
	if input.Ability == "" {
		input.Ability = "image_generation"
	}
	if input.Params == nil {
		input.Params = map[string]any{}
	}
	compiled, err := s.references.CompileReferenceSetPreview(userID, input.ReferenceSetID, CompileReferenceSetPreviewInput{
		Prompt:  input.Prompt,
		Locale:  "zh-CN",
		Ability: capabilityAbility(input.Ability),
		Model:   input.Model,
		Params:  input.Params,
	})
	if err != nil {
		return model.GenerationRun{}, err
	}
	estimateParams := cloneParams(input.Params)
	estimateParams["references"] = len(compiled.EnabledReferences)
	usage, err := s.billing.Reserve(ctx, userID, EstimateRequest{Ability: input.Ability, Model: input.Model, Params: estimateParams})
	if err != nil {
		return model.GenerationRun{}, err
	}
	run := model.GenerationRun{
		UserID:                userID,
		ProjectID:             input.ProjectID,
		ReferenceSetID:        input.ReferenceSetID,
		ParentRunID:           input.ParentRunID,
		Ability:               input.Ability,
		Model:                 input.Model,
		Prompt:                input.Prompt,
		CompiledPrompt:        compiled.CompiledPrompt,
		CompiledLocale:        "zh-CN",
		CompiledTemplateKey:   "reference.default",
		CompiledReferenceJSON: mustJSON(compiled.CompiledReferenceJSON),
		ParamsJSON:            mustJSON(input.Params),
		Status:                "queued",
		ReservedCredits:       usage.EstimateCredits,
		UsageID:               usage.ID,
		Gateway:               "newapi",
	}
	if err := s.repo.SaveGenerationRun(&run); err != nil {
		_ = s.billing.Fail(ctx, usage.ID, err.Error())
		return model.GenerationRun{}, err
	}
	job := model.GenerationJob{
		UserID:          userID,
		GenerationRunID: run.ID,
		Status:          "queued",
		Ability:         input.Ability,
		Priority:        0,
		MaxAttempts:     3,
	}
	if err := s.repo.SaveGenerationJob(&job); err != nil {
		_ = s.billing.Fail(ctx, usage.ID, err.Error())
		run.Status = "failed"
		run.ErrorMessage = err.Error()
		_ = s.repo.SaveGenerationRun(&run)
		return run, err
	}
	return run, nil
}

func (s *GenerationService) GetGenerationRun(userID string, id string) (model.GenerationRun, error) {
	return s.repo.GetGenerationRun(userID, id)
}

func (s *GenerationService) GetGenerationJob(userID string, id string) (model.GenerationJob, error) {
	return s.repo.GetGenerationJob(userID, id)
}

func (s *GenerationService) RetryGenerationRun(ctx context.Context, userID string, id string) (model.GenerationJob, error) {
	run, err := s.repo.GetGenerationRun(userID, id)
	if err != nil {
		return model.GenerationJob{}, err
	}
	params := map[string]any{}
	_ = json.Unmarshal(run.ParamsJSON, &params)
	usage, err := s.billing.Reserve(ctx, userID, EstimateRequest{Ability: run.Ability, Model: run.Model, Params: params})
	if err != nil {
		return model.GenerationJob{}, err
	}
	run.Status = "queued"
	run.UsageID = usage.ID
	run.ReservedCredits = usage.EstimateCredits
	run.SettledCredits = 0
	run.ErrorKey = ""
	run.ErrorMessage = ""
	if err := s.repo.SaveGenerationRun(&run); err != nil {
		_ = s.billing.Fail(ctx, usage.ID, err.Error())
		return model.GenerationJob{}, err
	}
	job := model.GenerationJob{UserID: userID, GenerationRunID: run.ID, Status: "queued", Ability: run.Ability, MaxAttempts: 3}
	return job, s.repo.SaveGenerationJob(&job)
}

func (s *GenerationService) CancelGenerationRun(ctx context.Context, userID string, id string) (model.GenerationRun, error) {
	run, err := s.repo.GetGenerationRun(userID, id)
	if err != nil {
		return run, err
	}
	run.Status = "canceled"
	if run.UsageID != "" {
		_ = s.billing.Fail(ctx, run.UsageID, "生成已取消")
	}
	return run, s.repo.SaveGenerationRun(&run)
}

func (s *GenerationService) ExecuteGenerationJob(ctx context.Context, job model.GenerationJob) error {
	run, err := s.repo.AdminGetGenerationRun(job.GenerationRunID)
	if err != nil {
		return err
	}
	requestPayload := generationRequestPayload(run)
	requestBody, _ := json.Marshal(requestPayload)
	job.RequestJSON = datatypes.JSON(requestBody)
	if err := s.repo.SaveGenerationJob(&job); err != nil {
		return err
	}
	resp, err := s.gateway.Proxy(ctx, http.MethodPost, "/images/generations", http.Header{"Content-Type": []string{"application/json"}}, requestBody)
	if err != nil {
		return s.failJob(ctx, run, job, "error.gateway.failed", err.Error(), nil)
	}
	defer resp.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if resp.StatusCode >= 400 {
		return s.failJob(ctx, run, job, "error.gateway.failed", string(payload), payload)
	}
	outputs, err := s.persistGenerationOutputs(ctx, run, payload)
	if err != nil {
		return s.failJob(ctx, run, job, "error.storage.failed", err.Error(), payload)
	}
	now := time.Now()
	run.Status = "succeeded"
	run.SettledCredits = run.ReservedCredits
	run.GatewayRequestID = resp.Header.Get("x-request-id")
	run.GatewayModel = run.Model
	run.GatewayUsageJSON = responseJSON(payload)
	job.Status = "succeeded"
	job.FinishedAt = &now
	job.ResponseJSON = responseJSON(payload)
	if err := s.repo.SaveGenerationRun(&run); err != nil {
		return err
	}
	if err := s.repo.SaveGenerationJob(&job); err != nil {
		return err
	}
	if run.UsageID != "" {
		return s.billing.Settle(ctx, run.UsageID, run.ReservedCredits)
	}
	_ = outputs
	return nil
}

func (s *GenerationService) failJob(ctx context.Context, run model.GenerationRun, job model.GenerationJob, errorKey string, message string, payload []byte) error {
	now := time.Now()
	run.Status = "failed"
	run.ErrorKey = errorKey
	run.ErrorMessage = message
	run.GatewayErrorJSON = responseJSON(payload)
	job.Status = "failed"
	job.FinishedAt = &now
	job.ErrorKey = errorKey
	job.ErrorMessage = message
	job.ResponseJSON = responseJSON(payload)
	if run.UsageID != "" {
		_ = s.billing.Fail(ctx, run.UsageID, message)
	}
	if err := s.repo.SaveGenerationRun(&run); err != nil {
		return err
	}
	return s.repo.SaveGenerationJob(&job)
}

func (s *GenerationService) persistGenerationOutputs(ctx context.Context, run model.GenerationRun, payload []byte) ([]model.GenerationOutput, error) {
	var parsed struct {
		Data []struct {
			URL     string `json:"url"`
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}
	if err := json.Unmarshal(payload, &parsed); err != nil {
		return nil, err
	}
	outputs := make([]model.GenerationOutput, 0, len(parsed.Data))
	for index, item := range parsed.Data {
		data, mimeType, err := s.outputBytes(ctx, item.URL, item.B64JSON)
		if err != nil {
			return outputs, err
		}
		media, err := s.media.SaveBytes(ctx, run.UserID, "image", fmt.Sprintf("generation-%s-%d.png", run.ID, index+1), mimeType, data, "")
		if err != nil {
			return outputs, err
		}
		output := model.GenerationOutput{UserID: run.UserID, GenerationRunID: run.ID, MediaObjectID: media.ID, Status: "succeeded"}
		if err := s.repo.SaveGenerationOutput(&output); err != nil {
			return outputs, err
		}
		outputs = append(outputs, output)
	}
	return outputs, nil
}

func (s *GenerationService) outputBytes(ctx context.Context, rawURL string, b64 string) ([]byte, string, error) {
	if b64 != "" {
		data, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			return nil, "", err
		}
		return data, http.DetectContentType(data), nil
	}
	if rawURL == "" {
		return nil, "", errors.New("生成结果没有可保存的媒体内容")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, "", fmt.Errorf("读取生成结果失败：%d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return nil, "", err
	}
	mimeType := resp.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = http.DetectContentType(data)
	}
	return data, mimeType, nil
}

func generationRequestPayload(run model.GenerationRun) map[string]any {
	params := map[string]any{}
	_ = json.Unmarshal(run.ParamsJSON, &params)
	params["prompt"] = run.CompiledPrompt
	if run.Model != "" {
		params["model"] = run.Model
	}
	return params
}

func responseJSON(payload []byte) datatypes.JSON {
	if len(payload) == 0 {
		return datatypes.JSON([]byte("{}"))
	}
	if json.Valid(payload) {
		return datatypes.JSON(payload)
	}
	return mustJSON(map[string]any{"raw": string(bytes.TrimSpace(payload))})
}

func cloneParams(params map[string]any) map[string]any {
	out := map[string]any{}
	for key, value := range params {
		out[key] = value
	}
	return out
}

func capabilityAbility(ability string) string {
	if strings.HasPrefix(ability, "image_") {
		return "image"
	}
	return ability
}
