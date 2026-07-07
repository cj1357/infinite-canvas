package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
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
	timeout := time.Duration(cfg.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = defaultGatewayTimeout(s.cfg)
	}
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
		return cfg.ModelGatewayTimeout
	}
	return 10 * time.Minute
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
	parsed.Path = strings.TrimRight(parsed.Path, "/") + "/" + strings.TrimLeft(path, "/")
	return parsed.String(), nil
}
