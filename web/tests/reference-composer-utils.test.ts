import { describe, expect, test } from "bun:test";

import { getReferenceSourceBinding, isReferenceSourceAdded, isReferenceSourceAvailable, normalizeReferencePreviewOutput, referenceSourceKey } from "../src/app/(user)/canvas/components/reference-composer-utils";
import type { CanvasNodeData } from "../src/app/(user)/canvas/types";
import type { CompileReferenceSetPreviewOutput, ReferenceIntent } from "../src/services/api/creative";

describe("reference composer utils", () => {
    test("normalizes null preview arrays from the server", () => {
        const preview = normalizeReferencePreviewOutput({
            compiledPrompt: "生成一张图",
            compiledReferenceJson: null,
            warnings: null,
            enabledReferences: null,
        } as unknown as CompileReferenceSetPreviewOutput);

        expect(preview).toEqual({
            compiledPrompt: "生成一张图",
            compiledReferenceJson: {},
            warnings: [],
            enabledReferences: [],
        });
    });

    test("allows local image nodes to be added as reference sources", () => {
        const node = {
            id: "node-local-image",
            type: "image",
            title: "画布图片",
            metadata: {
                content: "blob:http://localhost/image",
            },
        } as CanvasNodeData;

        expect(isReferenceSourceAvailable(node, {})).toBe(true);
        expect(getReferenceSourceBinding(node, {})).toEqual({ mediaObjectId: "", assetId: "" });
        expect(referenceSourceKey(node, { "node-local-image": { mediaObjectId: "media-1" } })).toBe("media:media-1");
    });

    test("recognizes local source nodes already linked by reference intent metadata", () => {
        const node = {
            id: "node-local-image",
            type: "image",
            title: "画布图片",
            metadata: {
                content: "blob:http://localhost/image",
            },
        } as CanvasNodeData;
        const intent = {
            id: "intent-1",
            mediaObjectId: "media-1",
            assetId: "",
            metadataJson: { canvasNodeId: "node-local-image" },
        } as ReferenceIntent;

        expect(isReferenceSourceAdded(node, {}, [intent])).toBe(true);
    });
});
