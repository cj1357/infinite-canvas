package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"infinite-canvas/server/internal/config"
	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/repository"

	"gorm.io/gorm"
)

type ModelGatewayService struct {
	repo   *repository.Repository
	cfg    config.Config
	client *http.Client
}

type ModelGatewaySettings struct {
	Provider       string `json:"provider"`
	BaseURL        string `json:"baseUrl"`
	InternalURL    string `json:"internalUrl"`
	Enabled        bool   `json:"enabled"`
	HasToken       bool   `json:"hasToken"`
	TimeoutSeconds int    `json:"timeoutSeconds"`
}

type ModelGatewayConfigInput struct {
	Provider       string `json:"provider"`
	BaseURL        string `json:"baseUrl"`
	InternalURL    string `json:"internalUrl"`
	Token          string `json:"token"`
	TimeoutSeconds int    `json:"timeoutSeconds"`
	Enabled        bool   `json:"enabled"`
}

type ModelGatewayTestResult struct {
	OK       bool   `json:"ok"`
	Status   int    `json:"status"`
	Provider string `json:"provider"`
	BaseURL  string `json:"baseUrl"`
	Message  string `json:"message"`
}

type PreparedImageEditRequest struct {
	UpstreamPath   string
	ContentType    string
	Body           []byte
	ReferenceCount int
	Estimate       EstimateRequest
}

var imageEditValueFields = []string{
	"model",
	"prompt",
	"response_format",
	"output_format",
	"resolution",
	"aspect_ratio",
	"quality",
	"size",
}

const imageMaskPromptSuffix = "参考图说明：最后一张参考图是蒙版。请仅修改蒙版透明区域，其他区域尽量保持不变。"
const maxGatewayTimeoutSeconds = 600

func NewModelGatewayService(repo *repository.Repository, cfg config.Config) *ModelGatewayService {
	return &ModelGatewayService{repo: repo, cfg: cfg, client: &http.Client{}}
}

func (s *ModelGatewayService) Settings() (ModelGatewaySettings, error) {
	cfg, err := s.resolveConfig()
	if err != nil {
		return ModelGatewaySettings{}, err
	}
	return gatewaySettings(cfg), nil
}

func (s *ModelGatewayService) SaveSettings(input ModelGatewayConfigInput) (ModelGatewaySettings, error) {
	item := model.NewAPIConfig{
		Name:           "default",
		Provider:       normalizeGatewayProvider(input.Provider),
		BaseURL:        strings.TrimRight(input.BaseURL, "/"),
		InternalURL:    strings.TrimRight(input.InternalURL, "/"),
		Token:          input.Token,
		TimeoutSeconds: input.TimeoutSeconds,
		Enabled:        input.Enabled,
	}
	existing, err := s.repo.GetNewAPIConfig()
	if err == nil {
		item.ID = existing.ID
		if item.BaseURL == "" {
			item.BaseURL = existing.BaseURL
		}
		if item.Token == "" {
			item.Token = existing.Token
		}
		if item.TimeoutSeconds <= 0 {
			item.TimeoutSeconds = existing.TimeoutSeconds
		}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return ModelGatewaySettings{}, err
	}
	if item.TimeoutSeconds <= 0 {
		item.TimeoutSeconds = int(defaultGatewayTimeout(s.cfg) / time.Second)
	}
	item.TimeoutSeconds = normalizeGatewayTimeoutSeconds(item.TimeoutSeconds, defaultGatewayTimeout(s.cfg))
	if err := s.repo.SaveNewAPIConfig(&item); err != nil {
		return ModelGatewaySettings{}, err
	}
	return gatewaySettings(item), nil
}

