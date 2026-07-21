# OpenRouter Image Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make the image workbench resolve Google Vertex endpoint capabilities from OpenRouter before showing or sending model-specific image parameters, while removing Gemini 2.5 Flash Image and fixing the model picker layout.

**Architecture:** Add a protected Go capability resolver that reads OpenRouter per-endpoint image metadata, selects Google Vertex, normalizes the response, caches it for 10 minutes, and falls back to exact-model rows in the existing model_capabilities table. The Next.js workbench loads that normalized capability through TanStack Query, derives all visible controls and request parameters from it, and keeps the existing NewAPI generation route unchanged.

**Tech Stack:** Go 1.23, Gin, GORM, PostgreSQL, React 19, Next.js 16 App Router, TypeScript, TanStack Query, Ant Design, Radix Select, Zustand, Bun test.

## Global Constraints

- Generation remains Infinite Canvas -> NewAPI -> OpenRouter -> Google Vertex BYOK.
- Capability discovery uses OpenRouter Image Models endpoint records and only accepts google-vertex endpoints.
- Remove only google/gemini-2.5-flash-image from image-model choices; do not remove Gemini 2.5 text models.
- Do not add dependencies or introduce a new state-management system.
- Keep Chinese UI copy and the existing canvas/workbench theme.
- Keep canvas generation behavior on its existing compatibility path; this plan changes only the image workbench capability flow.
- Do not run a full build or broad syntax check; run only the targeted Go and Bun tests listed below.
- Do not modify unrelated files or existing user changes.
- After implementation, update pending-test.mdx and confirm todo.mdx needs no change.

---

## File Map

**Create**

- server/internal/service/model_capability.go — OpenRouter endpoint fetch, Google Vertex selection, normalization, cache, and database fallback.
- server/internal/service/model_capability_test.go — resolver, cache, parsing, and fallback tests.
- server/internal/handler/model_capability.go — authenticated HTTP endpoint input validation and response.
- web/src/services/api/model-capabilities.ts — typed frontend client for the platform resolver.
- web/src/lib/image-model-capability.ts — pure selection, request-option, and reference-limit helpers.
- web/tests/image-model-capability.test.ts — frontend capability behavior tests.

**Modify**

- server/internal/router/router.go — construct the capability service/handler and register the protected route.
- server/internal/repository/db.go — seed exact Google Vertex fallback records without overwriting admin changes.
- web/src/stores/use-config-store.ts — export the default image model list and remove Gemini 2.5 Flash Image from it.
- web/src/services/api/image.ts — accept an optional resolved capability and send only validated resolution/aspect/reference-compatible data.
- web/src/components/image-settings-panel.tsx — render dynamic capability-driven resolution and ratio controls.
- web/src/components/model-picker.tsx — make long model names readable and the popup follow the trigger width.
- web/src/app/(user)/image/page.tsx — load capabilities, gate generation, conditionally show references, normalize selections, and pass capability snapshots into requests.
- docs/content/docs/progress/pending-test.mdx — record the user-testable workbench change.

---

### Task 1: Add the OpenRouter Google Vertex capability resolver

**Files:**

- Create: server/internal/service/model_capability_test.go
- Create: server/internal/service/model_capability.go
- Create: server/internal/handler/model_capability.go
- Modify: server/internal/router/router.go
- Modify: server/internal/repository/db.go

**Interfaces:**

- Consumes: repository.Repository.FindModelCapability(modelName string, ability string) (model.ModelCapability, error)
- Produces: service.ImageModelCapability
- Produces: service.NewModelCapabilityService(repo *repository.Repository) *service.ModelCapabilityService
- Produces: (*service.ModelCapabilityService).Resolve(ctx context.Context, modelName string) (service.ImageModelCapability, error)
- Produces: GET /api/server/model-capabilities/resolve?model={openrouter-model-id}

- [ ] **Step 1: Write failing service tests**

Create server/internal/service/model_capability_test.go:

~~~go
package service

import (
    "context"
    "net/http"
    "net/http/httptest"
    "sync/atomic"
    "testing"
    "time"

    "infinite-canvas/server/internal/model"

    "gorm.io/datatypes"
    "gorm.io/gorm"
)

type stubCapabilityRepository struct {
    item model.ModelCapability
    err  error
}

