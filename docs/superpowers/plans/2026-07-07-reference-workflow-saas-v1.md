# Reference Workflow SaaS V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 infinite-canvas 落地为以参考图编排为核心的个人 AI 创作 SaaS V1。

**Architecture:** Go App Server 作为业务后端，PostgreSQL 存业务数据和任务，Cloudflare R2 存生产媒体文件，NewAPI 作为唯一模型网关并在其内部使用 OpenRouter 渠道。前端从 localforage 主数据源切换为登录后的云端领域 API，画布节点只引用媒体、资产、ReferenceSet、GenerationRun 和 GenerationOutput。

**Tech Stack:** Go + Gin + GORM + PostgreSQL；Next.js App Router + React + TypeScript + Ant Design + Tailwind + Zustand；Cloudflare R2/S3-compatible storage via minio-go；NewAPI OpenAI-compatible gateway。

## Global Constraints

- 不兼容旧 localforage 业务数据；当前项目未上线，可以直接重建字段、表结构和页面结构。
- 生产媒体存储使用 Cloudflare R2 私有桶；本地磁盘仅用于开发和调试。
- 模型请求只经过 NewAPI；OpenRouter 是 NewAPI 里的渠道，应用不直接调用 OpenRouter。
- 前端 UI、后端错误 key、Prompt 编译模板都要支持国际化，V1 支持 `zh-CN` 和 `en-US`。
- 后端保持 `{ code, data, msg }` 响应结构，同时增加稳定 `errorKey`。
- 后端遵循 `handler/` 只处理 HTTP，`service/` 处理业务，`repository/` 处理数据库，`model/` 定义结构。
- API 请求统一放在 `web/src/services/api/`。
- 画布相关状态和组件放在 `web/src/app/(user)/canvas/` 内部。
- 页面文案保持中文，同时必须通过 i18n key 输出。
- 不执行构建或测试作为完成前提；实现者应按本计划记录推荐验证命令，用户可自行运行。

---

## File Structure

### Backend

- Modify `server/internal/httpx/response.go`: add `errorKey` support while preserving `{ code, data, msg }`.
- Modify `server/internal/config/config.go`: replace NewAPI-specific env naming with generic model gateway fields and R2 settings.
- Modify `server/internal/model/cloud_data.go`: replace old cloud canvas/media structs with first-class creative domain structs.
- Modify `server/internal/model/billing.go`: extend model rate rules and generation accounting fields.
- Modify `server/internal/repository/db.go`: migrate all new domain models.
- Create `server/internal/repository/creative.go`: CRUD/list queries for media, assets, reference sets, intents, generation runs, outputs, jobs, capabilities, prompt templates.
- Modify `server/internal/storage/storage.go`: ensure R2 metadata, content type, delete, and local fallback match new MediaObject flow.
- Create `server/internal/service/model_gateway.go`: NewAPI gateway client.
- Create `server/internal/service/media_object.go`: upload/download/metadata creation for R2/local media.
- Create `server/internal/service/reference.go`: ReferenceSet/ReferenceIntent business logic and prompt compilation.
- Create `server/internal/service/generation.go`: GenerationRun creation, estimate, reserve, job creation, result persistence.
- Create `server/internal/service/job_worker.go`: PostgreSQL-backed worker loop and execution core.
- Create `server/internal/service/prompt_template.go`: locale/model-family template selection and rendering.
- Create `server/internal/service/creative_agent.go`: internal agent session/tool orchestration skeleton.
- Modify `server/internal/service/billing.go`: integrate expanded rate rule calculation and generation settlement.
- Create `server/internal/handler/creative.go`: APIs for media, assets, reference sets, generation runs, jobs, outputs.
- Create `server/internal/handler/admin_config.go`: admin APIs for gateway config, capabilities, rate rules, prompt templates, generation audit.
- Create `server/internal/handler/agent.go`: internal Creative Agent chat/tool API.
- Modify `server/internal/router/router.go`: wire new protected and admin routes.
- Modify `server/cmd/api/main.go`: start worker when enabled.
- Modify `docs/content/docs/backend/backend-database.mdx`: document new tables.
- Modify `.env.example`: add gateway, R2, worker, locale variables.

### Frontend

