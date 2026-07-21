# OpenRouter 生图模型能力实施计划

> **供智能体执行者使用：** 必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 子技能，逐项执行本计划。各步骤使用复选框（- [ ]）跟踪进度。

**目标：** 生图工作台在展示或发送模型专属图片参数前，先从 OpenRouter 解析 Google Vertex endpoint 能力；同时移除 Gemini 2.5 Flash Image，并修复模型选择器布局。

**架构：** 新增一个受登录保护的 Go 能力解析服务，读取 OpenRouter 的 endpoint 级图片元数据，选择 Google Vertex，归一化响应并缓存 10 分钟；失败时回退到现有 model_capabilities 表中的具体模型记录。Next.js 工作台通过 TanStack Query 加载归一化能力，据此派生全部可见控件和请求参数，现有 NewAPI 生成链路保持不变。

**技术栈：** Go 1.23、Gin、GORM、PostgreSQL、React 19、Next.js 16 App Router、TypeScript、TanStack Query、Ant Design、Radix Select、Zustand、Bun test。

## 全局约束

- 生成链路保持为 Infinite Canvas -> NewAPI -> OpenRouter -> Google Vertex BYOK。
- 能力发现使用 OpenRouter Image Models 的 endpoint 记录，并且只接受 google-vertex endpoint。
- 只从生图模型选项中移除 google/gemini-2.5-flash-image，不移除 Gemini 2.5 文本模型。
- 不新增依赖，也不引入新的状态管理方案。
- 保持中文 UI 文案以及现有画布／工作台主题。
- 画布生成逻辑继续走现有兼容路径；本计划只修改生图工作台的能力流程。
- 不执行完整构建或大范围语法检查，只运行下文列出的定向 Go 与 Bun 测试。
- 不修改无关文件，也不覆盖用户已有改动。
- 实现完成后更新 pending-test.mdx，并确认 todo.mdx 无需修改。

---

## 文件映射

**新增文件**

- server/internal/service/model_capability.go — 获取 OpenRouter endpoint、选择 Google Vertex、归一化、缓存及数据库回退。
- server/internal/service/model_capability_test.go — 解析、缓存、字段处理和回退测试。
- server/internal/handler/model_capability.go — 受登录保护的 HTTP 接口入参校验与响应。
- web/src/services/api/model-capabilities.ts — 平台能力解析接口的类型化前端客户端。
- web/src/lib/image-model-capability.ts — 纯函数形式的选项归一化、请求参数和参考图限制工具。
- web/tests/image-model-capability.test.ts — 前端模型能力行为测试。

**修改文件**

- server/internal/router/router.go — 构造能力 service／handler 并注册受保护路由。
- server/internal/repository/db.go — 写入精确的 Google Vertex 回退记录，且不覆盖后台已有配置。
- web/src/stores/use-config-store.ts — 导出默认生图模型列表，并从中移除 Gemini 2.5 Flash Image。
- web/src/services/api/image.ts — 接收可选的已解析能力，只发送校验通过的分辨率、宽高比和参考图兼容数据。
- web/src/components/image-settings-panel.tsx — 按能力动态渲染分辨率和宽高比控件。
- web/src/components/model-picker.tsx — 完整展示长模型名，并让弹层宽度跟随触发框。
- web/src/app/(user)/image/page.tsx — 加载能力、控制生成可用性、按条件展示参考图、归一化选择，并把能力快照传入请求。
- docs/content/docs/progress/pending-test.mdx — 记录可由用户测试的工作台变更。

---

### 任务 1：新增 OpenRouter Google Vertex 能力解析服务

**文件：**

- 新增：server/internal/service/model_capability_test.go
- 新增：server/internal/service/model_capability.go
- 新增：server/internal/handler/model_capability.go
- 修改：server/internal/router/router.go
- 修改：server/internal/repository/db.go

**接口：**

- 使用：repository.Repository.FindModelCapability(modelName string, ability string) (model.ModelCapability, error)
- 产出：service.ImageModelCapability
- 产出：service.NewModelCapabilityService(repo *repository.Repository) *service.ModelCapabilityService
- 产出：(*service.ModelCapabilityService).Resolve(ctx context.Context, modelName string) (service.ImageModelCapability, error)
- 产出：GET /api/server/model-capabilities/resolve?model={openrouter-model-id}

- [ ] **步骤 1：编写会失败的 service 测试**

新增 server/internal/service/model_capability_test.go：

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

- [ ] **步骤 2：运行测试并确认处于 RED 状态**

在 server 目录运行：

~~~powershell
go test ./internal/service -run ModelCapability -v
~~~

预期：FAIL，因为 newModelCapabilityService 和 ImageModelCapability 尚不存在。

