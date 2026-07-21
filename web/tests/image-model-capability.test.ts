import { describe, expect, test } from "bun:test";

import {
    imageReferencesForCapability,
    normalizeImageCapabilitySelection,
    resolveImageCapabilityRequestOptions,
    type ImageModelCapability,
} from "../src/lib/image-model-capability";
import { DEFAULT_IMAGE_MODELS } from "../src/stores/use-config-store";

const capability: ImageModelCapability = {
    model: "google/gemini-3-pro-image",
    provider: "google-vertex/global",
    supportedRatios: ["1:1", "16:9"],
    supportedResolutions: ["1K", "2K"],
    supportsReferences: true,
    maxReferences: 2,
    maxOutputsPerRequest: 1,
    source: "openrouter",
};

describe("image model capabilities", () => {
    test("removes Gemini 2.5 Flash Image from default image choices", () => {
        expect(DEFAULT_IMAGE_MODELS).not.toContain("default::google/gemini-2.5-flash-image");
    });

    test("normalizes unsupported selections to 1K and 1:1", () => {
        expect(normalizeImageCapabilitySelection(capability, "4K", "21:9")).toEqual({
            resolution: "1K",
            aspectRatio: "1:1",
        });
    });

    test("sends only options declared by the resolved capability", () => {
        expect(resolveImageCapabilityRequestOptions(capability, "2K", "16:9")).toEqual({
            resolution: "2K",
            aspect_ratio: "16:9",
        });
        expect(resolveImageCapabilityRequestOptions(capability, "4K", "21:9")).toEqual({});
    });

    test("drops references for unsupported models and rejects over-limit batches", () => {
        const references = [{ id: "a" }, { id: "b" }, { id: "c" }];
        expect(imageReferencesForCapability({ ...capability, supportsReferences: false }, references)).toEqual([]);
        expect(() => imageReferencesForCapability(capability, references)).toThrow("当前模型最多支持 2 张参考图");
    });
});
