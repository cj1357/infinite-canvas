package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/repository"
)

const openRouterImageModelsURL = "https://openrouter.ai/api/v1/images/models"
const modelCapabilityCacheTTL = 10 * time.Minute

type modelCapabilityRepository interface {
	FindModelCapability(modelName string, ability string) (model.ModelCapability, error)
}

type ImageModelCapability struct {
	Model                string   `json:"model"`
	Provider             string   `json:"provider"`
	SupportedRatios      []string `json:"supportedRatios"`
	SupportedResolutions []string `json:"supportedResolutions"`
	SupportsReferences   bool     `json:"supportsReferences"`
	MaxReferences        int      `json:"maxReferences"`
	MaxOutputsPerRequest int      `json:"maxOutputsPerRequest"`
	Source               string   `json:"source"`
}

type capabilityDescriptor struct {
	Type   string   `json:"type"`
	Values []string `json:"values"`
	Min    int      `json:"min"`
	Max    int      `json:"max"`
}

type openRouterImageEndpoint struct {
	ProviderSlug        string                          `json:"provider_slug"`
	ProviderTag         string                          `json:"provider_tag"`
	SupportedParameters map[string]capabilityDescriptor `json:"supported_parameters"`
}

type capabilityCacheEntry struct {
	value     ImageModelCapability
	expiresAt time.Time
}

type ModelCapabilityService struct {
	repo    modelCapabilityRepository
	client  *http.Client
	baseURL string
	now     func() time.Time
	mu      sync.Mutex
	cache   map[string]capabilityCacheEntry
}

func NewModelCapabilityService(repo *repository.Repository) *ModelCapabilityService {
	return newModelCapabilityService(repo, &http.Client{Timeout: 10 * time.Second}, openRouterImageModelsURL, time.Now)
}

func newModelCapabilityService(repo modelCapabilityRepository, client *http.Client, baseURL string, now func() time.Time) *ModelCapabilityService {
	return &ModelCapabilityService{repo: repo, client: client, baseURL: strings.TrimRight(baseURL, "/"), now: now, cache: map[string]capabilityCacheEntry{}}
}

func (s *ModelCapabilityService) Resolve(ctx context.Context, modelName string) (ImageModelCapability, error) {
	normalized, err := normalizeOpenRouterModelID(modelName)
	if err != nil {
		return ImageModelCapability{}, err
	}
	if cached, ok := s.cached(normalized); ok {
		cached.Source = "cache"
		return cached, nil
	}
	resolved, upstreamErr := s.fetchOpenRouter(ctx, normalized)
	if upstreamErr != nil {
		resolved, err = s.databaseFallback(normalized)
		if err != nil {
			return ImageModelCapability{}, fmt.Errorf("读取 OpenRouter 模型能力失败（%v），数据库回退失败: %w", upstreamErr, err)
		}
	}
	s.storeCache(normalized, resolved)
	return resolved, nil
}

func (s *ModelCapabilityService) fetchOpenRouter(ctx context.Context, modelName string) (ImageModelCapability, error) {
	parts := strings.SplitN(modelName, "/", 2)
	target := s.baseURL + "/" + url.PathEscape(parts[0]) + "/" + url.PathEscape(parts[1]) + "/endpoints"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return ImageModelCapability{}, err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return ImageModelCapability{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return ImageModelCapability{}, fmt.Errorf("OpenRouter 返回状态 %d", resp.StatusCode)
	}
	var payload struct {
		Endpoints []openRouterImageEndpoint `json:"endpoints"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return ImageModelCapability{}, err
	}
	endpoint, ok := selectGoogleVertexEndpoint(payload.Endpoints)
	if !ok {
		return ImageModelCapability{}, errors.New("模型没有 Google Vertex endpoint")
	}
	return capabilityFromEndpoint(modelName, endpoint), nil
}

func selectGoogleVertexEndpoint(items []openRouterImageEndpoint) (openRouterImageEndpoint, bool) {
	for _, item := range items {
		if item.ProviderTag == "google-vertex/global" || item.ProviderSlug == "google-vertex/global" {
			return item, true
		}
	}
	for _, item := range items {
		if strings.HasPrefix(item.ProviderTag, "google-vertex/") || strings.HasPrefix(item.ProviderSlug, "google-vertex/") {
			return item, true
		}
	}
	return openRouterImageEndpoint{}, false
}

func capabilityFromEndpoint(modelName string, endpoint openRouterImageEndpoint) ImageModelCapability {
	resolutions := endpoint.SupportedParameters["resolution"].Values
	ratios := endpoint.SupportedParameters["aspect_ratio"].Values
	references := endpoint.SupportedParameters["input_references"]
	outputs := endpoint.SupportedParameters["n"]
	provider := endpoint.ProviderTag
	if provider == "" {
		provider = endpoint.ProviderSlug
	}
	return ImageModelCapability{
		Model:                modelName,
		Provider:             provider,
		SupportedRatios:      ratios,
		SupportedResolutions: resolutions,
		SupportsReferences:   references.Max > 0,
		MaxReferences:        references.Max,
		MaxOutputsPerRequest: outputs.Max,
		Source:               "openrouter",
	}
}

func (s *ModelCapabilityService) databaseFallback(modelName string) (ImageModelCapability, error) {
	item, err := s.repo.FindModelCapability(modelName, "image")
	if err != nil {
		return ImageModelCapability{}, err
	}
	var ratios, resolutions []string
	if err := json.Unmarshal(item.SupportedRatiosJSON, &ratios); err != nil {
		return ImageModelCapability{}, err
	}
	if err := json.Unmarshal(item.SupportedResolutionsJSON, &resolutions); err != nil {
		return ImageModelCapability{}, err
	}
	return ImageModelCapability{
		Model:                modelName,
		Provider:             "google-vertex",
		SupportedRatios:      ratios,
		SupportedResolutions: resolutions,
		SupportsReferences:   item.MaxReferences > 0,
		MaxReferences:        item.MaxReferences,
		MaxOutputsPerRequest: item.MaxOutputs,
		Source:               "database",
	}, nil
}

func normalizeOpenRouterModelID(value string) (string, error) {
	value = strings.TrimSpace(value)
	if index := strings.LastIndex(value, "::"); index >= 0 {
		value = strings.TrimSpace(value[index+2:])
	}
	parts := strings.Split(value, "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", errors.New("model 必须是 OpenRouter 的 author/slug")
	}
	return value, nil
}

func (s *ModelCapabilityService) cached(modelName string) (ImageModelCapability, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.cache[modelName]
	return item.value, ok && s.now().Before(item.expiresAt)
}

func (s *ModelCapabilityService) storeCache(modelName string, value ImageModelCapability) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache[modelName] = capabilityCacheEntry{value: value, expiresAt: s.now().Add(modelCapabilityCacheTTL)}
}