- Create `web/src/i18n/locales/zh-CN.ts`: Chinese translations.
- Create `web/src/i18n/locales/en-US.ts`: English translations.
- Create `web/src/i18n/index.ts`: locale registry and fallback.
- Create `web/src/i18n/use-i18n.ts`: React hook and formatter helpers.
- Modify `web/src/services/api/server.ts`: errorKey-aware request handling and new domain API functions.
- Create `web/src/services/api/creative.ts`: typed client for media/assets/reference/generation/job APIs.
- Create `web/src/services/api/admin-config.ts`: typed admin client for gateway/capabilities/rules/templates/jobs.
- Modify `web/src/stores/use-user-store.ts`: user locale preference.
- Create `web/src/stores/use-locale-store.ts`: unauthenticated locale persistence.
- Replace or reshape `web/src/app/(user)/canvas/types.ts`: new node types and domain references.
- Modify `web/src/app/(user)/canvas/stores/use-canvas-store.ts`: cloud-first project model with domain IDs.
- Create `web/src/app/(user)/canvas/components/reference-set-node.tsx`: compact canvas node.
- Create `web/src/app/(user)/canvas/components/reference-composer.tsx`: full composer panel/modal.
- Create `web/src/app/(user)/canvas/components/generation-node.tsx`: generation setup/status node.
- Create `web/src/app/(user)/canvas/components/result-group-node.tsx`: output review node.
- Modify `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`: integrate new nodes gradually and route generation through backend jobs.
- Modify `web/src/app/(user)/assets/page.tsx`: CreativeAsset library.
- Create `web/src/app/(user)/admin/models/page.tsx`: model capabilities.
- Create `web/src/app/(user)/admin/rates/page.tsx`: model rate rules.
- Create `web/src/app/(user)/admin/prompts/page.tsx`: prompt template manager.
- Create `web/src/app/(user)/admin/gateway/page.tsx`: NewAPI gateway config.
- Create `web/src/app/(user)/admin/generations/page.tsx`: generation audit and job retry/refund operations.
- Create `web/src/components/creative-agent/creative-agent-panel.tsx`: native product agent.
- Modify `web/src/components/layout/app-providers.tsx`: locale provider.
- Modify `web/src/components/layout/user-status-actions.tsx`: locale switcher and user menu adjustments.

---

### Task 1: API Envelope And i18n Foundation

**Files:**
- Modify: `server/internal/httpx/response.go`
- Create: `web/src/i18n/locales/zh-CN.ts`
- Create: `web/src/i18n/locales/en-US.ts`
- Create: `web/src/i18n/index.ts`
- Create: `web/src/i18n/use-i18n.ts`
- Modify: `web/src/services/api/server.ts`
- Create: `web/src/stores/use-locale-store.ts`
- Modify: `web/src/components/layout/app-providers.tsx`

**Interfaces:**
- Produces backend response shape: `Response{Code int, Data any, Msg string, ErrorKey string}`
- Produces frontend hook: `useI18n(): { locale, setLocale, t }`
- Produces API error class: `ServerApiError`

- [ ] **Step 1: Update backend response envelope**

Replace `server/internal/httpx/response.go` with this shape while preserving `OK`, `Fail`, and `Error` call sites:

```go
type Response struct {
	Code     int    `json:"code"`
	Data     any    `json:"data,omitempty"`
	Msg      string `json:"msg"`
	ErrorKey string `json:"errorKey,omitempty"`
}

func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, Response{Code: 0, Data: data, Msg: "ok"})
}

func Fail(c *gin.Context, status int, msg string) {
	FailKey(c, status, msg, msg)
}

func FailKey(c *gin.Context, status int, errorKey string, msg string) {
	if msg == "" {
		msg = http.StatusText(status)
	}
	if errorKey == "" {
		errorKey = msg
	}
	c.JSON(status, Response{Code: status, Msg: msg, ErrorKey: errorKey})
}
```

- [ ] **Step 2: Add frontend locale dictionaries**

Create `zh-CN.ts` and `en-US.ts` with keys used by new flows:

```ts
export const zhCN = {
    "common.loading": "加载中",
    "common.retry": "重试",
    "common.cancel": "取消",
    "error.quota.insufficient": "额度不足",
    "error.gateway.timeout": "模型网关请求超时",
    "reference.role.subject": "主体一致",
    "reference.role.style": "风格参考",
    "reference.role.composition": "构图参考",
    "reference.role.element": "局部元素",
    "generation.status.queued": "排队中",
    "generation.status.running": "生成中",
    "generation.status.succeeded": "已完成",
    "generation.status.failed": "生成失败",
} as const;
```

