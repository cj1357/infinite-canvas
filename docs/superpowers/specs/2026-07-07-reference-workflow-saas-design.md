# Reference Workflow SaaS Design

## Goal

Build infinite-canvas into a stronger personal AI creation tool with a SaaS foundation. The first product pillar is a best-in-class reference-image workflow: users can organize subject, style, composition, and element references, generate with clear intent, review results, save assets, and continue iterating.

This design intentionally does not preserve old local-only data structures. The project is not online yet, so data models can be rebuilt around the best product shape.

## Product Direction

The product should not become a Penpot clone. Penpot is useful as a reference for mature boundaries: files, assets, permissions, change history, plugins, task processing, and storage. The target here is different: a personal AI creative SaaS with a powerful canvas, reusable creative assets, traceable generation history, and an internal creative agent.

Primary goals:

- Make personal AI creation workflows stronger than a simple prompt box.
- Treat reference images as structured creative intent, not loose attachments.
- Make every generation traceable, recoverable, billable, and reusable.
- Use SaaS infrastructure for accounts, quotas, model configuration, task recovery, storage, and admin operations.
- Support internationalization from the start.

Non-goals for V1:

- Team collaboration.
- Real-time multi-user editing.
- Comments.
- Complex RBAC.
- Marketplace or external plugin ecosystem.
- Codex or MCP as the main agent experience.
- Backward compatibility with existing localforage data.
- Full version history tree.
- Automated payment callbacks.

## Architecture Overview

The target production architecture is:

```text
Browser
  -> Next.js web app
    -> Go App Server
      -> PostgreSQL
      -> Cloudflare R2
      -> NewAPI
        -> OpenRouter channel
          -> BYOK providers
```

The app server owns product data, quotas, generation tasks, creative assets, media metadata, prompt compilation, and admin configuration.

NewAPI is the unified model gateway. OpenRouter is configured inside NewAPI as an upstream channel, with provider BYOK handled by OpenRouter. infinite-canvas should not call OpenRouter directly in V1.

Cloudflare R2 is the production media store. Local disk storage is only for development and debugging.

## Core Domain Model

### MediaObject

Represents a physical file. It does not know how the file is used creatively.

Fields:

- `id`
- `user_id`
- `kind`: `image | video | audio`
- `storage_key`
- `thumbnail_key`
- `mime_type`
- `byte_size`
- `width`
- `height`
- `duration_ms`
- `sha256`
- `metadata_json`
- `deleted_at`
- `created_at`
- `updated_at`

### CreativeAsset

Represents a reusable creative asset.

Fields:

- `id`
- `user_id`
- `media_object_id`
- `kind`: `subject | style | composition | element | prompt | reference_set | mixed`
- `title`
- `description`
- `tags_json`
- `favorite`
- `rating`
- `default_reference_intent_json`
- `localized_text_json`
- `usage_count`
- `last_used_at`
- `metadata_json`
- `created_at`
- `updated_at`

Examples:

- A character identity reference.
- A product photo.
- A lighting/style reference.
- A logo or clothing detail.
- A reusable prompt template.
- A reusable reference pack.

### ReferenceSet

Represents a reusable or per-generation reference arrangement.

Fields:

- `id`
- `user_id`
- `project_id`
- `title`
- `description`
- `source`: `canvas_node | template | generation_run | manual | agent`
- `metadata_json`
- `created_at`
- `updated_at`

### ReferenceIntent

Represents how one media item or asset should be used in a ReferenceSet.

Fields:

- `id`
- `user_id`
- `reference_set_id`
- `asset_id`
- `media_object_id`
- `role`: `subject | style | composition | element`
- `weight`
- `enabled`
- `sort_order`
- `note`
- `crop_json`
- `analysis_json`
- `confirmed`
- `metadata_json`
- `created_at`
- `updated_at`

Role meaning:

- `subject`: preserve identity, structure, product shape, character or object consistency.
- `style`: use visual style, lighting, material, color, brush, photography feel, and atmosphere.
- `composition`: use camera angle, pose, layout, framing, and spatial relationship.
- `element`: use a local object, clothing, logo, texture, prop, background detail, or selected crop.

### GenerationRun

Represents one user-facing generation attempt.

Fields:

- `id`
- `user_id`
- `project_id`
- `reference_set_id`
- `parent_run_id`
- `ability`: `image | video | text | audio | analysis`
- `model`
- `prompt`
- `compiled_prompt`
- `compiled_locale`
- `compiled_template_key`
- `compiled_reference_json`
- `params_json`
- `status`: `draft | reserved | queued | running | succeeded | failed | canceled | refunded | needs_review`
- `reserved_credits`
- `settled_credits`
- `usage_id`
- `gateway`: `newapi`
- `gateway_request_id`
- `gateway_model`
- `gateway_usage_json`
- `gateway_cost_json`
- `gateway_error_json`
- `error_key`
- `error_message`
- `created_at`
- `updated_at`

### GenerationOutput

Represents one generated output.

Fields:

- `id`
- `user_id`
- `generation_run_id`
- `media_object_id`
- `canvas_node_id`
- `status`
- `rating`
- `selected`
- `note`
- `metadata_json`
- `created_at`
- `updated_at`

### GenerationJob

Represents asynchronous execution work for a GenerationRun.

Fields:

- `id`
- `user_id`
- `generation_run_id`
- `status`: `queued | running | succeeded | failed | canceled | retrying`
- `ability`
- `priority`
- `attempt`
- `max_attempts`
- `locked_at`
- `started_at`
- `finished_at`
- `next_retry_at`
- `error_key`
- `error_code`
- `error_message`
- `request_json`
- `response_json`
- `created_at`
- `updated_at`

V1 can use PostgreSQL as the job queue with `FOR UPDATE SKIP LOCKED`. Redis is not required for V1.

## Canvas Model

Canvas should become a creative arrangement layer, not the only source of truth.

Target node types:

- `media`: displays image, video, or audio.
- `prompt`: stores prompt text or prompt fragments.
- `reference_set`: displays and edits a ReferenceSet.
- `generation`: configures and starts a GenerationRun.
- `result_group`: displays outputs from a GenerationRun.
- `note`: user notes.

CanvasNode should reference domain objects:

- `media_object_id`
- `asset_id`
- `reference_set_id`
- `generation_run_id`
- `generation_output_id`

Connections express creative data flow:

```text
Media -> ReferenceSet
CreativeAsset -> ReferenceSet
Prompt -> Generation
ReferenceSet -> Generation
Generation -> ResultGroup
ResultGroup -> ReferenceSet
ResultGroup -> Generation
```

## Reference Workflow

### ReferenceSet Node

The ReferenceSet node is the centerpiece of V1.

It should show:

- Grouped reference thumbnails.
- Four fixed roles: subject, style, composition, element.
- Weight markers.
- Note summaries.
- Enabled and disabled states.
- Sort order.
- Warnings when a selected model cannot use all references.

Double-clicking opens the full reference composer.

### Reference Composer

The composer supports:

- Add references from canvas media nodes.
- Add references from CreativeAsset library.
- Drag output results into the ReferenceSet.
- Set role.
- Set weight.
- Set note.
- Enable or disable each reference.
- Drag to reorder.
- Crop a local reference region for element references.
- Preview the compiled reference instructions.
- See model capability warnings before generation.

V1 uses fixed roles plus freeform notes. Custom reference labels are intentionally deferred.

### Generation Node

The Generation node binds:

- Prompt input.
- ReferenceSet.
- Model and generation params.
- Estimated credits.
- Task status.

Generation actions:

- Estimate.
- Generate.
- Cancel.
- Retry.
- Continue variation.

### ResultGroup Node

The ResultGroup node displays outputs from a GenerationRun.

Actions:

- Mark selected output.
- Rate output.
- Reject output.
- Save output as CreativeAsset.
- Open comparison view.
- Continue variation from one output.
- Expand outputs into separate media nodes.

## Reference Compilation

Generation requests should be compiled from:

- User prompt.
- ReferenceSet.
- ReferenceIntent list.
- ModelCapability.
- User plan limits.
- Generation params.
- Prompt template.
- Locale.

The compiled output includes:

- `compiled_prompt`
- `compiled_reference_json`
- Ordered media references.
- Warnings and downgrades.
- Model capability snapshot.

Rules:

- Only `enabled=true` intents are included.
- References are ordered by `sort_order`.
- If model max reference count is exceeded, keep the first enabled references and record truncation.
- If crop references are not supported, send the full image and compile crop instructions into the prompt.
- If `n` exceeds model max output count, either reduce it or split into several jobs based on admin configuration.
- If the model cannot support a requested ratio/resolution, downgrade to the nearest configured option and record the downgrade.

Prompt text must not be hardcoded in Chinese. It is produced by i18n prompt templates.

## Model Gateway

V1 uses NewAPI as the only app-facing model gateway.

Environment:

```env
MODEL_GATEWAY_PROVIDER=newapi
MODEL_GATEWAY_BASE_URL=https://your-newapi-domain.example.com
MODEL_GATEWAY_INTERNAL_URL=http://newapi-container:3000
MODEL_GATEWAY_TOKEN=...
```

The app server should prefer the internal URL when deployed in the same 1Panel/Docker network as NewAPI. Public Cloudflare/OpenResty domain is useful for administration and fallback, but large generation requests should avoid unnecessary public proxy hops when possible.

NewAPI should contain the OpenRouter channel. OpenRouter BYOK and provider setup stay outside infinite-canvas.

The app server should expose a `ModelGatewayService`, not an `OpenRouterService`, because OpenRouter is behind NewAPI.

Responsibilities:

- Build OpenAI-compatible requests accepted by NewAPI.
- Attach the platform NewAPI token.
- Apply timeouts.
- Capture gateway request id, usage, and error payloads.
- Normalize gateway errors into product error keys.
- Avoid exposing NewAPI token to frontend or agent tools.

## Model Capabilities

Do not depend on OpenRouter-specific capability APIs passing through NewAPI.

V1 should maintain an app-side model capability table.

`model_capabilities` fields:

- `id`
- `model`
- `display_name_json`
- `ability`
- `model_family`
- `max_references`
- `max_outputs`
- `supported_ratios_json`
- `supported_resolutions_json`
- `supports_streaming`
- `supports_seed`
- `supports_mask`
- `supports_crop_reference`
- `supports_transparent_background`
- `enabled`
- `recommended_roles_json`
- `metadata_json`
- `created_at`
- `updated_at`

Admin can configure capabilities manually. Later, a sync button can import partial model metadata from NewAPI or OpenRouter when reliable.

## Billing

The product has two accounting layers.

### Product Credits

infinite-canvas owns user-facing quota logic:

- Total credit balance.
- Five-hour limit.
- Seven-day period limit.
- Plan validity.
- Estimated credits.
- Reserved credits.
- Settled credits.
- Refunds.
- Admin adjustments.

### Gateway Cost

NewAPI owns upstream cost and channel stats. The app stores snapshots for reconciliation, but user plans should not be directly coupled to NewAPI user accounting.

Flow:

1. Validate model capability and user plan.
2. Estimate product credits.
3. Create GenerationRun.
4. Reserve credits.
5. Create GenerationJob.
6. Worker calls NewAPI.
7. Save outputs to R2.
8. Settle credits.
9. Record gateway usage and cost.
10. Refund when failure policy requires it.

`model_rate_rules` should support:

- Base credits.
- Per-output credits.
- Per-reference credits.
- Resolution multipliers.
- Quality multipliers.
- Video duration multipliers.
- Ability-specific rules.

## Task System

Generation should not be executed as a normal browser-held HTTP request.