func (s stubCapabilityRepository) FindModelCapability(string, string) (model.ModelCapability, error) {
    return s.item, s.err
}

func TestModelCapabilitySelectsGoogleVertexAndCaches(t *testing.T) {
    var requests int32
    upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        atomic.AddInt32(&requests, 1)
        w.Header().Set("Content-Type", "application/json")
        _, _ = w.Write([]byte(`{
            "id":"google/gemini-3-pro-image",
            "endpoints":[
                {
                    "provider_slug":"google-ai-studio/global",
                    "provider_tag":"google-ai-studio/global",
                    "supported_parameters":{
                        "resolution":{"type":"enum","values":["1K","2K","4K"]}
                    }
                },
                {
                    "provider_slug":"google-vertex/global",
                    "provider_tag":"google-vertex/global",
                    "supported_parameters":{
                        "resolution":{"type":"enum","values":["1K","2K"]},
                        "aspect_ratio":{"type":"enum","values":["1:1","16:9"]},
                        "n":{"type":"range","min":1,"max":1},
                        "input_references":{"type":"range","min":0,"max":14}
                    }
                }
            ]
        }`))
    }))
    defer upstream.Close()

    resolver := newModelCapabilityService(
        stubCapabilityRepository{err: gorm.ErrRecordNotFound},
        upstream.Client(),
        upstream.URL,
        time.Now,
    )

    first, err := resolver.Resolve(context.Background(), "default::google/gemini-3-pro-image")
    if err != nil {
        t.Fatalf("resolve capability: %v", err)
    }
    second, err := resolver.Resolve(context.Background(), "google/gemini-3-pro-image")
    if err != nil {
        t.Fatalf("resolve cached capability: %v", err)
    }

    if first.Provider != "google-vertex/global" {
        t.Fatalf("expected Google Vertex, got %q", first.Provider)
    }
    if len(first.SupportedResolutions) != 2 || first.SupportedResolutions[1] != "2K" {
        t.Fatalf("expected Vertex resolutions without 4K, got %#v", first.SupportedResolutions)
    }
    if !first.SupportsReferences || first.MaxReferences != 14 || first.MaxOutputsPerRequest != 1 {
        t.Fatalf("unexpected range capabilities: %#v", first)
    }
    if second.Source != "cache" {
        t.Fatalf("expected cache source, got %q", second.Source)
    }
    if atomic.LoadInt32(&requests) != 1 {
        t.Fatalf("expected one upstream request, got %d", requests)
    }
}

func TestModelCapabilityFallsBackToExactDatabaseModel(t *testing.T) {
    upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        http.Error(w, "unavailable", http.StatusBadGateway)
    }))
    defer upstream.Close()

    resolver := newModelCapabilityService(
        stubCapabilityRepository{item: model.ModelCapability{
            Model:                     "google/gemini-3.1-flash-lite-image",
            Ability:                   "image",
            MaxReferences:             14,
            MaxOutputs:                1,
            SupportedRatiosJSON:      datatypes.JSON([]byte(`["1:1","16:9"]`)),
            SupportedResolutionsJSON: datatypes.JSON([]byte(`["1K"]`)),
            Enabled:                  true,
        }},
        upstream.Client(),
        upstream.URL,
        time.Now,
    )

    got, err := resolver.Resolve(context.Background(), "google/gemini-3.1-flash-lite-image")
    if err != nil {
        t.Fatalf("resolve fallback: %v", err)
    }
    if got.Source != "database" || got.Provider != "google-vertex" {
        t.Fatalf("unexpected fallback source: %#v", got)
    }
    if len(got.SupportedResolutions) != 1 || got.SupportedResolutions[0] != "1K" {
        t.Fatalf("unexpected fallback resolutions: %#v", got.SupportedResolutions)
    }
}
~~~

- [ ] **Step 2: Run the tests and verify RED**

Run from server:

~~~powershell
go test ./internal/service -run ModelCapability -v
~~~

Expected: FAIL because newModelCapabilityService and ImageModelCapability do not exist.

- [ ] **Step 3: Implement the resolver**

Create server/internal/service/model_capability.go with these exact public shapes and private collaborators:

~~~go
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
    Model                    string   `json:"model"`
    Provider                 string   `json:"provider"`
    SupportedRatios          []string `json:"supportedRatios"`
    SupportedResolutions     []string `json:"supportedResolutions"`
    SupportsReferences       bool     `json:"supportsReferences"`
    MaxReferences            int      `json:"maxReferences"`
    MaxOutputsPerRequest     int      `json:"maxOutputsPerRequest"`
    Source                   string   `json:"source"`
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
            return ImageModelCapability{}, fmt.Errorf("读取模型能力失败: %w", upstreamErr)
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
        Model: modelName, Provider: provider,
        SupportedRatios: ratios, SupportedResolutions: resolutions,
        SupportsReferences: references.Max > 0, MaxReferences: references.Max,
        MaxOutputsPerRequest: outputs.Max, Source: "openrouter",
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
        Model: modelName, Provider: "google-vertex",
        SupportedRatios: ratios, SupportedResolutions: resolutions,
        SupportsReferences: item.MaxReferences > 0, MaxReferences: item.MaxReferences,
        MaxOutputsPerRequest: item.MaxOutputs, Source: "database",
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
~~~

- [ ] **Step 4: Add the protected handler and route**

Create server/internal/handler/model_capability.go:

~~~go
package handler

import (
    "net/http"
    "strings"

    "infinite-canvas/server/internal/httpx"
    "infinite-canvas/server/internal/service"

    "github.com/gin-gonic/gin"
)

type ModelCapabilityHandler struct {
    capabilities *service.ModelCapabilityService
}

func NewModelCapabilityHandler(capabilities *service.ModelCapabilityService) *ModelCapabilityHandler {
    return &ModelCapabilityHandler{capabilities: capabilities}
}

func (h *ModelCapabilityHandler) Resolve(c *gin.Context) {
    modelName := strings.TrimSpace(c.Query("model"))
    if modelName == "" {
        httpx.Fail(c, http.StatusBadRequest, "model 不能为空")
        return
    }
    result, err := h.capabilities.Resolve(c.Request.Context(), modelName)
    writeResult(c, result, err)
}
~~~

In server/internal/router/router.go, construct the service and handler next to the other creative services:

~~~go
modelCapabilityService := service.NewModelCapabilityService(repo)
modelCapabilityHandler := handler.NewModelCapabilityHandler(modelCapabilityService)
~~~

Register this route after the billing routes inside the authenticated protected group:

~~~go
protected.GET("/model-capabilities/resolve", modelCapabilityHandler.Resolve)
~~~

- [ ] **Step 5: Seed exact-model database fallbacks**

In server/internal/repository/db.go, import gorm.io/gorm/clause and replace the count-based seed with an insert that does not overwrite existing rows:

~~~go
func seedModelCapabilities(db *gorm.DB) error {
    items := []model.ModelCapability{
        {
            Model: "default", Ability: "image", ModelFamily: "generic",
            DisplayNameJSON: datatypes.JSON([]byte(`{"zh-CN":"默认模型","en-US":"Default model"}`)),
            MaxReferences: 4, MaxOutputs: 4,
            SupportedRatiosJSON: datatypes.JSON([]byte(`["1:1","3:4","4:3","9:16","16:9"]`)),
            SupportedResolutionsJSON: datatypes.JSON([]byte(`["1024x1024"]`)),
            Enabled: true,
            RecommendedRolesJSON: datatypes.JSON([]byte(`["subject","style","composition","element"]`)),
            MetadataJSON: datatypes.JSON([]byte(`{}`)),
        },
        imageCapabilitySeed(
            "google/gemini-3.1-flash-lite-image",
            []string{"1K"},
            []string{"1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"},
        ),
        imageCapabilitySeed(
            "google/gemini-3.1-flash-image",
            []string{"512","1K","2K","4K"},
            []string{"1:1","1:4","1:8","2:3","3:2","3:4","4:1","4:3","4:5","5:4","8:1","9:16","16:9","21:9"},
        ),
        imageCapabilitySeed(
            "google/gemini-3-pro-image",
            []string{"1K","2K"},
            []string{"1:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","21:9"},
        ),
    }
    return db.Clauses(clause.OnConflict{
        Columns: []clause.Column{{Name: "model"}, {Name: "ability"}},
        DoNothing: true,
    }).Create(&items).Error
}