```ts
export const enUS = {
    "common.loading": "Loading",
    "common.retry": "Retry",
    "common.cancel": "Cancel",
    "error.quota.insufficient": "Insufficient credits",
    "error.gateway.timeout": "Model gateway request timed out",
    "reference.role.subject": "Subject consistency",
    "reference.role.style": "Style reference",
    "reference.role.composition": "Composition reference",
    "reference.role.element": "Element reference",
    "generation.status.queued": "Queued",
    "generation.status.running": "Generating",
    "generation.status.succeeded": "Completed",
    "generation.status.failed": "Failed",
} as const;
```

- [ ] **Step 3: Add i18n registry and hook**

`index.ts` exports `Locale`, `messages`, `defaultLocale`, and `translate(locale, key, params?)`. `use-i18n.ts` reads `useLocaleStore` and returns `t`.

- [ ] **Step 4: Make API request errors translation-ready**

In `web/src/services/api/server.ts`, parse `errorKey` and throw:

```ts
export class ServerApiError extends Error {
    constructor(
        public errorKey: string,
        message: string,
        public status: number,
        public data?: unknown,
    ) {
        super(message);
    }
}
```

- [ ] **Step 5: Recommended verification**

Command: `bun run format:check` from `web/`.

Expected: formatter reports no changed files after implementation formatting. Under project rules, the agent records this command but does not need to run it unless explicitly requested.

---

### Task 2: Domain Models And Database Registration

**Files:**
- Modify: `server/internal/model/cloud_data.go`
- Modify: `server/internal/model/billing.go`
- Modify: `server/internal/repository/db.go`
- Modify: `docs/content/docs/backend/backend-database.mdx`

**Interfaces:**
- Produces models: `MediaObject`, `CreativeAsset`, `ReferenceSet`, `ReferenceIntent`, `GenerationRun`, `GenerationOutput`, `GenerationJob`, `ModelCapability`, `PromptTemplate`

- [ ] **Step 1: Replace cloud domain structs**

In `cloud_data.go`, define first-class domain structs. Keep `CanvasProject` but change it to project metadata plus `DataJSON` for layout only.

Required structs:

```go
type MediaObject struct { BaseModel; UserID string; Kind string; StorageKey string; ThumbnailKey string; MimeType string; ByteSize int64; Width int; Height int; DurationMs int64; Sha256 string; MetadataJSON datatypes.JSON }
type CreativeAsset struct { BaseModel; UserID string; MediaObjectID string; Kind string; Title string; Description string; TagsJSON datatypes.JSON; Favorite bool; Rating int; DefaultReferenceIntentJSON datatypes.JSON; LocalizedTextJSON datatypes.JSON; UsageCount int64; LastUsedAt *time.Time; MetadataJSON datatypes.JSON }
type ReferenceSet struct { BaseModel; UserID string; ProjectID string; Title string; Description string; Source string; MetadataJSON datatypes.JSON }
type ReferenceIntent struct { BaseModel; UserID string; ReferenceSetID string; AssetID string; MediaObjectID string; Role string; Weight float64; Enabled bool; SortOrder int; Note string; CropJSON datatypes.JSON; AnalysisJSON datatypes.JSON; Confirmed bool; MetadataJSON datatypes.JSON }
type GenerationRun struct { BaseModel; UserID string; ProjectID string; ReferenceSetID string; ParentRunID string; Ability string; Model string; Prompt string; CompiledPrompt string; CompiledLocale string; CompiledTemplateKey string; CompiledReferenceJSON datatypes.JSON; ParamsJSON datatypes.JSON; Status string; ReservedCredits int64; SettledCredits int64; UsageID string; Gateway string; GatewayRequestID string; GatewayModel string; GatewayUsageJSON datatypes.JSON; GatewayCostJSON datatypes.JSON; GatewayErrorJSON datatypes.JSON; ErrorKey string; ErrorMessage string }
type GenerationOutput struct { BaseModel; UserID string; GenerationRunID string; MediaObjectID string; CanvasNodeID string; Status string; Rating int; Selected bool; Note string; MetadataJSON datatypes.JSON }
type GenerationJob struct { BaseModel; UserID string; GenerationRunID string; Status string; Ability string; Priority int; Attempt int; MaxAttempts int; LockedAt *time.Time; StartedAt *time.Time; FinishedAt *time.Time; NextRetryAt *time.Time; ErrorKey string; ErrorCode string; ErrorMessage string; RequestJSON datatypes.JSON; ResponseJSON datatypes.JSON }
```

- [ ] **Step 2: Add model capability and prompt template structs**

In `billing.go`, add:

```go
type ModelCapability struct { BaseModel; Model string; DisplayNameJSON datatypes.JSON; Ability string; ModelFamily string; MaxReferences int; MaxOutputs int; SupportedRatiosJSON datatypes.JSON; SupportedResolutionsJSON datatypes.JSON; SupportsStreaming bool; SupportsSeed bool; SupportsMask bool; SupportsCropReference bool; SupportsTransparentBackground bool; Enabled bool; RecommendedRolesJSON datatypes.JSON; MetadataJSON datatypes.JSON }
type PromptTemplate struct { BaseModel; Locale string; TemplateKey string; Ability string; ModelFamily string; Title string; Content string; VariablesJSON datatypes.JSON; Version int; Enabled bool }
```

- [ ] **Step 3: Register AutoMigrate order**

Update `AutoMigrate` to include new structs and remove no-longer-used old `Asset` / `GenerationLog` if implementation replaces those paths in the same slice.

- [ ] **Step 4: Update database docs**

Document every new table in `docs/content/docs/backend/backend-database.mdx` with Chinese descriptions and key columns.

- [ ] **Step 5: Recommended verification**

Command: `go test ./...` from `server/`.

Expected: compile succeeds. Under project rules, record the command and let the user run it.

---

### Task 3: Repository Layer For Creative Domain

**Files:**
- Create: `server/internal/repository/creative.go`

**Interfaces:**
- Consumes models from Task 2.
- Produces repository methods used by services:
  - `SaveMediaObject(*model.MediaObject) error`
  - `GetMediaObject(userID, id string) (model.MediaObject, error)`
  - `ListCreativeAssets(userID string, q model.Query) (model.ListResult[model.CreativeAsset], error)`
  - `SaveReferenceSet(*model.ReferenceSet) error`
  - `ListReferenceIntents(referenceSetID string) ([]model.ReferenceIntent, error)`
  - `ClaimGenerationJob(now time.Time) (model.GenerationJob, error)`

- [ ] **Step 1: Add CRUD helpers**

Implement one repository method per model, following existing `ListUsageRequests` paging style.

- [ ] **Step 2: Add job claim query**

Implement job claiming with GORM transaction and row lock:

```go
err := r.DB.Transaction(func(tx *gorm.DB) error {
    err := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
        Where("status IN ? AND (next_retry_at IS NULL OR next_retry_at <= ?)", []string{"queued", "retrying"}, now).
        Order("priority DESC, created_at ASC").
        First(&job).Error
    if err != nil { return err }
    job.Status = "running"
    job.LockedAt = &now
    job.StartedAt = &now
    job.Attempt++
    return tx.Save(&job).Error
})
```

- [ ] **Step 3: Add focused list queries**

List methods must filter by `user_id`. Admin list methods can omit user filter and should live in clearly named methods such as `AdminListGenerationRuns`.

- [ ] **Step 4: Recommended verification**

Command: `go test ./...` from `server/`.

Expected: compile succeeds.

---

### Task 4: R2 MediaObject Service

**Files:**
- Modify: `server/internal/config/config.go`
- Modify: `server/internal/storage/storage.go`
- Create: `server/internal/service/media_object.go`
- Modify: `server/internal/handler/media.go`
- Modify: `.env.example`

**Interfaces:**
- Produces `MediaObjectService.Upload(ctx, userID, fileHeader) (model.MediaObject, error)`
- Produces `MediaObjectService.Open(ctx, userID, mediaID) (storage.Object, model.MediaObject, error)`

- [ ] **Step 1: Add config fields**

Add:

```go
R2PublicBaseURL string
MaxUploadBytes int64
StorageProvider string
```

Keep existing local/R2 env variables, but align names with the design.

- [ ] **Step 2: Make storage keys domain-based**

Use storage key format:

```text
users/{userID}/media/{mediaID}/{sha256-or-original-name}
users/{userID}/thumbs/{mediaID}.webp
```

- [ ] **Step 3: Upload through App Server**

`MediaObjectService.Upload` should:

1. Read file stream.
2. Enforce `MaxUploadBytes`.
3. Compute SHA-256.
4. Detect MIME from uploaded header or first bytes.
5. Upload to R2/local store.
6. Save `MediaObject`.

- [ ] **Step 4: Update media handler**

Expose:

```text
POST /api/server/media/upload
GET /api/server/media/:id
DELETE /api/server/media/:id
```

All routes require auth and check `user_id`.

- [ ] **Step 5: Recommended verification**

Command: upload one small PNG through the API with an authenticated session.

