import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

function source(path: string) {
    return readFileSync(path, "utf8");
}

describe("ui warning patterns", () => {
    test("prompt components do not pass empty cover urls to img src", () => {
        expect(source("src/components/prompts/prompt-card.tsx")).not.toContain("src={item.coverUrl}");
        expect(source("src/components/prompts/prompt-detail-dialog.tsx")).not.toContain("src={prompt.coverUrl}");
    });

    test("drawers use size instead of deprecated height", () => {
        const videoPage = "src/app/(user)/video/page.tsx";
        if (existsSync(videoPage)) expect(source(videoPage)).not.toContain("<Drawer title=\"参数\" placement=\"bottom\" height=");
    });

    test("image workbench result previews preserve their original aspect ratio", () => {
        const page = source("src/app/(user)/image/page.tsx");
        expect(page).toContain('className="block h-auto w-full"');
        expect(page).not.toContain('className="aspect-square object-cover"');
    });

    test("canvas image settings resolve the selected model capability before showing options", () => {
        const popover = source("src/app/(user)/canvas/components/canvas-image-settings-popover.tsx");
        expect(popover).toContain("resolveImageModelCapability");
        expect(popover).toContain('["image-model-capability", capabilityModel]');
        expect(popover).toContain("capability={capability}");
        expect(popover).toContain("limitCountByCapability={false}");
    });

    test("canvas generation sends the selected model capability with image requests", () => {
        const page = source("src/app/(user)/canvas/[id]/canvas-client-page.tsx");
        expect(page).toContain("resolveCanvasImageRequestOptions");
        expect(page).toContain("imageCapability: await resolveImageModelCapability");
    });

    test("canvas prompt model picker reserves room for the complete model name", () => {
        expect(source("src/app/(user)/canvas/components/canvas-node-prompt-panel.tsx")).toContain('className="!w-[290px] !shrink-0"');
    });

    test("image-node prompt panel reserves space for model and settings controls", () => {
        expect(source("src/app/(user)/canvas/components/canvas-node.tsx")).toContain('data.type === CanvasNodeType.Image ? "w-[600px]" : "w-[500px]"');
    });

    test("image batch roots do not overlap their count with a resource label", () => {
        expect(source("src/app/(user)/canvas/components/canvas-node.tsx")).toContain("resourceLabel && !isBatchRoot");
    });

    test("image batch roots identify their group and count directly", () => {
        const node = source("src/app/(user)/canvas/components/canvas-node.tsx");
        expect(node).toContain("第 {batchGroupIndex} 组");
        expect(node).toContain("{batchCount} 张");
    });

    test("image batch group controls keep their label and arrow readable over image content", () => {
        const node = source("src/app/(user)/canvas/components/canvas-node.tsx");
        expect(node).toContain("background: theme.node.panel");
        expect(node).not.toContain("background: `${theme.toolbar.panel}d9`");
        expect(node).toContain("size-3.5 shrink-0 transition-transform");
    });

    test("canvas image ai tools are enabled by default and refresh stored quick-toolbar defaults", () => {
        const tools = source("src/app/(user)/canvas/components/canvas-image-toolbar-tools.tsx");
        expect(tools).toContain('IMAGE_QUICK_TOOLS_STORAGE_KEY = "canvas-image-quick-tools-v7"');
        expect(tools).toContain('id: "superResolve",\n        defaultVisible: true');
        expect(tools).toContain('id: "angle",\n        defaultVisible: true');
    });

    test("canvas super-resolution is implemented through image edit generation", () => {
        const page = source("src/app/(user)/canvas/[id]/canvas-client-page.tsx");
        expect(page).toContain("CanvasNodeSuperResolveDialog");
        expect(page).toContain("superResolveImageNode");
        expect(page).toContain("AI 超分高清重绘");
        expect(page).not.toContain("<div className=\"py-8 text-center text-base font-medium\">暂未实现</div>");
    });

    test("canvas ai image operation dialogs choose model settings before generation", () => {
        const angle = source("src/app/(user)/canvas/components/canvas-node-angle-dialog.tsx");
        const superResolve = source("src/app/(user)/canvas/components/canvas-node-super-resolve-dialog.tsx");
        const controls = source("src/app/(user)/canvas/components/canvas-ai-image-config-controls.tsx");
        expect(angle).toContain("CanvasAiImageConfigControls");
        expect(angle).toContain("onConfirm(params, config)");
        expect(superResolve).toContain("CanvasAiImageConfigControls");
        expect(superResolve).toContain("onConfirm(config)");
        expect(controls).toContain("ModelPicker");
        expect(controls).toContain("CanvasImageSettingsPopover");
    });

    test("canvas ai image controls place model picker and parameters on two rows", () => {
        const controls = source("src/app/(user)/canvas/components/canvas-ai-image-config-controls.tsx");
        expect(controls).toContain('className="grid min-w-0 gap-2"');
        expect(controls).toContain('buttonClassName="!h-9 !w-full !justify-start !rounded-full !px-3"');
        expect(controls).not.toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
        expect(controls).not.toContain("sm:!w-[190px]");
    });

    test("canvas multi-angle preview does not show a decorative ground shadow", () => {
        const angle = source("src/app/(user)/canvas/components/canvas-node-angle-dialog.tsx");
        expect(angle).not.toContain("-bottom-6 left-1/2 h-10 w-24");
        expect(angle).not.toContain("bg-black/20 backdrop-blur");
    });

    test("canvas image info distinguishes real pixels from canvas size", () => {
        const toolbar = source("src/app/(user)/canvas/components/canvas-node-hover-toolbar.tsx");
        expect(toolbar).toContain('InfoRow label="图片像素"');
        expect(toolbar).toContain("metadata?.naturalWidth");
        expect(toolbar).toContain("metadata?.naturalHeight");
        expect(toolbar).toContain('InfoRow label="画布尺寸"');
    });

    test("server ai requests use an explicit long-running next route instead of only rewrites", () => {
        const routePath = "src/app/api/server/ai/[...path]/route.ts";
        expect(existsSync(routePath)).toBe(true);
        const route = source(routePath);
        const nextConfig = source("next.config.ts");
        expect(route).toContain("export const maxDuration = 600");
        expect(route).toContain("process.env.SERVER_API_URL");
        expect(route).toContain("fetch(target.toString()");
        expect(nextConfig).toContain("fallback:");
        expect(nextConfig).toContain('source: "/api/server/:path*"');
    });

    test("server-side image requests are submitted as async generation runs", () => {
        const imageApi = source("src/services/api/image.ts");
        expect(imageApi).toContain("requestAsyncImageGeneration");
        expect(imageApi).toContain("createGenerationRun");
        expect(imageApi).toContain("getGenerationRunDetail");
        expect(imageApi).toContain("uploadMediaObject");
        expect(imageApi).toContain("mediaObjectUrl");
        expect(imageApi).toContain("referenceMediaObjectIds");
        expect(imageApi).toContain('ability: references.length || mask || runOptions?.referenceSetId ? "image_edit" : "image_generation"');
        expect(imageApi).toContain("return await requestAsyncImageGeneration");
    });

    test("local docker starts the generation worker for async image jobs", () => {
        expect(source("../server/internal/config/config.go")).toContain('boolEnv("WORKER_ENABLED", true)');
        expect(source("../docker-compose.local.yml")).toContain("WORKER_ENABLED: ${WORKER_ENABLED:-true}");
        expect(source("../docker-compose.local.yml")).toContain("WORKER_CONCURRENCY: ${WORKER_CONCURRENCY:-3}");
    });

    test("gateway timeout defaults are capped at ten minutes", () => {
        const adminPage = source("src/app/(user)/admin/gateway/page.tsx");
        expect(adminPage).toContain("timeoutSeconds: result.timeoutSeconds || 600");
        expect(adminPage).toContain('initialValues={{ provider: "newapi", enabled: true, timeoutSeconds: 600 }}');
        expect(adminPage).toContain("<InputNumber min={5} max={600}");
        expect(source("../server/internal/config/config.go")).toContain('intEnv("MODEL_GATEWAY_TIMEOUT_SECONDS", 600)');
        const gatewayService = source("../server/internal/service/model_gateway.go");
        expect(gatewayService).toContain("const maxGatewayTimeoutSeconds = 600");
        expect(gatewayService).toContain("normalizeGatewayTimeoutSeconds(cfg.TimeoutSeconds");
        expect(gatewayService).toContain("10 * time.Minute");
        expect(source("../server/internal/model/billing.go")).toContain('gorm:"not null;default:600"');
        expect(source("../docker-compose.local.yml")).toContain("MODEL_GATEWAY_TIMEOUT_SECONDS: ${MODEL_GATEWAY_TIMEOUT_SECONDS:-600}");
        expect(source("../docker-compose.yml")).toContain("MODEL_GATEWAY_TIMEOUT_SECONDS: ${MODEL_GATEWAY_TIMEOUT_SECONDS:-600}");
    });

    test("configuration nodes place model selection and image settings on separate rows", () => {
        const panel = source("src/app/(user)/canvas/components/canvas-config-node-panel.tsx");
        expect(panel).toContain('className="mb-2 grid min-w-0 cursor-default grid-cols-1 gap-2"');
        expect(panel).toContain('className="canvas-compact-control h-10"');
        expect(panel).not.toContain("fullWidth multiline");
    });

    test("canvas input numbers avoid deprecated addonBefore", () => {
        expect(source("src/app/(user)/canvas/components/generation-node.tsx")).not.toContain("addonBefore=");
        expect(source("src/app/(user)/canvas/components/reference-composer.tsx")).not.toContain("addonBefore=");
    });

    test("generation task node uses optional reference sets and unified image model controls", () => {
        const node = source("src/app/(user)/canvas/components/generation-node.tsx");
        expect(node).toContain("ModelPicker");
        expect(node).toContain("CanvasImageSettingsPopover");
        expect(node).toContain("allowClear");
        expect(node).toContain("canGenerate = Boolean((prompt.trim() || inputSummary.textCount > 0) && !running)");
        expect(node).not.toContain("&& node.metadata?.referenceSetId && !running");
        expect(node).not.toContain("<Input size=\"small\" value={node.metadata?.model");
    });

    test("generation task node surfaces failed run details", () => {
        const node = source("src/app/(user)/canvas/components/generation-node.tsx");
        expect(node).toContain("generationErrorMessage");
        expect(node).toContain("detail?.run.errorMessage");
        expect(node).toContain("detail?.job?.errorMessage");
        expect(node).toContain("node.metadata?.errorDetails");
    });

    test("generation task creation consumes upstream inputs and image capability params", () => {
        const page = source("src/app/(user)/canvas/[id]/canvas-client-page.tsx");
        expect(page).toContain("resolveGenerationTaskReferenceSetId");
        expect(page).toContain("requestAsyncImageRun");
        expect(page).toContain('count: "1"');
        expect(page).toContain("batchChildIds: count > 1 ? childIds : undefined");
        expect(page).toContain("imageBatchExpanded: count > 1 ? true : undefined");
        expect(page).toContain("inputSummary={getInputSummary(configInputsById.get(contentNode.id) || [])}");
        expect(page).toContain("node.type !== CanvasNodeType.Config && node.type !== CanvasNodeType.Generation");
        expect(page).not.toContain("uploadGenerationTaskReferences");
        expect(page).not.toContain("createResultGroupNode(parent, detail)");
    });

    test("generation task polling reloads missing run details after refresh", () => {
        const page = source("src/app/(user)/canvas/[id]/canvas-client-page.tsx");
        expect(page).toContain("const runDetail = generationDetailsByRunId[runId]");
        expect(page).toContain("if (!runDetail) return true");
    });

    test("generation task outputs reuse image batch nodes instead of result groups", () => {
        const page = source("src/app/(user)/canvas/[id]/canvas-client-page.tsx");
        expect(page).toContain("type: CanvasNodeType.Image");
        expect(page).toContain("isBatchRoot: count > 1");
        expect(page).toContain("batchRootId: count > 1 ? rootId : undefined");
        expect(page).toContain("primaryImageId: targetId");
        expect(page).toContain("targetIds.map(async (targetId)");
        expect(page).not.toContain("return [...next, createResultGroupNode(parent, detail)]");
    });

    test("generation task nodes reserve space for split model and parameter rows", () => {
        expect(source("src/app/(user)/canvas/constants.ts")).toContain('[CanvasNodeType.Generation]: { width: 360, height: 340, title: "生成任务" }');
        expect(source("src/app/(user)/canvas/components/generation-node.tsx")).toContain("overflow-y-auto");
    });

    test("generation task image runs keep generation metadata on image cards", () => {
        const page = source("src/app/(user)/canvas/[id]/canvas-client-page.tsx");
        expect(page).toContain("generationRunId: image.generationRunId");
        expect(page).toContain("generationOutputId: image.generationOutputId");
        expect(page).toContain("mediaObjectId: image.mediaObjectId");
    });

    test("reference composer intent rows avoid compressed four-column layout", () => {
        const file = source("src/app/(user)/canvas/components/reference-composer.tsx");
        expect(file).not.toContain("sm:grid-cols-[96px_minmax(0,1fr)_112px_56px]");
        expect(file).toContain("data-reference-intent-row");
        expect(file).toContain("flex-wrap");
    });

    test("reference composer keeps canvas source metadata on reference intents", () => {
        const file = source("src/app/(user)/canvas/components/reference-composer.tsx");
        expect(file).toContain("canvasNodeId: source.id");
        expect(file).toContain("sourceMode: options.sourceMode");
        expect(file).toContain("metadataJson: intent.metadataJson");
    });

    test("reference composer source menu exposes every reference role shortcut", () => {
        const file = source("src/app/(user)/canvas/components/reference-composer.tsx");
        expect(file).toContain("reference.composer.sourceWhole");
        expect(file).toContain("reference.composer.sourceRegion");
        expect(file).toContain("reference.composer.sourceStyle");
        expect(file).toContain("reference.composer.sourceComposition");
    });

    test("reference composer preview draft is persisted outside the transient node panel", () => {
        const composer = source("src/app/(user)/canvas/components/reference-composer.tsx");
        const canvasPage = source("src/app/(user)/canvas/[id]/canvas-client-page.tsx");
        expect(composer).toContain("export type ReferenceComposerDraft");
        expect(composer).toContain("draft?.preview");
        expect(composer).toContain("onDraftChange?.(node.id");
        expect(canvasPage).toContain("referenceComposerDrafts");
        expect(canvasPage).toContain("handleReferenceComposerDraftChange");
    });
});