func imageCapabilitySeed(modelName string, resolutions []string, ratios []string) model.ModelCapability {
    resolutionsJSON, _ := json.Marshal(resolutions)
    ratiosJSON, _ := json.Marshal(ratios)
    return model.ModelCapability{
        Model: modelName, Ability: "image", ModelFamily: "gemini-image",
        DisplayNameJSON: datatypes.JSON([]byte(`{}`)),
        MaxReferences: 14, MaxOutputs: 1,
        SupportedRatiosJSON: datatypes.JSON(ratiosJSON),
        SupportedResolutionsJSON: datatypes.JSON(resolutionsJSON),
        Enabled: true,
        RecommendedRolesJSON: datatypes.JSON([]byte(`["subject","style","composition","element"]`)),
        MetadataJSON: datatypes.JSON([]byte(`{"provider":"google-vertex"}`)),
    }
}
~~~

Also add encoding/json to the standard imports.

- [ ] **Step 6: Run targeted Go tests and verify GREEN**

Run from server:

~~~powershell
go test ./internal/service -run ModelCapability -v
go test ./internal/httpx ./internal/service
~~~

Expected: PASS with the two new model-capability tests and all existing tests passing.

- [ ] **Step 7: Commit the backend resolver**

~~~powershell
git add server/internal/service/model_capability.go server/internal/service/model_capability_test.go server/internal/handler/model_capability.go server/internal/router/router.go server/internal/repository/db.go
git commit -m "feat: resolve OpenRouter image capabilities"
~~~

---

### Task 2: Add frontend capability types, helpers, client, and request integration

**Files:**

- Create: web/tests/image-model-capability.test.ts
- Create: web/src/lib/image-model-capability.ts
- Create: web/src/services/api/model-capabilities.ts
- Modify: web/src/stores/use-config-store.ts
- Modify: web/src/services/api/image.ts

**Interfaces:**

- Consumes: GET /api/server/model-capabilities/resolve?model={model}
- Produces: ImageModelCapability type
- Produces: resolveImageModelCapability(model: string): Promise<ImageModelCapability>
- Produces: normalizeImageCapabilitySelection(capability, resolution, aspectRatio)
- Produces: resolveImageCapabilityRequestOptions(capability, resolution, aspectRatio)
- Produces: imageReferencesForCapability(capability, references)
- Extends: image.ts RequestOptions with imageCapability?: ImageModelCapability

- [ ] **Step 1: Write failing frontend behavior tests**

Create web/tests/image-model-capability.test.ts:

~~~ts
import { describe, expect, test } from "bun:test";

import {
    imageReferencesForCapability,
    normalizeImageCapabilitySelection,
    resolveImageCapabilityRequestOptions,
    type ImageModelCapability,
} from "../src/lib/image-model-capability";
import { DEFAULT_IMAGE_MODELS } from "../src/stores/use-config-store";

const capability: ImageModelCapability = {
    model: "google/gemini-3-pro-image",
    provider: "google-vertex/global",
    supportedRatios: ["1:1", "16:9"],
    supportedResolutions: ["1K", "2K"],
    supportsReferences: true,
    maxReferences: 2,
    maxOutputsPerRequest: 1,
    source: "openrouter",
};

describe("image model capabilities", () => {
    test("removes Gemini 2.5 Flash Image from default image choices", () => {
        expect(DEFAULT_IMAGE_MODELS).not.toContain("default::google/gemini-2.5-flash-image");
    });

    test("normalizes unsupported selections to 1K and 1:1", () => {
        expect(normalizeImageCapabilitySelection(capability, "4K", "21:9")).toEqual({
            resolution: "1K",
            aspectRatio: "1:1",
        });
    });

    test("sends only options declared by the resolved capability", () => {
        expect(resolveImageCapabilityRequestOptions(capability, "2K", "16:9")).toEqual({
            resolution: "2K",
            aspect_ratio: "16:9",
        });
        expect(resolveImageCapabilityRequestOptions(capability, "4K", "21:9")).toEqual({});
    });

    test("drops references for unsupported models and rejects over-limit batches", () => {
        const references = [{ id: "a" }, { id: "b" }, { id: "c" }];
        expect(imageReferencesForCapability({ ...capability, supportsReferences: false }, references)).toEqual([]);
        expect(() => imageReferencesForCapability(capability, references)).toThrow("当前模型最多支持 2 张参考图");
    });
});
~~~

