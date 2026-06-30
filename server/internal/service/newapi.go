package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
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

type NewAPIService struct {
	repo   *repository.Repository
	cfg    config.Config
	client *http.Client
}

type NewAPISettings struct {
	BaseURL string `json:"baseUrl"`
	Enabled bool   `json:"enabled"`
	HasToken bool   `json:"hasToken"`
}

type NewAPIConfigInput struct {
	BaseURL string `json:"baseUrl"`
	Token   string `json:"token"`
	Enabled bool   `json:"enabled"`
}

func NewNewAPIService(repo *repository.Repository, cfg config.Config) *NewAPIService {
	return &NewAPIService{
		repo: repo,
		cfg:  cfg,
		client: &http.Client{
			Timeout: 10 * time.Minute,
		},
	}
}

func (s *NewAPIService) Settings() (NewAPISettings, error) {
	cfg, err := s.resolveConfig()
	if err != nil {
		return NewAPISettings{}, err
	}
	return NewAPISettings{BaseURL: cfg.BaseURL, Enabled: cfg.Enabled, HasToken: cfg.Token != ""}, nil
}

func (s *NewAPIService) SaveSettings(input NewAPIConfigInput) (NewAPISettings, error) {
	item := model.NewAPIConfig{
		Name:    "default",
		BaseURL: strings.TrimRight(input.BaseURL, "/"),
		Token:   input.Token,
		Enabled: input.Enabled,
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
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return NewAPISettings{}, err
	}
	if err := s.repo.SaveNewAPIConfig(&item); err != nil {
		return NewAPISettings{}, err
	}
	return NewAPISettings{BaseURL: item.BaseURL, Enabled: item.Enabled, HasToken: item.Token != ""}, nil
}

func (s *NewAPIService) Proxy(ctx context.Context, method string, path string, headers http.Header, body []byte) (*http.Response, error) {
	cfg, err := s.resolveConfig()
	if err != nil {
		return nil, err
	}
	if !cfg.Enabled || cfg.BaseURL == "" || cfg.Token == "" {
		return nil, errors.New("NewAPI 尚未配置")
	}
	targetURL, err := joinURL(cfg.BaseURL, path)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, method, targetURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	copyProxyHeaders(req.Header, headers)
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	return s.client.Do(req)
}

func (s *NewAPIService) ExtractEstimateRequest(ability string, contentType string, body []byte) EstimateRequest {
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

func (s *NewAPIService) resolveConfig() (model.NewAPIConfig, error) {
	item, err := s.repo.GetNewAPIConfig()
	if err == nil {
		return item, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return item, err
	}
	return model.NewAPIConfig{
		Name:    "default",
		BaseURL: s.cfg.NewAPIBaseURL,
		Token:   s.cfg.NewAPIToken,
		Enabled: true,
	}, nil
}

func copyProxyHeaders(dst http.Header, src http.Header) {
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

func joinURL(baseURL string, path string) (string, error) {
	parsed, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil {
		return "", err
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/") + "/" + strings.TrimLeft(path, "/")
	return parsed.String(), nil
}
