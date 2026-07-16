import { describe, expect, test } from "bun:test";

import {
    getGoogleImageResolutionOptions,
    resolveGoogleImageAspectRatio,
    resolveGoogleImageRequestOptions,
} from "../src/lib/image-generation-options";

describe("Google image generation options", () => {
    test("maps arbitrary landscape pixels to Lite's supported 1K and 16:9 options", () => {
        expect(resolveGoogleImageRequestOptions("google/gemini-3.1-flash-lite-image", "auto", "1280x720")).toEqual({
            resolution: "1K",
            aspect_ratio: "16:9",
        });
    });

    test("maps explicit 2K dimensions to a supported resolution and ratio", () => {
        expect(resolveGoogleImageRequestOptions("default::google/gemini-3.1-flash-image", "auto", "2048x1152")).toEqual({
            resolution: "2K",
            aspect_ratio: "16:9",
        });
    });

    test("caps the Vertex Pro model at 2K", () => {
        expect(resolveGoogleImageRequestOptions("google/gemini-3-pro-image", "4K", "16:9")).toEqual({
            resolution: "2K",
            aspect_ratio: "16:9",
        });
    });

    test("omits unsupported resolution for Gemini 2.5 image", () => {
        expect(resolveGoogleImageRequestOptions("google/gemini-2.5-flash-image", "high", "1024x1536")).toEqual({
            aspect_ratio: "2:3",
        });
    });

    test("leaves non-Google image models on their existing request path", () => {
        expect(resolveGoogleImageRequestOptions("openai/gpt-image-1", "high", "1024x1024")).toBeNull();
    });

    test("exposes model-specific resolution controls and normalizes visible aspect selection", () => {
        expect(getGoogleImageResolutionOptions("google/gemini-3.1-flash-lite-image")).toEqual(["1K"]);
        expect(getGoogleImageResolutionOptions("google/gemini-3.1-flash-image")).toEqual(["512", "1K", "2K", "4K"]);
        expect(getGoogleImageResolutionOptions("google/gemini-3-pro-image")).toEqual(["1K", "2K"]);
        expect(getGoogleImageResolutionOptions("google/gemini-2.5-flash-image")).toEqual([]);
        expect(resolveGoogleImageAspectRatio("1360x1024")).toBe("4:3");
    });
});