Flow:

1. Frontend creates generation request.
2. App server creates GenerationRun and GenerationJob.
3. Frontend receives `runId` and `jobId`.
4. Node status becomes queued.
5. Worker executes asynchronously.
6. Frontend polls or subscribes to status.
7. Success attaches outputs to ResultGroup.
8. Failure displays normalized error and refund state.

V1 can start with polling. SSE or WebSocket can be added after the job model is stable.

Failure categories:

- `quota.insufficient`
- `gateway.auth_failed`
- `gateway.model_unavailable`
- `gateway.invalid_request`
- `gateway.timeout`
- `gateway.provider_overloaded`
- `generation.content_policy`
- `storage.failed`
- `job.canceled`
- `unknown`

Refund policy:

- Failure before gateway call: refund.
- Gateway failure with no upstream cost: refund.
- Successful generation but frontend disconnects: no refund; outputs remain recoverable.
- Storage failure: retry storage first; do not regenerate immediately.
- Content policy and user cancellation: configurable.

## R2 Media Storage

Production storage uses a private Cloudflare R2 bucket.

PostgreSQL stores metadata. R2 stores files.

Production:

- `STORAGE_PROVIDER=r2`
- Private bucket.
- App Server controls writes and reads.
- Frontend never receives write credentials.
- V1 can proxy reads through App Server.
- Later, signed read URLs or CDN can be added.

Development:

- `STORAGE_PROVIDER=local`
- Files stored under `data/media`.

Upload flow V1:

```text
Browser -> App Server -> R2
```

Generated output flow:

1. Worker receives base64 or URL from NewAPI.
2. Worker downloads or decodes the media.
3. Worker calculates hash, bytes, dimensions, and MIME.
4. Worker uploads to R2.
5. Worker creates MediaObject.
6. Worker creates GenerationOutput.
7. Worker updates GenerationRun and canvas references.

Cleanup:

- Use logical deletion first.
- Track references from assets, outputs, and canvas nodes.
- Periodic task marks unreferenced media.
- Hard-delete from R2 after retention period.

Plan limits can later include:

- Storage quota.
- Single-file size.
- Monthly upload volume.
- Result retention period.
- Original-quality retention.

## Internationalization

Internationalization is a product architecture requirement, not only UI polish.

Initial locales:

- `zh-CN`
- `en-US`

Reserved:

- `ja-JP`

### Frontend UI

All user-facing strings should use translation keys.

Language selection:

- Unauthenticated users: browser storage.
- Authenticated users: user profile.
- Default order: user preference, browser language, admin default.

### Backend Errors

API errors should return stable keys:

```json
{
  "code": 40201,
  "errorKey": "quota.insufficient",
  "message": "quota.insufficient",
  "data": {
    "requiredCredits": 80,
    "remainingCredits": 20
  }
}
```

Frontend translates by `errorKey`.

### Prompt Templates

Prompt compilation uses template records.

`prompt_templates` fields:

- `id`
- `locale`
- `template_key`
- `ability`
- `model_family`
- `title`
- `content`
- `variables_json`
- `version`
- `enabled`
- `created_at`
- `updated_at`

Selection order:

1. User locale and model family.
2. User locale and generic.
3. `en-US` and model family.
4. `en-US` and generic.
5. Built-in fallback.

User-authored prompt and notes remain in the user's original language unless the user explicitly asks for translation.

GenerationRun stores the actual `compiled_prompt` that was sent, so history does not change when templates change later.

## Admin Console

V1 admin modules:

- Users and membership.
- Credit ledger.
- Gateway configuration.
- Model capabilities.
- Model rate rules.
- Prompt templates.
- Generation jobs.
- Generation audit.
- NewAPI reconciliation summary.
- System settings.

Gateway configuration:

- NewAPI base URL.
- Internal NewAPI URL.
- NewAPI token.
- Timeout.
- Health check.
- Test request.

Sensitive tokens are write-only in UI.

