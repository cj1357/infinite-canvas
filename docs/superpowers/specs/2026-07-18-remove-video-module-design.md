# 设计文档：移除视频生成与创作模块

本设计文档阐述了如何在项目中彻底关闭并移除所有“视频”相关的生成和展示模块。

---

## 一、 方案选择与对比

我们将评估以下两个主要方案，并在现有代码的兼容性和稳定性之间进行权衡。

### 方案 A：全面彻底移除（连根拔起）
* **内容**：
  1. 删除 `/video` 路由目录和代码。
  2. 移除 `video.ts` API 文件及接口路由。
  3. 彻底删除全局状态 `use-config-store.ts` 中的所有视频字段（`videoModel`、`videoModels` 等）。
  4. 从画布节点类型 `CanvasNodeType` 中彻底移除 `Video` 类型，并删除画布 `canvas-client-page.tsx` 中所有的 `createVideoFileNode`、拖入视频文件、视频文件下载与保存到素材的全部逻辑。
* **缺点**：
  * **兼容性差**：如果用户本地 IndexedDB (localforage) 中原先存有带视频节点的画布 JSON，页面加载执行补水和解析时会因为缺少 `CanvasNodeType.Video` 而发生运行时崩溃或节点直接消失。
  * **改动面极大**：画布中的多选、框选、撤销重做、复制粘贴等模块都有对 `CanvasNodeType.Video` 的底层硬编码判定，修改会波及大量的核心交互代码，容易引入新的手势和渲染 bug。

### 方案 B：UI 隔离与生成功能停用（推荐，极简稳妥）
* **内容**：
  1. 彻底删除 `/video` 页面（视频创作台）。
  2. 从顶部导航栏 (`navigation-tools.ts`) 和仪表盘首页 (`home-content.ts`) 移除视频创作台的所有导航和快速入口。
  3. 修改配置面板和生成配置节点（`config` 类型节点），屏蔽“视频生成”相关的模式选择（禁止用户新建视频生成流，屏蔽视频模型和参数的全局配置项）。
  4. 停用后端 `/ai/videos` 相关的网关和计费预扣路由。
  5. 画布中屏蔽“新建视频节点”与“拖拽视频上传”等新建入口。但如果用户的旧画布 JSON 里含有的只读视频节点，依然会被保留并正常以 `<video>` 标签渲染，保证旧画布不会崩溃。
* **优点**：
  * 对画布底层的交互骨架（如平移、复制粘贴、撤销重做）改动极小。
  * 保证了用户旧数据的向下兼容性。
  * 符合 `AGENTS.md` 中“能简单实现就不要引入复杂抽象，不要顺手重构”的基本开发原则。

---

## 二、 详细设计（方案 B 的改造边界）

### 1. 前端页面与入口
* **删除目录**：`web/src/app/(user)/video`
* **修改导航**：
  * `web/src/constant/navigation-tools.ts`：移除 `slug === "video"` 的选项。
  * `web/src/app/(user)/home-content.ts`：移除 `href === "/video"` 的快速操作按钮。
  * `web/src/services/app-sync.ts`：移除视频创作台在 WebDAV 同步和渲染中的定义。

### 2. 画布与生成配置
* **隐藏视频生成选项**：
  * `web/src/app/(user)/canvas/components/canvas-config-composer.tsx`：在生成模式切换的 Radio 组中，移除 `"video"` 选项。
  * `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`：
    * 连线生成菜单中，移除“视频生成”选项，使连线后无法再生成视频节点。
    * 文件拖拽和上传中，移除对 `video/*` 文件的接收逻辑，防止用户通过拖入本地视频来创建新视频节点。
* **全局设置面板**：
  * 隐藏设置面板中涉及“视频模型”与“视频参数（时长、水印等）”的输入区块。

### 3. 后端接口
* **关闭路由**：
  * `server/internal/router/router.go`：将 `POST /ai/videos`、`GET /ai/videos/:id`、`GET /ai/videos/:id/content` 路由屏蔽或返回 `403 Forbidden`（或 404）。
