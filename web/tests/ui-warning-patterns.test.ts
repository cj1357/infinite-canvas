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
});
