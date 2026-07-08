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
});
