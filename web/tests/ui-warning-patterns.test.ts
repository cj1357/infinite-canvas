import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function source(path: string) {
    return readFileSync(path, "utf8");
}

describe("ui warning patterns", () => {
    test("prompt components do not pass empty cover urls to img src", () => {
        expect(source("src/components/prompts/prompt-card.tsx")).not.toContain("src={item.coverUrl}");
        expect(source("src/components/prompts/prompt-detail-dialog.tsx")).not.toContain("src={prompt.coverUrl}");
    });

    test("drawers use size instead of deprecated height", () => {
        expect(source("src/app/(user)/video/page.tsx")).not.toContain("<Drawer title=\"参数\" placement=\"bottom\" height=");
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
