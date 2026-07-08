import { describe, expect, test } from "bun:test";

import { buildInsertAssetPayload } from "../src/app/(user)/canvas/components/asset-picker-payload";
import type { ImageAsset } from "../src/stores/use-asset-store";

describe("asset picker payload", () => {
    test("uses the visible cover url when a stored image asset has an empty data url", () => {
        const asset: ImageAsset = {
            id: "asset-1",
            kind: "image",
            title: "画布图片",
            coverUrl: "blob:http://localhost/preview",
            tags: [],
            createdAt: "2026-07-08T00:00:00.000Z",
            updatedAt: "2026-07-08T00:00:00.000Z",
            data: {
                dataUrl: "",
                storageKey: "image:stored",
                width: 640,
                height: 480,
                bytes: 1024,
                mimeType: "image/png",
            },
        };

        expect(buildInsertAssetPayload(asset)).toEqual({
            kind: "image",
            title: "画布图片",
            dataUrl: "blob:http://localhost/preview",
            storageKey: "image:stored",
            width: 640,
            height: 480,
            bytes: 1024,
            mimeType: "image/png",
        });
    });
});