- [ ] **步骤 3：实现能力解析服务**

新增 server/internal/service/model_capability.go，并使用以下明确的公开结构和私有协作对象：

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

- [ ] **步骤 4：新增受保护的 handler 和路由**

新增 server/internal/handler/model_capability.go：

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

在 server/internal/router/router.go 中，紧邻其他创作 service 构造能力 service 和 handler：

~~~go
modelCapabilityService := service.NewModelCapabilityService(repo)
modelCapabilityHandler := handler.NewModelCapabilityHandler(modelCapabilityService)
~~~

在已登录保护组中、计费路由之后注册此路由：

~~~go
protected.GET("/model-capabilities/resolve", modelCapabilityHandler.Resolve)
~~~

- [ ] **步骤 5：写入具体模型的数据库回退记录**

在 server/internal/repository/db.go 中导入 gorm.io/gorm/clause，并把按总数判断的种子逻辑替换为不覆盖已有记录的插入：

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

同时在标准库导入中加入 encoding/json。

- [ ] **步骤 6：运行定向 Go 测试并确认处于 GREEN 状态**

在 server 目录运行：

~~~powershell
go test ./internal/service -run ModelCapability -v
go test ./internal/httpx ./internal/service
~~~

预期：PASS，两条新增模型能力测试和全部现有测试均通过。

- [ ] **步骤 7：提交后端能力解析实现**

~~~powershell
git add server/internal/service/model_capability.go server/internal/service/model_capability_test.go server/internal/handler/model_capability.go server/internal/router/router.go server/internal/repository/db.go
git commit -m "feat: resolve OpenRouter image capabilities"
~~~

---

### 任务 2：新增前端能力类型、工具函数、客户端与请求集成

**文件：**

- 新增：web/tests/image-model-capability.test.ts
- 新增：web/src/lib/image-model-capability.ts
- 新增：web/src/services/api/model-capabilities.ts
- 修改：web/src/stores/use-config-store.ts
- 修改：web/src/services/api/image.ts

**接口：**

- 使用：GET /api/server/model-capabilities/resolve?model={model}
- 产出：ImageModelCapability 类型
- 产出：resolveImageModelCapability(model: string): Promise<ImageModelCapability>
- 产出：normalizeImageCapabilitySelection(capability, resolution, aspectRatio)
- 产出：resolveImageCapabilityRequestOptions(capability, resolution, aspectRatio)
- 产出：imageReferencesForCapability(capability, references)
- 扩展：image.ts 的 RequestOptions，新增 imageCapability?: ImageModelCapability

- [ ] **步骤 1：编写会失败的前端行为测试**

新增 web/tests/image-model-capability.test.ts：

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

- [ ] **步骤 2：运行新增 Bun 测试并确认处于 RED 状态**

在 web 目录运行：

~~~powershell
bun test tests/image-model-capability.test.ts
~~~

预期：FAIL，因为工具模块和 DEFAULT_IMAGE_MODELS 导出尚不存在。

- [ ] **步骤 3：实现纯函数形式的能力工具**

新增 web/src/lib/image-model-capability.ts：

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

- [ ] **步骤 4：新增类型化前端 API 客户端**

新增 web/src/services/api/model-capabilities.ts：

~~~ts
import type { ImageModelCapability } from "@/lib/image-model-capability";
import { serverRequest } from "@/services/api/server";

export function resolveImageModelCapability(model: string) {
    const query = new URLSearchParams({ model });
    return serverRequest<ImageModelCapability>(`/model-capabilities/resolve?${query}`);
}
~~~

- [ ] **步骤 5：从生图选项中移除 Gemini 2.5 Flash Image**

在 web/src/stores/use-config-store.ts 中新增以下带渠道编码的导出常量：

~~~ts
export const DEFAULT_IMAGE_MODELS = [
    "default::google/gemini-3.1-flash-image",
    "default::google/gemini-3.1-flash-lite-image",
    "default::google/gemini-3-pro-image",
];
~~~

在 defaultConfig.channels[0].models 中保留以下三个原始模型字符串：

~~~ts
"google/gemini-3.1-flash-image",
"google/gemini-3.1-flash-lite-image",
"google/gemini-3-pro-image",
~~~

在 defaultConfig.models 中展开 ...DEFAULT_IMAGE_MODELS，并把 DEFAULT_IMAGE_MODELS 直接作为 defaultConfig.imageModels。只从这些生图列表中移除 google/gemini-2.5-flash-image 和 default::google/gemini-2.5-flash-image；textModels 中的 google/gemini-2.5-pro 与 google/gemini-2.5-flash 保持不变。

