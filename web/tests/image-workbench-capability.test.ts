import { describe, expect, test } from "bun:test";

import { isImageModelCapabilityReady, mergeImageReferencesForCapability, type ImageModelCapability } from "../src/lib/image-model-capability";

const capability: ImageModelCapability = {
    model: "google/gemini-3-pro-image",
    provider: "google-vertex/global",
    supportedRatios: ["1:1"],
    supportedResolutions: ["1K"],
    supportsReferences: true,
    maxReferences: 2,
    maxOutputsPerRequest: 1,
    source: "openrouter",
};

describe("image workbench capability guards", () => {
    for (const item of [
        { name: "accepts an idle successful capability", state: { capability, isFetching: false, error: null }, expected: true },
        { name: "rejects a capability while fetching", state: { capability, isFetching: true, error: null }, expected: false },
        { name: "rejects a capability with an error", state: { capability, isFetching: false, error: new Error("failed") }, expected: false },
    ]) {
        test(item.name, () => {
            expect(isImageModelCapabilityReady(item.state)).toBe(item.expected);
        });
    }

    for (const item of [
        { name: "rejects references while capability is fetching", overrides: { isFetching: true } },
        { name: "rejects references when capability has an error", overrides: { error: new Error("failed") } },
        { name: "rejects references after switching models", overrides: { currentModel: "google/gemini-3.1-flash-image" } },
        { name: "rejects references for unsupported models", overrides: { capability: { ...capability, supportsReferences: false } } },
    ]) {
        test(item.name, () => {
            const current = [{ id: "existing" }];
            const result = mergeImageReferencesForCapability({
                capability,
                isFetching: false,
                error: null,
                current,
                incoming: [{ id: "new" }],
                expectedModel: capability.model,
                currentModel: capability.model,
                ...item.overrides,
            });
            expect(result).toBe(current);
        });
    }

    test("clips incoming references to the latest available quota", () => {
        const result = mergeImageReferencesForCapability({
            capability,
            isFetching: false,
            error: null,
            current: [{ id: "existing" }],
            incoming: [{ id: "first" }, { id: "second" }],
            expectedModel: capability.model,
            currentModel: capability.model,
        });
        expect(result.map((item) => item.id)).toEqual(["existing", "first"]);
    });

    test("keeps sequential concurrent completions within the latest quota", () => {
        const state = { capability, isFetching: false, error: null, expectedModel: capability.model, currentModel: capability.model };
        const first = mergeImageReferencesForCapability({ ...state, current: [], incoming: [{ id: "a" }, { id: "b" }] });
        const second = mergeImageReferencesForCapability({ ...state, current: first, incoming: [{ id: "c" }, { id: "d" }] });
        expect(second.map((item) => item.id)).toEqual(["a", "b"]);
        expect(second).toHaveLength(capability.maxReferences);
    });
});