- [ ] **Step 2: Run the new Bun test and verify RED**

Run from web:

~~~powershell
bun test tests/image-model-capability.test.ts
~~~

Expected: FAIL because the helper module and DEFAULT_IMAGE_MODELS export do not exist.

- [ ] **Step 3: Implement the pure capability helpers**

Create web/src/lib/image-model-capability.ts:

~~~ts
export type ImageModelCapability = {
    model: string;
    provider: string;
    supportedRatios: string[];
    supportedResolutions: string[];
    supportsReferences: boolean;
    maxReferences: number;
    maxOutputsPerRequest: number;
    source: "openrouter" | "cache" | "database";
};

export function normalizeImageCapabilitySelection(capability: ImageModelCapability, resolution: string, aspectRatio: string) {
    return {
        resolution: supportedValue(capability.supportedResolutions, resolution, "1K"),
        aspectRatio: supportedValue(capability.supportedRatios, aspectRatio, "1:1"),
    };
}

export function resolveImageCapabilityRequestOptions(capability: ImageModelCapability, resolution: string, aspectRatio: string) {
    return {
        ...(capability.supportedResolutions.includes(resolution) ? { resolution } : {}),
        ...(capability.supportedRatios.includes(aspectRatio) ? { aspect_ratio: aspectRatio } : {}),
    };
}

export function imageReferencesForCapability<T>(capability: ImageModelCapability, references: T[]) {
    if (!capability.supportsReferences) return [];
    if (references.length > capability.maxReferences) {
        throw new Error(`当前模型最多支持 ${capability.maxReferences} 张参考图`);
    }
    return references;
}

function supportedValue(values: string[], current: string, preferred: string) {
    if (values.includes(current)) return current;
    if (values.includes(preferred)) return preferred;
    return values[0] || "";
}
~~~

- [ ] **Step 4: Add the typed frontend API client**

Create web/src/services/api/model-capabilities.ts:

~~~ts
import type { ImageModelCapability } from "@/lib/image-model-capability";
import { serverRequest } from "@/services/api/server";

export function resolveImageModelCapability(model: string) {
    const query = new URLSearchParams({ model });
    return serverRequest<ImageModelCapability>(`/model-capabilities/resolve?${query}`);
}
~~~

- [ ] **Step 5: Remove Gemini 2.5 Flash Image from image choices**

In web/src/stores/use-config-store.ts, introduce the exported encoded constant:

~~~ts
export const DEFAULT_IMAGE_MODELS = [
    "default::google/gemini-3.1-flash-image",
    "default::google/gemini-3.1-flash-lite-image",
    "default::google/gemini-3-pro-image",
];
~~~

Keep these three raw image strings inline in defaultConfig.channels[0].models:

~~~ts
"google/gemini-3.1-flash-image",
"google/gemini-3.1-flash-lite-image",
"google/gemini-3-pro-image",
~~~

Use ...DEFAULT_IMAGE_MODELS inside defaultConfig.models and DEFAULT_IMAGE_MODELS as defaultConfig.imageModels. Remove only google/gemini-2.5-flash-image and default::google/gemini-2.5-flash-image from those image lists. Leave google/gemini-2.5-pro and google/gemini-2.5-flash in textModels.

- [ ] **Step 6: Pass resolved capabilities into image requests**

In web/src/services/api/image.ts:

1. Import ImageModelCapability and resolveImageCapabilityRequestOptions.
2. Extend RequestOptions.
3. Prefer the resolved workbench capability over the legacy hardcoded Google resolver in both generation paths.

~~~ts
import {
    resolveImageCapabilityRequestOptions,
    type ImageModelCapability,
} from "@/lib/image-model-capability";

type RequestOptions = {
    signal?: AbortSignal;
    imageCapability?: ImageModelCapability;
};

function resolveImageRequestOptions(config: AiConfig, model: string, options?: RequestOptions) {
    if (options?.imageCapability) {
        return resolveImageCapabilityRequestOptions(options.imageCapability, config.quality, config.size);
    }
    return resolveGoogleImageRequestOptions(model, config.quality, config.size);
}
~~~

