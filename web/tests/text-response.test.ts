import { describe, expect, test } from "bun:test";

import { requestImageQuestion } from "../src/services/api/image";
import { defaultConfig, type AiConfig } from "../src/stores/use-config-store";

function textConfig(): AiConfig {
    return {
        ...defaultConfig,
        model: "google/gemini-3.5-flash",
        textModel: "google/gemini-3.5-flash",
        systemPrompt: "",
    };
}

describe("text responses api", () => {
    test("parses non-stream JSON response payloads from the server proxy", async () => {
        const originalFetch = globalThis.fetch;
        const deltas: string[] = [];
        globalThis.fetch = (async () =>
            new Response(JSON.stringify({ id: "resp_test", output_text: "反推提示词正文", output: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })) as typeof fetch;
        try {
            const answer = await requestImageQuestion(textConfig(), [{ role: "user", content: "请反推提示词" }], (text) => deltas.push(text));
            expect(answer).toBe("反推提示词正文");
            expect(deltas).toEqual([]);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