Expected: response contains `id`, `storageKey`, `mimeType`, `byteSize`; R2/local store contains the file.

---

### Task 5: NewAPI ModelGatewayService And Admin Config

**Files:**
- Modify: `server/internal/config/config.go`
- Create: `server/internal/service/model_gateway.go`
- Create: `server/internal/handler/admin_config.go`
- Modify: `server/internal/router/router.go`
- Create: `web/src/services/api/admin-config.ts`
- Create: `web/src/app/(user)/admin/gateway/page.tsx`

**Interfaces:**
- Produces backend client: `Proxy(ctx, method, path string, headers http.Header, body []byte) (*http.Response, error)`
- Produces admin endpoint: `GET/PATCH /api/server/admin/model-gateway`

- [ ] **Step 1: Rename gateway config conceptually**

Config fields:

```go
ModelGatewayProvider string
ModelGatewayBaseURL string
ModelGatewayInternalURL string
ModelGatewayToken string
ModelGatewayTimeout time.Duration
```

- [ ] **Step 2: Implement NewAPI proxy**

Use internal URL if present. Set `Authorization: Bearer <token>`. Do not forward browser cookies or authorization headers.

- [ ] **Step 3: Add health check**

Expose admin action:

```text
POST /api/server/admin/model-gateway/test
```

It performs a lightweight gateway request such as model listing or configured health endpoint and returns status.

- [ ] **Step 4: Add admin page**

Page fields:

- Base URL
- Internal URL
- Token write-only input
- Timeout seconds
- Test button

All visible text uses i18n keys.

- [ ] **Step 5: Recommended verification**

Command: admin clicks Test.

Expected: success message when NewAPI token and URL are valid; translated error key when invalid.

---

### Task 6: Model Capabilities, Prompt Templates, And Rate Rules

**Files:**
- Create: `server/internal/service/prompt_template.go`
- Modify: `server/internal/service/billing.go`
- Create: `server/internal/handler/admin_config.go`
- Create: `web/src/app/(user)/admin/models/page.tsx`
- Create: `web/src/app/(user)/admin/rates/page.tsx`
- Create: `web/src/app/(user)/admin/prompts/page.tsx`

**Interfaces:**
- Produces `SelectPromptTemplate(locale, ability, modelFamily, templateKey string) (model.PromptTemplate, error)`
- Produces `EstimateGenerationCredits(input GenerationEstimateInput) (int64, error)`

- [ ] **Step 1: Add admin CRUD endpoints**

Routes:

```text
GET/POST/PATCH /api/server/admin/model-capabilities
GET/POST/PATCH /api/server/admin/model-rate-rules
GET/POST/PATCH /api/server/admin/prompt-templates
```

- [ ] **Step 2: Seed minimal capabilities**

Add startup seed only if table is empty:

```text
ability=image, model=default, model_family=generic, max_references=4, max_outputs=4, enabled=true
```

This seed gives the UI a safe baseline and can be edited in admin.

- [ ] **Step 3: Update billing estimate**

Formula:

```text
estimate = base_credits + outputs * per_output_credits + references * per_reference_credits
estimate *= resolution_multiplier
estimate *= quality_multiplier
```

Round up to integer credits and enforce minimum 1.

- [ ] **Step 4: Add prompt template preview**

Admin prompt page includes variables JSON and a preview button that renders a sample compiled text.

- [ ] **Step 5: Recommended verification**

Command: create a model capability and rate rule in admin, then call estimate endpoint.

Expected: returned credits match formula.

---

### Task 7: ReferenceSet APIs And Compiler

**Files:**
- Create: `server/internal/service/reference.go`
- Create: `server/internal/handler/creative.go`
- Modify: `server/internal/router/router.go`
- Create: `web/src/services/api/creative.ts`

**Interfaces:**
- Produces API:
  - `GET /api/server/reference-sets`
  - `POST /api/server/reference-sets`
  - `GET /api/server/reference-sets/:id`
  - `PATCH /api/server/reference-sets/:id`
  - `POST /api/server/reference-sets/:id/intents`
  - `PATCH /api/server/reference-intents/:id`
  - `POST /api/server/reference-sets/:id/compile-preview`

- [ ] **Step 1: Implement ReferenceSet CRUD**

`CreateReferenceSet` validates title, source, and user ownership.

- [ ] **Step 2: Implement ReferenceIntent CRUD**

Validate:

- `role` is one of `subject`, `style`, `composition`, `element`
- `weight` is between `0.1` and `2`
- `sort_order` is non-negative
- `media_object_id` belongs to user