Replace both calls to resolveGoogleImageRequestOptions with:

~~~ts
const googleOptions = resolveImageRequestOptions(config, requestConfig.model, options);
~~~

The existing googleOptions truthy branch must remain responsible for omitting generic quality and pixel size, so an empty capability object still sends no unsupported parameter.

- [ ] **Step 7: Run targeted Bun tests and verify GREEN**

Run from web:

~~~powershell
bun test tests/image-model-capability.test.ts tests/image-generation-options.test.ts
~~~

Expected: PASS. The legacy image-generation-options tests remain green for canvas compatibility.

- [ ] **Step 8: Commit the frontend capability foundation**

~~~powershell
git add web/tests/image-model-capability.test.ts web/src/lib/image-model-capability.ts web/src/services/api/model-capabilities.ts web/src/stores/use-config-store.ts web/src/services/api/image.ts
git commit -m "feat: add image capability client"
~~~

---

### Task 3: Make the workbench UI capability-driven and fix the model picker

**Files:**

- Modify: web/src/app/(user)/image/page.tsx
- Modify: web/src/components/image-settings-panel.tsx
- Modify: web/src/components/model-picker.tsx

**Interfaces:**

- Consumes: resolveImageModelCapability(model)
- Consumes: ImageModelCapability
- Consumes: normalizeImageCapabilitySelection
- Consumes: imageReferencesForCapability
- Produces: ImageSettingsPanel capability?: ImageModelCapability prop

- [ ] **Step 1: Add capability loading to the workbench**

In web/src/app/(user)/image/page.tsx:

1. Import useQuery, the capability API, modelOptionName, and helper functions.
2. Resolve capabilities by normalized OpenRouter model ID.
3. Require a loaded capability before generation.