func (s *ModelGatewayService) Test(ctx context.Context) (ModelGatewayTestResult, error) {
	cfg, err := s.resolveConfig()
	if err != nil {
		return ModelGatewayTestResult{}, err
	}
	resp, err := s.Proxy(ctx, http.MethodGet, "/models", http.Header{"Accept": []string{"application/json"}}, nil)
	if err != nil {
		return ModelGatewayTestResult{OK: false, Provider: cfg.Provider, BaseURL: publicGatewayURL(cfg), Message: err.Error()}, nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	return ModelGatewayTestResult{
		OK:       resp.StatusCode >= 200 && resp.StatusCode < 300,
		Status:   resp.StatusCode,
		Provider: cfg.Provider,
		BaseURL:  publicGatewayURL(cfg),
		Message:  strings.TrimSpace(string(body)),
	}, nil
}

func (s *ModelGatewayService) Proxy(ctx context.Context, method string, path string, headers http.Header, body []byte) (*http.Response, error) {
	cfg, err := s.resolveConfig()
	if err != nil {
		return nil, err
	}
	if !cfg.Enabled || publicGatewayURL(cfg) == "" || cfg.Token == "" {
		return nil, errors.New("模型网关尚未配置")
	}
	baseURL := cfg.InternalURL
	if baseURL == "" {
		baseURL = cfg.BaseURL
	}
	targetURL, err := joinGatewayURL(baseURL, path)
	if err != nil {
		return nil, err
	}
	timeout := time.Duration(normalizeGatewayTimeoutSeconds(cfg.TimeoutSeconds, defaultGatewayTimeout(s.cfg))) * time.Second
	req, err := http.NewRequestWithContext(ctx, method, targetURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	copyGatewayHeaders(req.Header, headers)
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	client := *s.client
	client.Timeout = timeout
	return client.Do(req)
}

func (s *ModelGatewayService) PrepareImageGenerationRequest(body []byte) ([]byte, error) {
	payload := map[string]any{}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("解析生图请求失败: %w", err)
	}
	applyOpenRouterVertexProvider(payload)
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("编码生图请求失败: %w", err)
	}
	return encoded, nil
}

func (s *ModelGatewayService) PrepareImageEditRequest(contentType string, body []byte) (PreparedImageEditRequest, error) {
	mediaType, values, err := mime.ParseMediaType(contentType)
	if err != nil || mediaType != "multipart/form-data" || values["boundary"] == "" {
		return PreparedImageEditRequest{}, errors.New("参考图请求格式错误")
	}
	form, err := multipart.NewReader(bytes.NewReader(body), values["boundary"]).ReadForm(64 << 20)
	if err != nil {
		return PreparedImageEditRequest{}, fmt.Errorf("解析参考图请求失败: %w", err)
	}
	defer form.RemoveAll()

	sourceFiles := form.File["image"]
	if len(sourceFiles) == 0 {
		return PreparedImageEditRequest{}, errors.New("至少需要一张参考图")
	}

	payload := map[string]any{}
	estimateParams := map[string]any{}
	for _, key := range imageEditValueFields {
		value := firstMultipartValue(form.Value[key])
		if value == "" {
			continue
		}
		payload[key] = value
		estimateParams[key] = value
	}
	if rawCount := firstMultipartValue(form.Value["n"]); rawCount != "" {
		count, err := strconv.Atoi(rawCount)
		if err != nil || count < 1 {
			return PreparedImageEditRequest{}, errors.New("生成数量格式错误")
		}
		payload["n"] = count
		estimateParams["n"] = float64(count)
	}

	references := make([]map[string]any, 0, len(sourceFiles)+1)
	for _, file := range sourceFiles {
		reference, err := multipartImageReference(file)
		if err != nil {
			return PreparedImageEditRequest{}, err
		}
		references = append(references, reference)
	}
	if masks := form.File["mask"]; len(masks) > 0 {
		reference, err := multipartImageReference(masks[0])
		if err != nil {
			return PreparedImageEditRequest{}, err
		}
		references = append(references, reference)
		prompt, _ := payload["prompt"].(string)
		payload["prompt"] = strings.TrimSpace(prompt) + "\n\n" + imageMaskPromptSuffix
	}
	payload["input_references"] = references
	applyOpenRouterVertexProvider(payload)
	estimateParams["reference_count"] = len(references)

	encoded, err := json.Marshal(payload)
	if err != nil {
		return PreparedImageEditRequest{}, fmt.Errorf("编码参考图请求失败: %w", err)
	}
	modelName, _ := payload["model"].(string)
	return PreparedImageEditRequest{
		UpstreamPath:   "/images/generations",
		ContentType:    "application/json",
		Body:           encoded,
		ReferenceCount: len(references),
		Estimate: EstimateRequest{
			Ability: "image_edit",
			Model:   modelName,
			Params:  estimateParams,
		},
	}, nil
}

func applyOpenRouterVertexProvider(payload map[string]any) {
	payload["provider"] = map[string]any{"only": []string{"google-vertex"}}
}

func firstMultipartValue(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func multipartImageReference(header *multipart.FileHeader) (map[string]any, error) {
	file, err := header.Open()
	if err != nil {
		return nil, fmt.Errorf("读取参考图失败: %w", err)
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		return nil, fmt.Errorf("读取参考图失败: %w", err)
	}
	mimeType := strings.TrimSpace(header.Header.Get("Content-Type"))
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = http.DetectContentType(data)
	}
	return imageReferenceFromBytes(data, mimeType)
}

