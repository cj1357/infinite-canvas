import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const page = readFileSync("src/app/(user)/image/page.tsx", "utf8");

describe("image workbench capability guards", () => {
    test("uses one readiness gate for generation buttons and request snapshots", () => {
        expect(page).toContain("const capabilityReady = Boolean(capability && !capabilityQuery.isFetching && !capabilityQuery.error);");
        expect(page).toContain("const canGenerate = Boolean(prompt.trim() && capabilityReady);");
        expect(page).toContain("if (!capabilityReady || !capability)");
    });

    test("atomically appends async references against the latest model capability", () => {
        expect(page).toContain("const appendReferences = (nextReferences: ReferenceImage[], expectedModel: string) => {");
        expect(page).toContain("const currentConfig = useConfigStore.getState().config;");
        expect(page).toContain("queryClient.getQueryState<ImageModelCapability>");
        expect(page).toContain("currentModel !== expectedModel");
        expect(page).toContain("currentCapability.model !== currentModel");
        expect(page).toContain('currentCapabilityState?.fetchStatus !== "idle"');
        expect(page).toContain("setReferences((prev) => {");
        expect(page).toContain("nextReferences.slice(0, availableSlots)");
        expect(page).not.toContain("setReferences((value) => [...value,");
    });
});