- [ ] **Step 3: Implement compile preview**

Inputs:

```json
{
  "prompt": "user prompt",
  "locale": "zh-CN",
  "ability": "image",
  "model": "model-id",
  "params": { "n": 4, "ratio": "1:1" }
}
```

Output:

```json
{
  "compiledPrompt": "...",
  "compiledReferenceJson": {},
  "warnings": [],
  "enabledReferences": []
}
```

- [ ] **Step 4: Add frontend typed API**

`creative.ts` exports `ReferenceSet`, `ReferenceIntent`, `createReferenceSet`, `updateReferenceIntent`, `compileReferenceSetPreview`.

- [ ] **Step 5: Recommended verification**

Command: create ReferenceSet, add four intents, call compile preview.

Expected: response orders references by `sort_order`, includes role-specific instructions, and returns warnings for capability limits.

---

### Task 8: GenerationRun And PostgreSQL Job Queue

**Files:**
- Create: `server/internal/service/generation.go`
- Create: `server/internal/service/job_worker.go`
- Modify: `server/internal/service/billing.go`
- Modify: `server/internal/handler/creative.go`
- Modify: `server/cmd/api/main.go`

**Interfaces:**
- Produces API:
  - `POST /api/server/generation-runs`
  - `GET /api/server/generation-runs/:id`
  - `GET /api/server/generation-jobs/:id`
  - `POST /api/server/generation-runs/:id/retry`
  - `POST /api/server/generation-runs/:id/cancel`

- [ ] **Step 1: Create generation run flow**

Service flow:

1. Validate user account.
2. Compile ReferenceSet.
3. Estimate credits.
4. Reserve credits through BillingService.
5. Save GenerationRun with `status=queued`.
6. Save GenerationJob with `status=queued`.

- [ ] **Step 2: Implement worker loop**

Worker loop:

```go
for {
	job, err := repo.ClaimGenerationJob(time.Now())
	if errors.Is(err, gorm.ErrRecordNotFound) {
		time.Sleep(pollInterval)
		continue
	}
	service.ExecuteGenerationJob(ctx, job)
}
```

Controlled by env:

```env
WORKER_ENABLED=true
WORKER_CONCURRENCY=1
WORKER_POLL_SECONDS=3
```

- [ ] **Step 3: Execute image jobs through NewAPI**

Build NewAPI request from `GenerationRun.CompiledPrompt`, params, and ordered media references. Persist raw request into `GenerationJob.RequestJSON`.

- [ ] **Step 4: Persist outputs**

On success:

1. Store output media through MediaObjectService.
2. Create GenerationOutput rows.
3. Set GenerationRun `status=succeeded`.
4. Set GenerationJob `status=succeeded`.
5. Settle credits.

On failure:

1. Classify error key.
2. Retry if retryable and attempts remain.
3. Refund if terminal and policy requires refund.
4. Save gateway error JSON.

- [ ] **Step 5: Recommended verification**

Command: create generation run with a mock or real NewAPI model.

Expected: job moves `queued -> running -> succeeded` or `failed`, and credits settle/refund according to status.

---

### Task 9: Frontend Cloud Domain Client And Canvas Node Types

**Files:**
- Create: `web/src/services/api/creative.ts`
- Modify: `web/src/app/(user)/canvas/types.ts`
- Modify: `web/src/app/(user)/canvas/stores/use-canvas-store.ts`

**Interfaces:**
- Produces TS types matching backend:
  - `MediaObject`
  - `CreativeAsset`
  - `ReferenceSet`
  - `ReferenceIntent`
  - `GenerationRun`
  - `GenerationOutput`
  - `GenerationJob`
- Produces canvas node types: `media`, `prompt`, `reference_set`, `generation`, `result_group`, `note`

- [ ] **Step 1: Add creative API client**

`creative.ts` wraps all domain routes with `serverRequest`.

- [ ] **Step 2: Replace canvas node enum**

New enum:

```ts
export enum CanvasNodeType {
    Media = "media",
    Prompt = "prompt",
    ReferenceSet = "reference_set",
    Generation = "generation",
    ResultGroup = "result_group",
    Note = "note",
}
```

- [ ] **Step 3: Add domain references to node metadata**

`CanvasNodeData` includes optional:

```ts
mediaObjectId?: string;
assetId?: string;
referenceSetId?: string;
generationRunId?: string;
generationOutputId?: string;
```

- [ ] **Step 4: Cloud-first project store**