func imageReferenceFromBytes(data []byte, mimeType string) (map[string]any, error) {
	if mimeType == "" || mimeType == "application/octet-stream" {
		mimeType = http.DetectContentType(data)
	}
	if !strings.HasPrefix(mimeType, "image/") {
		return nil, errors.New("参考文件必须是图片")
	}
	return map[string]any{
		"type": "image_url",
		"image_url": map[string]any{
			"url": "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(data),
		},
	}, nil
}

func (s *ModelGatewayService) ExtractEstimateRequest(ability string, contentType string, body []byte) EstimateRequest {
	params := map[string]any{}
	modelName := ""
	if strings.Contains(contentType, "application/json") {
		_ = json.Unmarshal(body, &params)
		if value, ok := params["model"].(string); ok {
			modelName = value
		}
	} else if strings.Contains(contentType, "multipart/form-data") {
		if mediaType, values, err := mime.ParseMediaType(contentType); err == nil && strings.HasPrefix(mediaType, "multipart/") {
			reader := multipart.NewReader(bytes.NewReader(body), values["boundary"])
			if form, err := reader.ReadForm(64 << 20); err == nil {
				for key, values := range form.Value {
					if len(values) > 0 {
						params[key] = values[0]
						if key == "model" {
							modelName = values[0]
						}
					}
				}
			}
		}
	}
	return EstimateRequest{Ability: ability, Model: modelName, Params: params}
}

func (s *ModelGatewayService) resolveConfig() (model.NewAPIConfig, error) {
	item, err := s.repo.GetNewAPIConfig()
	if err == nil {
		if item.Provider == "" {
			item.Provider = "newapi"
		}
		item.TimeoutSeconds = normalizeGatewayTimeoutSeconds(item.TimeoutSeconds, defaultGatewayTimeout(s.cfg))
		return item, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return item, err
	}
	return model.NewAPIConfig{
		Name:           "default",
		Provider:       normalizeGatewayProvider(s.cfg.ModelGatewayProvider),
		BaseURL:        s.cfg.ModelGatewayBaseURL,
		InternalURL:    s.cfg.ModelGatewayInternalURL,
		Token:          s.cfg.ModelGatewayToken,
		TimeoutSeconds: int(defaultGatewayTimeout(s.cfg) / time.Second),
		Enabled:        true,
	}, nil
}

func gatewaySettings(cfg model.NewAPIConfig) ModelGatewaySettings {
	return ModelGatewaySettings{
		Provider:       normalizeGatewayProvider(cfg.Provider),
		BaseURL:        cfg.BaseURL,
		InternalURL:    cfg.InternalURL,
		Enabled:        cfg.Enabled,
		HasToken:       cfg.Token != "",
		TimeoutSeconds: cfg.TimeoutSeconds,
	}
}

func normalizeGatewayProvider(provider string) string {
	provider = strings.ToLower(strings.TrimSpace(provider))
	if provider == "" {
		return "newapi"
	}
	return provider
}

func publicGatewayURL(cfg model.NewAPIConfig) string {
	if cfg.BaseURL != "" {
		return cfg.BaseURL
	}
	return cfg.InternalURL
}

func defaultGatewayTimeout(cfg config.Config) time.Duration {
	if cfg.ModelGatewayTimeout > 0 {
		if cfg.ModelGatewayTimeout > 10*time.Minute {
			return 10 * time.Minute
		}
		return cfg.ModelGatewayTimeout
	}
	return 10 * time.Minute
}

func normalizeGatewayTimeoutSeconds(seconds int, fallback time.Duration) int {
	if seconds <= 0 {
		seconds = int(fallback / time.Second)
	}
	if seconds > maxGatewayTimeoutSeconds {
		return maxGatewayTimeoutSeconds
	}
	return seconds
}

func copyGatewayHeaders(dst http.Header, src http.Header) {
	for key, values := range src {
		lower := strings.ToLower(key)
		if lower == "host" || lower == "cookie" || lower == "authorization" || lower == "content-length" {
			continue
		}
		for _, value := range values {
			dst.Add(key, value)
		}
	}
}

func joinGatewayURL(baseURL string, path string) (string, error) {
	parsed, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil {
		return "", err
	}
	basePath := strings.ToLower(parsed.Path)
	targetPath := "/" + strings.TrimLeft(path, "/")
	if !strings.HasSuffix(basePath, "/v1") &&
		!strings.HasSuffix(basePath, "/v1beta") &&
		!strings.HasPrefix(targetPath, "/v1/") &&
		!strings.HasPrefix(targetPath, "/v1beta/") {
		targetPath = "/v1" + targetPath
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/") + targetPath
	return parsed.String(), nil
}
