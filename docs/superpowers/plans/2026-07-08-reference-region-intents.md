# Reference Region Intents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build first-version single-image multi-intent references with manual rectangular region selection, cropped intent previews, intent deletion, and compiled crop output.

**Architecture:** Reuse the existing ReferenceSet / ReferenceIntent model. The frontend stores one intent per reference purpose and writes optional normalized rectangle data to `cropJson`; the backend validates crop shape and includes it in compile preview text and JSON.

**Tech Stack:** Next.js App Router, React, TypeScript, Ant Design, Tailwind, Bun tests, Go, Gin, GORM.

## Global Constraints

- Follow the current canvas theme and keep canvas overlays visually lightweight.
- Keep page and component copy in Chinese.
- Do not add a new database table for this version.
- Do not call model generation while implementing or verifying this feature.
- Use existing `cropJson` and `metadataJson` fields on `ReferenceIntent`.
- Business API responses remain `{ code, data, msg }`.

---

## File Structure

- `web/tests/reference-composer-utils.test.ts`: frontend behavior tests for crop normalization and source intent counting.
- `web/src/app/(user)/canvas/components/reference-composer-utils.ts`: shared reference composer helpers for crop parsing and source intent matching.
- `web/src/app/(user)/canvas/components/reference-composer.tsx`: source menu, region selector, cropped thumbnails, delete action, and metadata preservation.
- `web/src/services/api/creative.ts`: add the delete intent API wrapper.
- `server/internal/service/reference_test.go`: service-level tests for crop validation and compile crop text formatting.
- `server/internal/service/reference.go`: crop validation, crop text output, and delete service method.
- `server/internal/handler/creative.go`: delete ReferenceIntent handler.
- `server/internal/router/router.go`: delete ReferenceIntent route.
- `docs/content/docs/progress/todo.mdx`: remove or narrow completed reference-region todo items.
- `docs/content/docs/progress/pending-test.mdx`: add the new manual-test checklist.

## Tasks

### Task 1: Frontend Helper Tests

**Files:**
- Modify: `web/tests/reference-composer-utils.test.ts`
- Modify: `web/src/app/(user)/canvas/components/reference-composer-utils.ts`

**Interfaces:**
- Produces: `normalizeReferenceCropRect(input: unknown): ReferenceCropRect | null`
- Produces: `countReferenceSourceIntents(node, boundSources, intents): number`
- Produces: `referenceIntentCanvasNodeId(intent): string`

- [ ] **Step 1: Write failing tests**

Add tests showing that valid normalized crop rectangles are accepted, invalid rectangles return `null`, and two intents linked to the same canvas source are counted as two intents.

- [ ] **Step 2: Run failing tests**

Run: `cd web && bun test tests/reference-composer-utils.test.ts`
Expected: fail because `normalizeReferenceCropRect` and `countReferenceSourceIntents` are not exported yet.

- [ ] **Step 3: Implement helpers**

Add a `ReferenceCropRect` type, crop normalization, source matching, and intent counting to `reference-composer-utils.ts`. Keep existing helpers compatible.

- [ ] **Step 4: Run helper tests**

Run: `cd web && bun test tests/reference-composer-utils.test.ts`
Expected: pass.

### Task 2: Backend Crop Validation And Delete Tests

**Files:**
- Create: `server/internal/service/reference_test.go`
- Modify: `server/internal/service/reference.go`

**Interfaces:**
- Produces: `validateReferenceCrop(value datatypes.JSON) error`
- Produces: `referenceCropText(value datatypes.JSON) string`
- Produces: `DeleteReferenceIntent(userID string, id string) error`

- [ ] **Step 1: Write failing service tests**

Add tests that accept an empty crop and a legal rect, reject out-of-range rects, and format a legal rect as `crop x=... y=... w=... h=...`.

- [ ] **Step 2: Run failing tests**

Run: `cd server && go test ./internal/service`
Expected: fail because the helper functions do not exist yet.

- [ ] **Step 3: Implement service behavior**

Add crop parsing and validation, call it from `validateIntent`, add crop text to `CompileReferenceSetPreview`, and add a service delete method that delegates to the repository.

- [ ] **Step 4: Run service tests**

Run: `cd server && go test ./internal/service`
Expected: pass.

### Task 3: Backend Delete API Route

**Files:**
- Modify: `server/internal/handler/creative.go`
- Modify: `server/internal/router/router.go`

**Interfaces:**
- Consumes: `ReferenceService.DeleteReferenceIntent(userID string, id string) error`
- Produces: `DELETE /api/server/reference-intents/:id`

- [ ] **Step 1: Add handler**

Add `DeleteReferenceIntent` to `CreativeHandler`. It reads the current user and intent id, calls service delete, and returns the existing `OK` / `Fail` response style.

- [ ] **Step 2: Add route**

Register `protected.DELETE("/reference-intents/:id", creativeHandler.DeleteReferenceIntent)`.

- [ ] **Step 3: Run backend tests**

Run: `cd server && go test ./internal/service`
Expected: pass.

### Task 4: Frontend Region Intent UI

**Files:**
- Modify: `web/src/services/api/creative.ts`
- Modify: `web/src/app/(user)/canvas/components/reference-composer.tsx`

**Interfaces:**
- Consumes: `normalizeReferenceCropRect`
- Consumes: `countReferenceSourceIntents`
- Produces: `deleteReferenceIntent(id: string)`
- Produces: source card menu actions `整图参考`, `框选局部`, `提取风格`

- [ ] **Step 1: Add delete API wrapper**

Add `deleteReferenceIntent(id: string)` to `creative.ts`.

- [ ] **Step 2: Preserve intent JSON fields on patch**

Update `patchIntent` so role, weight, note, enabled, cropJson, analysisJson, metadataJson, and confirmed survive every update.

- [ ] **Step 3: Replace source card single add with a menu**

Show source cards as `添加`, `已添加`, or `N 个意图`. Clicking opens actions for whole image, local region, and style extraction.

- [ ] **Step 4: Add region selector**

Add an in-composer selector that displays the source image, lets the user drag one normalized rectangle, choose role/weight/note, and saves a new ReferenceIntent with `cropJson` and `metadataJson.sourceMode = "region"`.

- [ ] **Step 5: Add cropped intent thumbnail and delete button**

Render cropped thumbnails for intents with valid crop data and add a delete button to each intent row.

- [ ] **Step 6: Run frontend tests**

Run: `cd web && bun test tests/reference-composer-utils.test.ts`
Expected: pass.

### Task 5: Docs And Verification

**Files:**
- Modify: `docs/content/docs/progress/todo.mdx`
- Modify: `docs/content/docs/progress/pending-test.mdx`

**Interfaces:**
- Produces: documented testable changes for the user.

- [ ] **Step 1: Update progress docs**

Move the implemented local-reference multi-intent items into `pending-test.mdx`. Keep future AI extraction items in todo.

- [ ] **Step 2: Run focused verification**

Run:

```powershell
cd web; bun test tests/reference-composer-utils.test.ts
cd ..\server; go test ./internal/service
git status --short
```

Expected: frontend helper tests pass, backend service tests pass, and git shows only intended files.

- [ ] **Step 3: Commit**

Commit with a message like `feat: add reference region intents`.

## Self-Review

- Spec coverage: source menu, region selector, multiple intents, cropped row preview, delete, backend crop validation, and compile output are all covered by tasks.
- Placeholder scan: no placeholder implementation steps remain.
- Type consistency: `cropJson` remains `unknown` in frontend API types and `datatypes.JSON` in backend service; helper names are used consistently across tasks.
