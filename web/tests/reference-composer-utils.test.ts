import { describe, expect, test } from "bun:test";

import {
    countReferenceSourceIntents,
    getReferenceSourceBinding,
    isReferenceSourceAdded,
    isReferenceSourceAvailable,
    normalizeReferenceCropRect,
    normalizeReferencePreviewOutput,
    referenceSourceKey,
} from "../src/app/(user)/canvas/components/reference-composer-utils";
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

    test("normalizes valid crop rectangles and rejects invalid regions", () => {
        expect(normalizeReferenceCropRect({ type: "rect", x: 0.1, y: 0.2, width: 0.3, height: 0.4 })).toEqual({
            type: "rect",
            x: 0.1,
            y: 0.2,
            width: 0.3,
            height: 0.4,
        });
        expect(normalizeReferenceCropRect({ type: "rect", x: 0.9, y: 0.2, width: 0.3, height: 0.4 })).toBeNull();
        expect(normalizeReferenceCropRect({ type: "circle", x: 0.1, y: 0.2, width: 0.3, height: 0.4 })).toBeNull();
    });

    test("counts multiple intents from the same canvas source", () => {
        const node = {
            id: "node-local-image",
            type: "image",
            title: "画布图片",
            metadata: {
                content: "blob:http://localhost/image",
            },
        } as CanvasNodeData;
        const intents = [
            { id: "intent-1", mediaObjectId: "media-1", assetId: "", metadataJson: { canvasNodeId: "node-local-image", sourceMode: "whole" } },
            { id: "intent-2", mediaObjectId: "media-1", assetId: "", metadataJson: { canvasNodeId: "node-local-image", sourceMode: "region" } },
        ] as ReferenceIntent[];

        expect(countReferenceSourceIntents(node, {}, intents)).toBe(2);
    });
});
