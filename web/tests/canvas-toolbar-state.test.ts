import { describe, expect, test } from "bun:test";

import { CANVAS_NODE_TOOLBAR_HIDE_DELAY_MS, resolveCanvasToolbarNodeId } from "../src/app/(user)/canvas/utils/canvas-toolbar-state";

describe("canvas toolbar state", () => {
    test("keeps the toolbar anchored to a single selected node after hover clears", () => {
        expect(resolveCanvasToolbarNodeId(null, new Set(["image-1"]))).toBe("image-1");
    });

    test("prefers the hovered node while crossing nearby nodes", () => {
        expect(resolveCanvasToolbarNodeId("image-2", new Set(["image-1"]))).toBe("image-2");
    });

    test("does not anchor the toolbar to a multi-selection", () => {
        expect(resolveCanvasToolbarNodeId(null, new Set(["image-1", "image-2"]))).toBeNull();
    });

    test("keeps a short grace period for moving into the toolbar", () => {
        expect(CANVAS_NODE_TOOLBAR_HIDE_DELAY_MS).toBeGreaterThanOrEqual(250);
        expect(CANVAS_NODE_TOOLBAR_HIDE_DELAY_MS).toBeLessThanOrEqual(320);
    });
});