Keep local Zustand for active canvas UI state, but load/save project data through server APIs when logged in.

- [ ] **Step 5: Recommended verification**

Command: open canvas after login.

Expected: project loads from server and new nodes can reference domain IDs.

---

### Task 10: ReferenceSet Node And Composer UI

**Files:**
- Create: `web/src/app/(user)/canvas/components/reference-set-node.tsx`
- Create: `web/src/app/(user)/canvas/components/reference-composer.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

**Interfaces:**
- Consumes `ReferenceSet`, `ReferenceIntent`, `MediaObject`
- Produces UI callback: `onReferenceSetChange(referenceSetId: string)`

- [ ] **Step 1: Build compact node**

Display grouped thumbnails and role badges using i18n keys:

```tsx
<span>{t(`reference.role.${intent.role}`)}</span>
```

- [ ] **Step 2: Build composer**

Composer sections:

- Source thumbnails.
- Role segmented control.
- Weight input.
- Note textarea.
- Enabled toggle.
- Sort controls.
- Compile preview panel.

- [ ] **Step 3: Wire add-from-canvas**

Dragging a Media node onto a ReferenceSet node creates a ReferenceIntent with default role `subject`, weight `1`, enabled `true`.

- [ ] **Step 4: Wire compile preview**

Preview calls `compileReferenceSetPreview` and renders compiled text plus warnings.

- [ ] **Step 5: Recommended verification**

Command: add two media nodes, create ReferenceSet, drag media into it, open composer.

Expected: two intents appear, can be reordered, and preview updates.

---

### Task 11: Generation Node And ResultGroup UI

**Files:**
- Create: `web/src/app/(user)/canvas/components/generation-node.tsx`
- Create: `web/src/app/(user)/canvas/components/result-group-node.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`

**Interfaces:**
- Consumes `GenerationRun`, `GenerationJob`, `GenerationOutput`
- Produces action callbacks: `onCreateGenerationRun`, `onRetryGenerationRun`, `onCancelGenerationRun`

- [ ] **Step 1: Build generation node**

Fields:

- Prompt selector or inline prompt.
- ReferenceSet selector.
- Model selector.
- Output count.
- Estimate credits.
- Generate button.
- Job status.

- [ ] **Step 2: Create run on generate**

Call `POST /generation-runs`, create or update canvas node with returned `generationRunId`, and start polling job.

- [ ] **Step 3: Poll status**

Poll every 2 seconds while status is `queued`, `running`, or `retrying`. Stop when terminal.

- [ ] **Step 4: Build result group**

Show output grid with selected/rating controls. Save selected output as CreativeAsset.

- [ ] **Step 5: Recommended verification**

Command: create a generation node linked to a ReferenceSet and trigger generation.

Expected: node status advances and ResultGroup appears when outputs are ready.

---

### Task 12: CreativeAsset Library Upgrade

**Files:**
- Modify: `web/src/app/(user)/assets/page.tsx`
- Create: `server/internal/handler/creative.go`
- Modify: `server/internal/service/media_object.go`
- Modify: `web/src/services/api/creative.ts`

**Interfaces:**
- Produces `GET/POST/PATCH/DELETE /api/server/creative-assets`

- [ ] **Step 1: Backend asset CRUD**

Create, list, update, delete assets with user ownership.

- [ ] **Step 2: Frontend asset list**

Show kind, thumbnail, title, tags, favorite, rating, usage count.

- [ ] **Step 3: Save generation output as asset**

Action creates CreativeAsset from GenerationOutput's MediaObject.

- [ ] **Step 4: Add asset-to-reference action**

From asset library, user can add asset to current ReferenceSet with default intent.

- [ ] **Step 5: Recommended verification**

Command: save a generated image as asset, then add it to a ReferenceSet.

Expected: asset appears in library and composer.

---

### Task 13: Admin Console Expansion

**Files:**
- Create: `web/src/app/(user)/admin/models/page.tsx`
- Create: `web/src/app/(user)/admin/rates/page.tsx`
- Create: `web/src/app/(user)/admin/prompts/page.tsx`
- Create: `web/src/app/(user)/admin/gateway/page.tsx`
- Create: `web/src/app/(user)/admin/generations/page.tsx`
- Modify: `web/src/constant/navigation-tools.ts`

**Interfaces:**
- Consumes admin APIs from Tasks 5, 6, and 8.

- [ ] **Step 1: Add admin navigation**

Admin-only pages:

- 网关配置
- 模型能力
- 计费规则
- Prompt 模板
- 生成审计

- [ ] **Step 2: Model capability page**

Editable table for model, ability, max references, max outputs, ratios, resolutions, enabled.

- [ ] **Step 3: Rate rule page**

Editable table for base credits, per output, per reference, multipliers JSON.

- [ ] **Step 4: Prompt template page**

Editor with locale, ability, model family, content, version, enabled, preview.

- [ ] **Step 5: Generation audit page**

List runs/jobs, status, user, model, credits, gateway request id, retry/refund actions.

- [ ] **Step 6: Recommended verification**

Command: admin visits each page and creates one record.

Expected: CRUD calls succeed and list refreshes.

---

### Task 14: Native Creative Agent Suggestion Mode

**Files:**
- Create: `server/internal/service/creative_agent.go`
- Create: `server/internal/handler/agent.go`
- Modify: `server/internal/router/router.go`
- Create: `web/src/components/creative-agent/creative-agent-panel.tsx`

**Interfaces:**
- Produces API:
  - `POST /api/server/agent/sessions`
  - `POST /api/server/agent/sessions/:id/messages`
  - `POST /api/server/agent/tool-calls/:id/apply`

- [ ] **Step 1: Add agent persistence structs**

Models:

```go
type AgentSession struct { BaseModel; UserID string; ProjectID string; Title string; Locale string; Status string; MetadataJSON datatypes.JSON }
type AgentMessage struct { BaseModel; UserID string; SessionID string; Role string; Content string; MetadataJSON datatypes.JSON }
type AgentToolCall struct { BaseModel; UserID string; SessionID string; ToolName string; InputJSON datatypes.JSON; OutputJSON datatypes.JSON; Status string; RequiresConfirmation bool; AppliedAt *time.Time }
```

- [ ] **Step 2: Add suggestion-only tools**

V1 tools:

- `list_canvas_nodes`
- `search_assets`
- `compile_reference_set_preview`
- `suggest_reference_intents`

- [ ] **Step 3: Add apply-confirmed-reference-suggestions**

Agent suggestions that alter ReferenceSet must wait for user confirmation and then call normal ReferenceSet APIs.

- [ ] **Step 4: Build frontend panel**

Panel shows chat, suggested actions, and explicit Apply buttons. No generation spending happens silently.

- [ ] **Step 5: Recommended verification**

Command: ask agent to organize selected images as references.

Expected: agent proposes roles/weights; user clicks Apply; ReferenceSet updates.

---

### Task 15: Documentation And Deployment Notes

**Files:**
- Modify: `.env.example`
- Modify: `docs/content/docs/backend/saas-deployment.mdx`
- Modify: `docs/content/docs/backend/local-development.mdx`
- Modify: `docs/content/docs/backend/backend-database.mdx`
- Modify: `docs/content/docs/progress/todo.mdx`
- Modify: `docs/content/docs/progress/pending-test.mdx`

**Interfaces:**
- Produces deployment instructions for 1Panel + NewAPI + R2.

- [ ] **Step 1: Update environment example**

Include:

```env
MODEL_GATEWAY_PROVIDER=newapi
MODEL_GATEWAY_BASE_URL=
MODEL_GATEWAY_INTERNAL_URL=
MODEL_GATEWAY_TOKEN=
STORAGE_PROVIDER=r2
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
WORKER_ENABLED=true
WORKER_CONCURRENCY=1
DEFAULT_LOCALE=zh-CN
```

- [ ] **Step 2: Update SaaS deployment docs**

Explain:

- App Server talks to NewAPI.
- NewAPI contains OpenRouter channel.
- Prefer internal Docker network URL for NewAPI.
- R2 is production media store.
- Cloudflare/OpenResty public domain is not required for internal model calls.

- [ ] **Step 3: Update backend database docs**

Add table groups:

- Media
- Creative assets
- Reference workflow
- Generation jobs
- Model configuration
- Agent sessions

- [ ] **Step 4: Move progress notes**

Move completed implementation items from todo to pending-test, following project doc rules.

- [ ] **Step 5: Recommended verification**

Command: manually read docs pages.

Expected: docs do not claim unsupported cloud sync, direct OpenRouter calls, or production deployment verification beyond what was implemented.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-07-reference-workflow-saas-v1.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fastest for this large multi-subsystem plan.
2. **Inline Execution** - Execute tasks in this session using executing-plans, slower but easier to keep every decision in one thread.

Because this workspace currently has unrelated uncommitted Docker/1Panel deployment changes, execution should first set up an isolated worktree or get explicit approval to work in place.