- [ ] **步骤 6：把已解析能力传入图片请求**

在 web/src/services/api/image.ts 中：

1. 导入 ImageModelCapability 和 resolveImageCapabilityRequestOptions。
2. 扩展 RequestOptions。
3. 在两条生成路径中，优先使用工作台已解析能力，而不是旧的 Google 硬编码解析器。

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

把两处 resolveGoogleImageRequestOptions 调用替换为：

~~~ts
const googleOptions = resolveImageRequestOptions(config, requestConfig.model, options);
~~~

保留现有 googleOptions 真值分支，让它继续负责省略通用 quality 和像素 size；这样即使能力对象为空，也不会发送不受支持的参数。

- [ ] **步骤 7：运行定向 Bun 测试并确认处于 GREEN 状态**

在 web 目录运行：

~~~powershell
bun test tests/image-model-capability.test.ts tests/image-generation-options.test.ts
~~~

预期：PASS。为保持画布兼容性，旧 image-generation-options 测试也应继续通过。

- [ ] **步骤 8：提交前端能力基础实现**

~~~powershell
git add web/tests/image-model-capability.test.ts web/src/lib/image-model-capability.ts web/src/services/api/model-capabilities.ts web/src/stores/use-config-store.ts web/src/services/api/image.ts
git commit -m "feat: add image capability client"
~~~

---

### 任务 3：让工作台 UI 由能力驱动，并修复模型选择器

**文件：**

- 修改：web/src/app/(user)/image/page.tsx
- 修改：web/src/components/image-settings-panel.tsx
- 修改：web/src/components/model-picker.tsx

**接口：**

- 使用：resolveImageModelCapability(model)
- 使用：ImageModelCapability
- 使用：normalizeImageCapabilitySelection
- 使用：imageReferencesForCapability
- 产出：ImageSettingsPanel 的 capability?: ImageModelCapability 属性

- [ ] **步骤 1：在工作台接入能力加载**

在 web/src/app/(user)/image/page.tsx 中：

1. 导入 useQuery、能力 API、modelOptionName 和工具函数。
2. 使用归一化后的 OpenRouter 模型 ID 解析能力。
3. 只有能力加载完成后才允许生成。

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

新增 effect，把失效的模型参数选择归一化：

~~~ts
useEffect(() => {
    if (!capability) return;
    const next = normalizeImageCapabilitySelection(capability, config.quality, config.size);
    if (next.resolution && next.resolution !== config.quality) updateConfig("quality", next.resolution);
    if (next.aspectRatio && next.aspectRatio !== config.size) updateConfig("size", next.aspectRatio);
}, [capability, config.quality, config.size, updateConfig]);
~~~

不要使用 placeholderData 或 keepPreviousData；新模型能力加载期间必须移除旧模型参数。

- [ ] **步骤 2：强制执行参考图支持状态和数量限制**

在加入上传、剪贴板或素材选择器中的参考图前，先计算：

~~~ts
const availableReferenceSlots = capability?.supportsReferences
    ? Math.max(0, capability.maxReferences - references.length)
    : 0;
~~~

只加入前 availableReferenceSlots 张图片；该值为零时显示：

~~~ts
message.warning(capability?.supportsReferences
    ? `当前模型最多支持 ${capability.maxReferences} 张参考图`
    : "当前模型不支持参考图");
~~~

修改 buildRequestSnapshot，要求能力已加载并校验参考图：

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

修改 runGenerationSlot 的快照类型，并传入不可变能力快照：

~~~ts
const requestOptions = { imageCapability: snapshot.capability };
const result = snapshot.references.length
    ? await requestEdit(snapshot.config, snapshot.text, snapshot.references, undefined, requestOptions)
    : await requestGeneration(snapshot.config, snapshot.text, requestOptions);
~~~

- [ ] **步骤 3：渲染加载、错误和参考图状态**

只有 capability?.supportsReferences 为 true 时才渲染现有参考图区。如果已经选择了参考图，但切换后的模型不支持参考图，则在组件状态中保留这些图片、隐藏参考图区，并通过以 capability.model 为依赖的 effect 只提示一次。

把能力状态传给 GenerationSettings：

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

在 GenerationSettings 内始终显示模型选择器，并在它下面准确渲染以下三个分支之一：

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

- [ ] **步骤 4：让 ImageSettingsPanel 使用 endpoint 枚举**

在 web/src/components/image-settings-panel.tsx 中：

1. 在 props 中加入 capability?: ImageModelCapability。
2. capability 存在时，从它的数组派生可见的质量／分辨率与宽高比选项。
3. 能力驱动面板中不添加 auto 或像素尺寸控件。
4. 对画布调用方保持现有无 capability 行为不变。

