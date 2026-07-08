# Site Shell And Homepage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地全站重设计第一阶段：设计系统底座、应用顶部导航、移动导航和 Studio OS 首页。

**Architecture:** 保持现有 Next.js App Router、Ant Design、Tailwind v4、Zustand 架构不变。新增一个首页内容配置模块承载快速入口和产品状态展示数据，首页组件消费该配置重建首屏和展示区，导航组件在原文件内做视觉升级。

**Tech Stack:** Next.js 16, React 19, TypeScript, Ant Design 6, Tailwind v4, lucide-react, Bun test for the new pure content module.

## Global Constraints

- 页面文案保持中文。
- 不引入新的 UI 框架。
- 不改变模型生成请求、存储逻辑或后端接口。
- 首页、导航和共享样式必须支持深浅主题。
- 不暗示云同步已完成，涉及素材存储时明确当前能力。
- 不修改画布详情页核心交互。

---

### Task 1: 首页内容配置和测试

**Files:**
- Create: `web/src/app/(user)/home-content.ts`
- Create: `web/tests/home-content.test.ts`

**Interfaces:**
- Produces: `homeQuickActions`, `homeStats`, `homeWorkflowCards`, `getPromptShowcaseLayoutClass(index: number): string`
- Consumes: no project runtime state

- [ ] **Step 1: Write the failing test**

Create `web/tests/home-content.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { getPromptShowcaseLayoutClass, homeQuickActions, homeStats, homeWorkflowCards } from "../src/app/(user)/home-content";

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test "tests/home-content.test.ts"` from `web/`.

Expected: FAIL because `./home-content` does not exist.

- [ ] **Step 3: Implement content module**

Create `web/src/app/(user)/home-content.ts` with exported typed arrays for quick actions, stats, workflow cards, and `getPromptShowcaseLayoutClass`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test "tests/home-content.test.ts"` from `web/`.

Expected: PASS.

### Task 2: 全局视觉 token 和字体

**Files:**
- Modify: `web/src/app/layout.tsx`
- Modify: `web/src/app/globals.css`
- Modify: `web/src/lib/app-theme.ts`

**Interfaces:**
- Consumes: existing `AppProviders`, Ant Design theme bridge, Tailwind v4 variables
- Produces: improved font variables, darker Studio background, single cyan accent, shared surface utilities

- [ ] **Step 1: Update root font setup**

Use `next/font/google` with `Geist` and `Geist_Mono`. Attach their CSS variables on `<html>` and remove the inline body font stack.

- [ ] **Step 2: Update global CSS variables**

Add Studio OS tokens for background, foreground, card, border, primary, muted, accent, and monospace font mapping. Add reusable classes: `.studio-grid`, `.studio-surface`, `.studio-panel`, `.studio-focus-ring`.

- [ ] **Step 3: Update Ant Design theme**

Set primary/info/link colors to the single cyan accent while keeping readable text on primary buttons. Keep component overrides minimal.

### Task 3: 应用顶部导航和移动导航

**Files:**
- Modify: `web/src/components/layout/app-top-nav.tsx`
- Modify: `web/src/components/layout/mobile-nav-drawer.tsx`
- Modify: `web/src/components/layout/user-status-actions.tsx`

**Interfaces:**
- Consumes: `navigationTools`, `useUserStore`, `UserStatusActions`
- Produces: compact SaaS app shell, clearer active state, mobile drawer with primary actions

- [ ] **Step 1: Redesign desktop header**

Keep route visibility logic. Update classes to a lighter shell with product mark, nav links, active underline/dot, and a right-side action cluster.

- [ ] **Step 2: Redesign mobile drawer**

Add a short header and quick route group. Preserve all current routes and close behavior.

- [ ] **Step 3: Adjust utility action styling**

Make right-side icon actions fit the shell with consistent 32px targets and theme-aware hover/focus states.

### Task 4: Studio OS 首页

**Files:**
- Modify: `web/src/app/(user)/page.tsx`
- Consume: `web/src/app/(user)/home-content.ts`

**Interfaces:**
- Consumes: `fetchPrompts`, `navigationTools`, `homeQuickActions`, `homeStats`, `homeWorkflowCards`, `getPromptShowcaseLayoutClass`
- Produces: dashboard-like homepage with prompt showcase, empty/loading/error-ready visual states

- [ ] **Step 1: Replace centered hero**

Use an asymmetric first view with product name, concise positioning, primary/secondary actions, and product preview cards.

- [ ] **Step 2: Add dashboard modules**

Render quick actions, workflow cards, factual stats, and prompt showcase using real data where available.

- [ ] **Step 3: Add robust prompt image fallback**

When a prompt lacks `coverUrl`, render a designed fallback surface instead of a broken image.

### Task 5: 文档和验证

**Files:**
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Optionally modify: `docs/content/docs/progress/todo.mdx` only if a listed todo is completed by this first batch

**Interfaces:**
- Consumes: actual implementation summary
- Produces: user-testable pending-test entry for the visual redesign batch

- [ ] **Step 1: Update pending-test**

Record the homepage and shell redesign as pending user verification.

- [ ] **Step 2: Run verification**

Run from `web/`:

```bash
bun test "tests/home-content.test.ts"
bun run build
```

Expected: tests pass and build succeeds.

- [ ] **Step 3: Browser smoke check**

Open `http://localhost:3005`, verify homepage renders, navigation links are visible, prompt cards do not show broken image boxes, and mobile viewport does not overlap major text.