System settings:

- Default locale.
- Open registration.
- Default registration plan.
- Storage provider status.
- Worker concurrency.
- Media size limits.
- Whether local direct API mode is allowed. For the SaaS product, it should default to disabled.

## Creative Agent

The product should implement an internal Creative Agent, not rely on Codex, Claude Code, local plugins, or MCP as the main user experience.

External agent/plugin integrations can remain optional or legacy, but the product route is native.

Agent architecture:

```text
Creative Agent UI
  -> App Server Agent Service
    -> NewAPI
    -> internal domain tools
```

Agent records:

- `agent_sessions`
- `agent_messages`
- `agent_tool_calls`

V1 abilities:

- Read current canvas.
- Read selected nodes.
- Read CreativeAsset summaries.
- Read ReferenceSet summaries.
- Suggest reference roles and weights.
- Apply a reference arrangement after user confirmation.
- Explain model capability warnings.
- Suggest next variations.

V1 should not let the agent silently spend credits. Any generation action requires explicit user confirmation unless a later user setting enables auto-execution with limits.

Internal tools:

- `list_canvas_nodes`
- `search_assets`
- `create_reference_set`
- `add_reference_intent`
- `update_reference_intent`
- `compile_reference_set_preview`
- `create_generation_run`
- `retry_generation_run`
- `save_output_as_asset`
- `rate_generation_output`
- `arrange_canvas`
- `summarize_generation_history`

Security:

- Agent cannot access another user's data.
- Agent cannot expose NewAPI tokens.
- Agent cannot bypass quota checks.
- Agent cannot permanently delete assets without explicit confirmation.
- Agent tool calls are audited.

## V1 Scope

V1 should deliver:

- SaaS account foundation.
- Product credits and admin adjustment.
- NewAPI gateway integration.
- R2 production media storage.
- PostgreSQL-backed generation jobs.
- MediaObject, CreativeAsset, ReferenceSet, ReferenceIntent, GenerationRun, GenerationOutput.
- ReferenceSet node and reference composer.
- Generation node and ResultGroup node.
- Model capabilities and rate rules admin pages.
- Prompt template i18n.
- Frontend i18n for `zh-CN` and `en-US`.
- Backend error keys.
- Basic generation audit page.
- Native Creative Agent suggestion mode.

V1 should not deliver:

- Team workspaces.
- Real-time collaboration.
- Comments.
- Automated payment provider callbacks.
- Custom reference labels.
- Advanced version history.
- Plugin marketplace.
- Direct OpenRouter integration.
- NewAPI user accounting as product accounting.
- Backward compatibility with existing local browser data.

## Implementation Strategy

Because compatibility is not required, implementation should prefer clean replacement over adapter-heavy migration.

Recommended sequence:

1. Establish i18n and API error envelope.
2. Replace model gateway config with NewAPI gateway config.
3. Add R2-backed media object storage.
4. Add domain tables and repositories.
5. Add model capabilities and rate rules.
6. Add generation job queue and worker.
7. Add ReferenceSet and ReferenceIntent APIs.
8. Rebuild canvas node model around domain references.
9. Build ReferenceSet node and composer.
10. Build Generation node and ResultGroup node.
11. Build asset library upgrade.
12. Add admin pages.
13. Add Creative Agent suggestion mode.

This should be implemented in focused slices. The first runnable slice should upload media to R2, create a ReferenceSet, compile a prompt preview, and create a queued GenerationRun against NewAPI.

## Open Questions

These do not block the V1 design, but should be decided during implementation planning:

- Which NewAPI image endpoints and request shapes are enabled in the user's deployed NewAPI version.
- Whether App Server and NewAPI will share a Docker network in 1Panel production.
- Whether media reads should proxy through App Server for all users in V1 or use short-lived signed URLs.
- Initial model capability seed list.
- Initial credit pricing formula for image generation.
- Whether local direct API mode should be removed immediately or hidden behind an admin setting.
