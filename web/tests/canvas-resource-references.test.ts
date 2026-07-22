import { describe, expect, test } from "bun:test";

import { CanvasNodeType, type CanvasNodeData } from "../src/app/(user)/canvas/types";
import { buildCanvasResourceReferences } from "../src/app/(user)/canvas/utils/canvas-resource-references";

function imageNode(id: string, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return {
        id,
        type: CanvasNodeType.Image,
        title: id,
        position: { x: 0, y: 0 },
        width: 100,
        height: 100,
        metadata: { content: `data:image/png;base64,${id}`, ...metadata },
    };
}

describe("canvas resource references", () => {
    test("keeps global image labels stable while the image itself is active", () => {
        const references = buildCanvasResourceReferences(["one", "two", "three", "four", "five"].map(imageNode), [], "five");
        const active = references.find((reference) => reference.nodeId === "five");

        expect(active).toMatchObject({ label: "图片5", active: true });
    });

    test("numbers only generated images when image groups are present", () => {
        const references = buildCanvasResourceReferences(
            [
                imageNode("group-one", { isBatchRoot: true }),
                imageNode("group-one-a", { batchRootId: "group-one" }),
                imageNode("group-one-b", { batchRootId: "group-one" }),
                imageNode("group-one-c", { batchRootId: "group-one" }),
                imageNode("group-two", { isBatchRoot: true }),
                imageNode("group-two-a", { batchRootId: "group-two" }),
                imageNode("group-two-b", { batchRootId: "group-two" }),
                imageNode("group-two-c", { batchRootId: "group-two" }),
            ],
            [],
        );

        expect(references.map(({ nodeId, label }) => ({ nodeId, label }))).toEqual([
            { nodeId: "group-one-a", label: "图片1" },
            { nodeId: "group-one-b", label: "图片2" },
            { nodeId: "group-one-c", label: "图片3" },
            { nodeId: "group-two-a", label: "图片4" },
            { nodeId: "group-two-b", label: "图片5" },
            { nodeId: "group-two-c", label: "图片6" },
        ]);
    });
});