~~~ts
import { useQuery } from "@tanstack/react-query";
import {
    imageReferencesForCapability,
    normalizeImageCapabilitySelection,
    type ImageModelCapability,
} from "@/lib/image-model-capability";
import { resolveImageModelCapability } from "@/services/api/model-capabilities";
import { modelOptionLabel, modelOptionName, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";

const model = effectiveConfig.imageModel || effectiveConfig.model;
const capabilityQuery = useQuery({
    queryKey: ["image-model-capability", modelOptionName(model)],
    queryFn: () => resolveImageModelCapability(modelOptionName(model)),
    enabled: Boolean(modelOptionName(model)),
    staleTime: 10 * 60 * 1000,
});
const capability = capabilityQuery.data;
const canGenerate = Boolean(prompt.trim() && capability && !capabilityQuery.isFetching);
~~~

Add an effect that normalizes stale model selections:

~~~ts
useEffect(() => {
    if (!capability) return;
    const next = normalizeImageCapabilitySelection(capability, config.quality, config.size);
    if (next.resolution && next.resolution !== config.quality) updateConfig("quality", next.resolution);
    if (next.aspectRatio && next.aspectRatio !== config.size) updateConfig("size", next.aspectRatio);
}, [capability, config.quality, config.size, updateConfig]);
~~~

Do not use placeholderData or keepPreviousData; parameters from the old model must disappear while a new key is loading.

- [ ] **Step 2: Enforce reference support and limits**

Before adding uploaded, clipboard, or asset-picker references, calculate:

~~~ts
const availableReferenceSlots = capability?.supportsReferences
    ? Math.max(0, capability.maxReferences - references.length)
    : 0;
~~~

Only add the first availableReferenceSlots images. When it is zero, show:

~~~ts
message.warning(capability?.supportsReferences
    ? `当前模型最多支持 ${capability.maxReferences} 张参考图`
    : "当前模型不支持参考图");
~~~

Update buildRequestSnapshot to require a capability and validate references:

~~~ts
if (!capability) {
    message.error("模型能力尚未加载");
    return null;
}
let supportedReferences: ReferenceImage[];
try {
    supportedReferences = imageReferencesForCapability(capability, references);
} catch (error) {
    message.error(error instanceof Error ? error.message : "参考图数量超出模型限制");
    return null;
}
return {
    text,
    config: { ...effectiveConfig, model, count: "1" },
    capability,
    references: supportedReferences,
};
~~~

Update the snapshot type in runGenerationSlot and pass the immutable capability:

~~~ts
const requestOptions = { imageCapability: snapshot.capability };
const result = snapshot.references.length
    ? await requestEdit(snapshot.config, snapshot.text, snapshot.references, undefined, requestOptions)
    : await requestGeneration(snapshot.config, snapshot.text, requestOptions);
~~~

- [ ] **Step 3: Render loading, error, and reference states**

Render the existing reference section only when capability?.supportsReferences is true. When a model with selected references does not support them, keep references in component state, hide the section, and show the warning once from an effect keyed by capability.model.

Pass capability state into GenerationSettings:

~~~tsx
<GenerationSettings
    config={effectiveConfig}
    model={model}
    capability={capability}
    capabilityLoading={capabilityQuery.isFetching}
    capabilityError={capabilityQuery.error}
    retryCapability={() => void capabilityQuery.refetch()}
    updateConfig={updateConfig}
    openConfigDialog={openConfigDialog}
/>
~~~

Inside GenerationSettings, keep the model picker visible at all times. Under it render exactly one of these branches:

~~~tsx
{capabilityLoading ? (
    <div className="col-span-2 flex items-center gap-2 py-6 text-sm text-stone-500">
        <LoaderCircle className="size-4 animate-spin" />
        正在读取模型能力
    </div>
) : capabilityError || !capability ? (
    <div className="col-span-2 flex items-center justify-between gap-3 rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-800">
        <span>模型能力读取失败，暂时无法生成</span>
        <Button size="small" onClick={retryCapability}>重试</Button>
    </div>
) : (
    <div className="col-span-2">
        <ImageSettingsPanel
            config={config}
            capability={capability}
            onConfigChange={(key, value) => updateConfig(key, value)}
            theme={theme}
            showTitle={false}
            className="space-y-4"
            maxCount={10}
        />
    </div>
)}
~~~

- [ ] **Step 4: Make ImageSettingsPanel use endpoint enums**

In web/src/components/image-settings-panel.tsx:

1. Add capability?: ImageModelCapability to props.
2. When capability exists, derive visible quality/resolution and aspect options from its arrays.
3. Do not add auto or pixel-dimension controls to a capability-driven panel.
4. Keep the existing no-capability behavior unchanged for canvas callers.

Use this ratio adapter so extreme ratios have meaningful icons without adding hardcoded entries:

~~~ts
function capabilityAspectOption(value: string) {
    const [width, height] = value.split(":").map(Number);
    return {
        value,
        label: value,
        width: width || 1,
        height: height || 1,
        icon: width === height ? "square" : width > height ? "landscape" : "portrait",
    };
}
~~~

At the top of the component derive:

~~~ts
const capabilityMode = Boolean(capability);
const visibleQualityOptions = capability
    ? capability.supportedResolutions.map((value) => ({ value, label: value }))
    : isGoogleImage
      ? (googleResolutions || []).map((value) => ({ value, label: value }))
      : qualityOptions;
const visibleAspectOptions = capability
    ? capability.supportedRatios.map(capabilityAspectOption)
    : isGoogleImage
      ? aspectOptions.filter((item) => !item.size)
      : aspectOptions;
const quality = capability ? config.quality : googleOptions?.resolution || config.quality || "auto";
const selectedAspect = capability
    ? visibleAspectOptions.find((item) => item.value === config.size)
    : isGoogleImage
      ? visibleAspectOptions.find((item) => item.value === (resolveGoogleImageAspectRatio(activeSize) || "auto"))
      : visibleAspectOptions.find((item) => (item.size || item.value) === activeSize || item.value === activeSize);
~~~

Use 分辨率 as the title when capabilityMode is true, hide arbitrary W/H dimensions when capabilityMode is true, and write the selected ratio directly into config.size.

- [ ] **Step 5: Fix model picker width and long labels**

In the workbench GenerationSettings, change the model label wrapper to span both columns:

~~~tsx
<label className="col-span-2 block min-w-0">
~~~

In web/src/components/model-picker.tsx:

- Display modelOptionName(current) in the trigger while retaining modelOptionLabel in title.
- Make the popup at least the trigger width and no wider than the viewport.
- Render model name and channel name on separate lines.

Use:

~~~tsx
<span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">
    {current ? modelOptionName(current) : placeholder}
</span>
~~~

Update SelectContent:

~~~tsx
className="z-[1200] w-[min(28rem,calc(100vw-24px))] min-w-[var(--radix-select-trigger-width)] rounded-xl border border-border/70 bg-popover p-1 shadow-xl"
~~~

Replace ModelLabel with:

~~~tsx
function ModelLabel({ config, model }: { config: AiConfig; model: string }) {
    const decoded = decodeChannelModel(model);
    const channel = decoded ? config.channels.find((item) => item.id === decoded.channelId) : undefined;
    return (
        <span className="flex min-w-0 items-start gap-2 py-1">
            <ModelIcon model={model} />
            <span className="flex min-w-0 flex-col items-start">
                <span className="whitespace-normal break-all text-left leading-5">{modelOptionName(model)}</span>
                {channel ? <span className="text-xs text-muted-foreground">{channel.name}</span> : null}
            </span>
        </span>
    );
}
~~~

Add decodeChannelModel to the existing store imports.

- [ ] **Step 6: Run targeted frontend tests**

Run from web:

~~~powershell
bun test tests/image-model-capability.test.ts tests/image-generation-options.test.ts
~~~

Expected: PASS.

- [ ] **Step 7: Commit the workbench UI**

~~~powershell
git add 'web/src/app/(user)/image/page.tsx' web/src/components/image-settings-panel.tsx web/src/components/model-picker.tsx
git commit -m "feat: adapt image workbench to model capabilities"
~~~

---

### Task 4: Verify the integrated behavior and update pending-test documentation

**Files:**

- Modify: docs/content/docs/progress/pending-test.mdx
- Inspect only: docs/content/docs/progress/todo.mdx

**Interfaces:**

- Consumes: completed backend resolver and frontend workbench.
- Produces: a user-testable pending-test entry and evidence from targeted automated/manual checks.

- [ ] **Step 1: Run all targeted automated tests**

Run:

~~~powershell
Set-Location server
go test ./internal/httpx ./internal/service
Set-Location ../web
bun test tests/image-model-capability.test.ts tests/image-generation-options.test.ts
~~~

Expected: all targeted tests PASS with no warnings introduced by the new code. Do not run next build.

- [ ] **Step 2: Inspect the local page at port 3006**

Open http://localhost:3006/image in the in-app browser and verify:

1. The model field uses the full settings-column width.
2. Every dropdown item shows the full model ID and platform channel on separate lines.
3. Gemini 2.5 Flash Image is absent.
4. Flash Lite shows only 1K.
5. Flash shows 512, 1K, 2K, and 4K.
6. Pro shows only 1K and 2K.
7. Flash/Lite show 14 endpoint ratios; Pro shows 10.
8. The reference area appears because the three current models expose input_references.
9. Switching models temporarily removes the old model controls until the new capability is ready.

- [ ] **Step 3: Inspect the capability request and generation route**

In the browser network panel, switch models and confirm:

~~~text
GET /api/server/model-capabilities/resolve?model=google%2F...
~~~

Generate one image and confirm the generation request still targets:

~~~text
POST /api/server/ai/images/generations
~~~

For Pro, confirm the outgoing payload cannot contain resolution=4K.

- [ ] **Step 4: Update pending-test.mdx**

The file currently contains a duplicated second frontmatter and repeated list. Remove the second frontmatter and repeated block while preserving every unique existing bullet once, then add this bullet to the single active pending-test list:

~~~md
- 生图工作台模型能力适配：移除 Gemini 2.5 Flash Image，修复长模型名称显示；切换模型时从 OpenRouter 读取 Google Vertex endpoint 的分辨率、宽高比和参考图能力，仅展示并发送当前模型支持的参数，OpenRouter 不可用时回退具体模型的本地能力记录。
~~~

Inspect docs/content/docs/progress/todo.mdx. Expected: no matching todo item exists, so leave it unchanged.

- [ ] **Step 5: Review the final diff**

Run:

~~~powershell
git status --short
git diff --check
git diff --stat
~~~

Expected: only the files listed in this plan are changed; no whitespace errors; no unrelated edits.

- [ ] **Step 6: Commit documentation**

~~~powershell
git add docs/content/docs/progress/pending-test.mdx
git commit -m "docs: note dynamic image model capabilities"
~~~
