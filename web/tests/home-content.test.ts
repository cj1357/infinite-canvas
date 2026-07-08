import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { getPromptShowcaseLayoutClass, homeQuickActions, homeStats, homeWorkflowCards } from "../src/app/(user)/home-content";

function source(path: string) {
    return readFileSync(path, "utf8");
}

describe("home content", () => {
    test("exposes primary creator entry points", () => {
        expect(homeQuickActions.map((item) => item.href)).toEqual(["/canvas?mode=recent", "/image", "/video", "/prompts"]);
        expect(homeQuickActions.every((item) => item.label.length > 0 && item.description.length > 0)).toBe(true);
    });

    test("keeps dashboard metrics factual", () => {
        expect(homeStats.find((item) => item.label === "存储状态")?.value).toBe("本地优先");
        expect(homeStats.some((item) => item.value.includes("云同步"))).toBe(false);
    });

    test("marks first and fourth prompt cards as featured", () => {
        expect(getPromptShowcaseLayoutClass(0)).toContain("md:col-span-2");
        expect(getPromptShowcaseLayoutClass(3)).toContain("md:col-span-2");
        expect(getPromptShowcaseLayoutClass(1)).toBe("");
    });

    test("describes the four creator workflow loops", () => {
        expect(homeWorkflowCards.map((item) => item.title)).toEqual(["开始", "组合", "生成", "整理"]);
    });

    test("keeps developer release links out of the public top navigation", () => {
        expect(source("src/components/layout/app-top-nav.tsx")).toContain("<UserStatusActions showReleaseLinks={false} />");
    });
});