使用以下比例适配器，让极端比例无需硬编码也能得到合理图标：

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

在组件顶部派生：

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

capabilityMode 为 true 时使用“分辨率”作为标题、隐藏任意 W/H 尺寸输入，并把选中的比例直接写入 config.size。

- [ ] **步骤 5：修复模型选择器宽度和长名称显示**

在工作台 GenerationSettings 中，把模型字段外层改为横跨两列：

~~~tsx
<label className="col-span-2 block min-w-0">
~~~

在 web/src/components/model-picker.tsx 中：

- 触发框显示 modelOptionName(current)，同时在 title 中保留 modelOptionLabel。
- 弹层宽度至少等于触发框，且不超过视口。
- 模型名和渠道名分两行展示。

使用：

~~~tsx
<span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">
    {current ? modelOptionName(current) : placeholder}
</span>
~~~

修改 SelectContent：

~~~tsx
className="z-[1200] w-[min(28rem,calc(100vw-24px))] min-w-[var(--radix-select-trigger-width)] rounded-xl border border-border/70 bg-popover p-1 shadow-xl"
~~~

把 ModelLabel 替换为：

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

在现有 store 导入中加入 decodeChannelModel。

- [ ] **步骤 6：运行定向前端测试**

在 web 目录运行：

~~~powershell
bun test tests/image-model-capability.test.ts tests/image-generation-options.test.ts
~~~

预期：PASS。

- [ ] **步骤 7：提交工作台 UI**

~~~powershell
git add 'web/src/app/(user)/image/page.tsx' web/src/components/image-settings-panel.tsx web/src/components/model-picker.tsx
git commit -m "feat: adapt image workbench to model capabilities"
~~~

---

### 任务 4：验证集成行为并更新 pending-test 文档

**文件：**

- 修改：docs/content/docs/progress/pending-test.mdx
- 仅检查：docs/content/docs/progress/todo.mdx

**接口：**

- 使用：已完成的后端能力解析服务和前端工作台。
- 产出：一条可由用户测试的 pending-test 记录，以及定向自动／人工检查证据。

- [ ] **步骤 1：运行全部定向自动化测试**

运行：

~~~powershell
Set-Location server
go test ./internal/httpx ./internal/service
Set-Location ../web
bun test tests/image-model-capability.test.ts tests/image-generation-options.test.ts
~~~

预期：全部定向测试 PASS，且新代码没有引入警告。不运行 next build。

- [ ] **步骤 2：检查本地 3006 端口页面**

在应用内浏览器打开 http://localhost:3006/image，并确认：

1. 模型字段占满参数栏宽度。
2. 每个下拉项分行显示完整模型 ID 和平台渠道。
3. Gemini 2.5 Flash Image 已移除。
4. Flash Lite 只显示 1K。
5. Flash 显示 512、1K、2K、4K。
6. Pro 只显示 1K、2K。
7. Flash／Lite 显示 14 个 endpoint 比例；Pro 显示 10 个。
8. 三个当前模型都暴露 input_references，因此参考图区可见。
9. 切换模型时，旧模型控件会暂时消失，直到新能力准备完成。

- [ ] **步骤 3：检查能力请求和生成路由**

在浏览器网络面板中切换模型并确认：

~~~text
GET /api/server/model-capabilities/resolve?model=google%2F...
~~~

生成一张图片，并确认生成请求仍然发送到：

~~~text
POST /api/server/ai/images/generations
~~~

对 Pro 模型，确认发出的请求体不可能包含 resolution=4K。

- [ ] **步骤 4：更新 pending-test.mdx**

该文件当前包含重复的第二段 frontmatter 和重复列表。删除第二段 frontmatter 与重复块，确保每条现有的唯一事项只保留一次，然后把下面这条加入唯一的有效 pending-test 列表：

~~~md
- 生图工作台模型能力适配：移除 Gemini 2.5 Flash Image，修复长模型名称显示；切换模型时从 OpenRouter 读取 Google Vertex endpoint 的分辨率、宽高比和参考图能力，仅展示并发送当前模型支持的参数，OpenRouter 不可用时回退具体模型的本地能力记录。
~~~

检查 docs/content/docs/progress/todo.mdx。预期：不存在对应待办，因此保持不变。

- [ ] **步骤 5：审查最终差异**

运行：

~~~powershell
git status --short
git diff --check
git diff --stat
~~~

预期：只有本计划列出的文件发生变化，没有空白字符错误，也没有无关改动。

- [ ] **步骤 6：提交文档**

~~~powershell
git add docs/content/docs/progress/pending-test.mdx
git commit -m "docs: note dynamic image model capabilities"
~~~
