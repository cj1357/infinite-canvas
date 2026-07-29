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
	"gorm.io/gorm"
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

type GenerationRunDetail struct {
	Run     model.GenerationRun      `json:"run"`
	Job     *model.GenerationJob     `json:"job,omitempty"`
	Outputs []model.GenerationOutput `json:"outputs"`
}

func NewGenerationService(repo *repository.Repository, billing *BillingService, references *ReferenceService, gateway *ModelGatewayService, media *MediaObjectService) *GenerationService {
	return &GenerationService{repo: repo, billing: billing, references: references, gateway: gateway, media: media, client: &http.Client{Timeout: 60 * time.Second}}
}

func (s *GenerationService) CreateGenerationRun(ctx context.Context, userID string, input GenerationRunInput) (model.GenerationRun, error) {
	if strings.TrimSpace(input.Prompt) == "" {
		return model.GenerationRun{}, errors.New("prompt 不能为空")
	}
	input.ReferenceSetID = strings.TrimSpace(input.ReferenceSetID)
	if input.Ability == "" {
		input.Ability = "image_generation"
	}
	if input.Params == nil {
		input.Params = map[string]any{}
	}
	compiled := CompileReferenceSetPreviewOutput{
		CompiledPrompt:        strings.TrimSpace(input.Prompt),
		CompiledReferenceJSON: map[string]any{"references": []map[string]any{}},
	}
	var err error
	if input.ReferenceSetID != "" {
		compiled, err = s.references.CompileReferenceSetPreview(userID, input.ReferenceSetID, CompileReferenceSetPreviewInput{
			Prompt:  input.Prompt,
			Locale:  "zh-CN",
			Ability: capabilityAbility(input.Ability),
			Model:   input.Model,
			Params:  input.Params,
		})
		if err != nil {
			return model.GenerationRun{}, err
		}
	}
	referenceCount := generationReferenceCount(input.Params, generationReferenceMediaObjectIDsFromIntents(compiled.EnabledReferences))
	input.Params["reference_count"] = referenceCount
	estimateParams := cloneParams(input.Params)
	estimateParams["references"] = referenceCount
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

func (s *GenerationService) GetGenerationRunDetail(userID string, id string) (GenerationRunDetail, error) {
	run, err := s.repo.GetGenerationRun(userID, id)
	if err != nil {
		return GenerationRunDetail{}, err
	}
	outputs, err := s.repo.ListGenerationOutputs(userID, id)
	if err != nil {
		return GenerationRunDetail{}, err
	}
	job, err := s.repo.GetLatestGenerationJobByRun(userID, id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return GenerationRunDetail{Run: run, Outputs: outputs}, nil
	}
	if err != nil {
		return GenerationRunDetail{}, err
	}
	return GenerationRunDetail{Run: run, Job: &job, Outputs: outputs}, nil
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
	if run.Status == "failed" || run.Status == "canceled" {
		now := time.Now()
		job.Status = "canceled"
		job.FinishedAt = &now
		job.ErrorKey = "generation.run_inactive"
		job.ErrorMessage = "生成运行已结束"
		return s.repo.SaveGenerationJob(&job)
	}
	requestPayload, err := s.generationRequestPayload(ctx, run)
	if err != nil {
		return s.failJob(ctx, run, job, "error.request.failed", err.Error(), nil)
	}
	requestPayloads := generationRequestPayloads(requestPayload)
	job.RequestJSON = mustJSON(redactGenerationRequestPayloadBatch(requestPayload, requestPayloads))
	if err := s.repo.SaveGenerationJob(&job); err != nil {
		return err
	}

	responsePayloads := make([][]byte, 0, len(requestPayloads))
	outputs := []model.GenerationOutput{}
	gatewayRequestID := ""
	for _, payload := range requestPayloads {
		requestBody, _ := json.Marshal(payload)
		resp, err := s.gateway.Proxy(ctx, http.MethodPost, "/images/generations", http.Header{"Content-Type": []string{"application/json"}}, requestBody)
		if err != nil {
			return s.failJob(ctx, run, job, "error.gateway.failed", err.Error(), nil)
		}
		responsePayload, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
		_ = resp.Body.Close()
		if resp.StatusCode >= 400 {
			return s.failJob(ctx, run, job, "error.gateway.failed", string(responsePayload), responsePayload)
		}
		requestOutputs, err := s.persistGenerationOutputs(ctx, run, responsePayload, len(outputs))
		if err != nil {
			return s.failJob(ctx, run, job, "error.storage.failed", err.Error(), responsePayload)
		}
		if gatewayRequestID == "" {
			gatewayRequestID = resp.Header.Get("x-request-id")
		}
		responsePayloads = append(responsePayloads, responsePayload)
		outputs = append(outputs, requestOutputs...)
	}
	now := time.Now()
	run.Status = "succeeded"
	run.SettledCredits = run.ReservedCredits
	run.GatewayRequestID = gatewayRequestID
	run.GatewayModel = run.Model
	responseLogJSON := redactGenerationResponsePayloads(responsePayloads)
	run.GatewayUsageJSON = responseLogJSON
	job.Status = "succeeded"
	job.FinishedAt = &now
	job.ResponseJSON = responseLogJSON
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

func (s *GenerationService) persistGenerationOutputs(ctx context.Context, run model.GenerationRun, payload []byte, startIndex int) ([]model.GenerationOutput, error) {
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
		media, err := s.media.SaveBytes(ctx, run.UserID, "image", fmt.Sprintf("generation-%s-%d.png", run.ID, startIndex+index+1), mimeType, data, "")
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

func (s *GenerationService) generationRequestPayload(ctx context.Context, run model.GenerationRun) (map[string]any, error) {
	params := generationRequestPayload(run)
	references, maskAdded, err := s.generationInputReferences(ctx, run)
	if err != nil {
		return nil, err
	}
	if len(references) > 0 {
		params["input_references"] = references
	}
	if maskAdded {
		prompt := strings.TrimSpace(stringParam(params, "prompt"))
		params["prompt"] = strings.TrimSpace(prompt + "\n\n" + imageMaskPromptSuffix)
	}
	return params, nil
}

func (s *GenerationService) generationInputReferences(ctx context.Context, run model.GenerationRun) ([]map[string]any, bool, error) {
	if s.media == nil {
		return nil, false, nil
	}
	params := map[string]any{}
	_ = json.Unmarshal(run.ParamsJSON, &params)
	mediaIDs := append(generationReferenceMediaObjectIDs(run), stringListParam(params["referenceMediaObjectIds"])...)
	maskID := strings.TrimSpace(stringAny(params["maskMediaObjectId"]))
	references := make([]map[string]any, 0, len(mediaIDs)+1)
	for _, mediaID := range mediaIDs {
		reference, err := s.mediaObjectImageReference(ctx, run.UserID, mediaID)
		if err != nil {
			return nil, false, err
		}
		references = append(references, reference)
	}
	if maskID == "" {
		return references, false, nil
	}
	reference, err := s.mediaObjectImageReference(ctx, run.UserID, maskID)
	if err != nil {
		return nil, false, err
	}
	return append(references, reference), true, nil
}

func (s *GenerationService) mediaObjectImageReference(ctx context.Context, userID string, mediaID string) (map[string]any, error) {
	mediaID = strings.TrimSpace(mediaID)
	if mediaID == "" {
		return nil, errors.New("参考图媒体 ID 不能为空")
	}
	object, media, err := s.media.Open(ctx, userID, mediaID)
	if err != nil {
		return nil, fmt.Errorf("读取参考图失败: %w", err)
	}
	defer object.Body.Close()
	data, err := io.ReadAll(io.LimitReader(object.Body, 64<<20))
	if err != nil {
		return nil, fmt.Errorf("读取参考图失败: %w", err)
	}
	return imageReferenceFromBytes(data, firstNonEmpty(object.ContentType, media.MimeType, media.ContentType))
}

func generationRequestPayload(run model.GenerationRun) map[string]any {
	params := map[string]any{}
	_ = json.Unmarshal(run.ParamsJSON, &params)
	stripGenerationInternalParams(params)
	prompt := strings.TrimSpace(run.CompiledPrompt)
	if prompt == "" {
		prompt = strings.TrimSpace(run.Prompt)
	}
	params["prompt"] = prompt
	if run.Model != "" {
		params["model"] = run.Model
	}
	applyOpenRouterVertexProvider(params)
	return params
}

func generationRequestPayloads(payload map[string]any) []map[string]any {
	count := int(firstNumberParam(payload, "n"))
	if count <= 1 || !hasGenerationInputReferences(payload) {
		return []map[string]any{payload}
	}
	requests := make([]map[string]any, 0, count)
	for range count {
		request := cloneParams(payload)
		request["n"] = 1
		requests = append(requests, request)
	}
	return requests
}

func hasGenerationInputReferences(payload map[string]any) bool {
	switch references := payload["input_references"].(type) {
	case []map[string]any:
		return len(references) > 0
	case []any:
		return len(references) > 0
	}
	return false
}

func stripGenerationInternalParams(params map[string]any) {
	for _, key := range []string{"referenceMediaObjectIds", "maskMediaObjectId", "reference_count", "referenceCount", "references"} {
		delete(params, key)
	}
}

func redactGenerationRequestPayload(params map[string]any) map[string]any {
	redacted := cloneParams(params)
	if references, ok := params["input_references"].([]map[string]any); ok {
		redacted["input_references"] = map[string]any{"count": len(references)}
	} else if references, ok := params["input_references"].([]any); ok {
		redacted["input_references"] = map[string]any{"count": len(references)}
	}
	return redacted
}

func redactGenerationRequestPayloadBatch(original map[string]any, requests []map[string]any) map[string]any {
	redacted := redactGenerationRequestPayload(original)
	if len(requests) > 1 {
		redacted["n"] = 1
		redacted["requested_n"] = int(firstNumberParam(original, "n"))
		redacted["split_requests"] = len(requests)
	}
	return redacted
}

func redactGenerationResponsePayload(payload []byte) datatypes.JSON {
	if len(payload) == 0 || !json.Valid(payload) {
		return responseJSON(payload)
	}
	var data map[string]any
	if err := json.Unmarshal(payload, &data); err != nil {
		return responseJSON(payload)
	}
	if items, ok := data["data"].([]any); ok {
		for _, item := range items {
			if image, ok := item.(map[string]any); ok {
				if value, ok := image["b64_json"].(string); ok && value != "" {
					image["b64_json"] = fmt.Sprintf("[base64:%d chars]", len(value))
				}
			}
		}
	}
	return mustJSON(data)
}

func redactGenerationResponsePayloads(payloads [][]byte) datatypes.JSON {
	if len(payloads) == 0 {
		return datatypes.JSON([]byte("{}"))
	}
	if len(payloads) == 1 {
		return redactGenerationResponsePayload(payloads[0])
	}
	responses := make([]any, 0, len(payloads))
	for _, payload := range payloads {
		var response any
		if err := json.Unmarshal(redactGenerationResponsePayload(payload), &response); err != nil {
			response = map[string]any{"raw": string(bytes.TrimSpace(payload))}
		}
		responses = append(responses, response)
	}
	return mustJSON(map[string]any{"splitResponses": responses})
}

func generationReferenceMediaObjectIDs(run model.GenerationRun) []string {
	var compiled struct {
		References []struct {
			MediaObjectID string `json:"mediaObjectId"`
		} `json:"references"`
	}
	_ = json.Unmarshal(run.CompiledReferenceJSON, &compiled)
	ids := make([]string, 0, len(compiled.References))
	for _, item := range compiled.References {
		if id := strings.TrimSpace(item.MediaObjectID); id != "" {
			ids = append(ids, id)
		}
	}
	return ids
}

func generationReferenceMediaObjectIDsFromIntents(intents []model.ReferenceIntent) []string {
	ids := make([]string, 0, len(intents))
	for _, item := range intents {
		if id := strings.TrimSpace(item.MediaObjectID); id != "" {
			ids = append(ids, id)
		}
	}
	return ids
}

func generationReferenceCount(params map[string]any, compiledMediaIDs []string) int {
	count := len(compiledMediaIDs) + len(stringListParam(params["referenceMediaObjectIds"]))
	if strings.TrimSpace(stringAny(params["maskMediaObjectId"])) != "" {
		count++
	}
	if explicit := int(firstNumberParam(params, "references", "referenceCount", "reference_count")); explicit > count {
		return explicit
	}
	return count
}

func stringListParam(value any) []string {
	switch items := value.(type) {
	case []string:
		result := make([]string, 0, len(items))
		for _, item := range items {
			if value := strings.TrimSpace(item); value != "" {
				result = append(result, value)
			}
		}
		return result
	case []any:
		result := make([]string, 0, len(items))
		for _, item := range items {
			if value := strings.TrimSpace(stringAny(item)); value != "" {
				result = append(result, value)
			}
		}
		return result
	case string:
		if value := strings.TrimSpace(items); value != "" {
			return []string{value}
		}
	}
	return nil
}

func stringAny(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return ""
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
