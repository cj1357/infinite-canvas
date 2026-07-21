# 生图工作台 OpenRouter 模型能力设计规格

## 背景

当前生图工作台的模型列表和图片参数主要由前端硬编码：模型下拉框在窄列中显示不完整，Gemini 2.5 Flash Image 仍在可选列表里，分辨率和宽高比也没有按照实际渠道能力动态变化。

生产调用链固定为：

```text
无限画布 -> NewAPI -> OpenRouter -> Google Vertex BYOK
```

OpenRouter 提供专用的 Image Models API。模型级 `supported_parameters` 是所有供应端点能力的并集；`/images/models/{model}/endpoints` 返回的 endpoint 级 `supported_parameters` 才是具体供应商实际接受的参数。对于 Gemini 3 Pro Image，模型并集包含 4K，但 Google Vertex endpoint 只支持 1K 和 2K，因此工作台必须读取 Google Vertex endpoint，不能直接使用模型级并集。

## 目标

- 生图工作台的模型字段占满参数栏宽度，当前选中项和下拉选项能够完整辨认。
- 从生图模型列表移除 `google/gemini-2.5-flash-image`，保留现有文本类 Gemini 2.5 模型。
- 首次进入工作台和每次切换模型时，先读取该模型在 OpenRouter Google Vertex endpoint 下的能力，再展示参数。
- 分辨率、宽高比、参考图入口只按照能力响应展示。
- 工作台最终发送的 `resolution`、`aspect_ratio` 和参考图必须与当前已加载能力一致。
- OpenRouter 短暂不可用时使用短期缓存或数据库能力记录兜底，不回退到一套对所有模型都相同的错误选项。

## 非目标

- 不改造 NewAPI 的生成、计费或渠道配置。
- 不自动发现或替换当前平台配置的生图模型列表。
- 不改动画布里的模型参数面板；画布继续沿用现有兼容路径。
- 不把 OpenRouter BYOK 密钥保存到本项目。
- 不修改文本、音频等其他模型的能力展示。

## 方案比较

### 方案一：前端直接请求 OpenRouter

实现最短，但会让工作台直接依赖 OpenRouter 的响应结构和可用性，也难以统一缓存、供应商筛选与数据库兜底。

### 方案二：后端解析 OpenRouter endpoint 能力（采用）

前端只调用本项目的稳定接口；后端请求 OpenRouter endpoint 列表，选择 Google Vertex，归一化成工作台需要的数据，并负责缓存和数据库兜底。生成请求仍走 NewAPI。

优点是前端数据结构稳定，能够准确区分 Google Vertex 和 Google AI Studio 的参数差异，也能复用已有 `model_capabilities` 表。

### 方案三：完全使用本地能力表

运行稳定，但能力更新需要人工维护，无法满足“切换模型时先访问实际模型能力”的要求，仅适合作为兜底。

## 后端接口

新增登录用户可读接口：

```http
GET /api/server/model-capabilities/resolve?model=google%2Fgemini-3.1-flash-image
```

前端传入去掉渠道前缀后的 OpenRouter 模型 ID。后端固定解析 `google-vertex` endpoint，不允许客户端任意指定上游 URL。

成功响应：

```json
{
  "code": 0,
  "data": {
    "model": "google/gemini-3.1-flash-image",
    "provider": "google-vertex/global",
    "supportedRatios": ["1:1", "1:4", "1:8", "2:3", "3:2"],
    "supportedResolutions": ["512", "1K", "2K", "4K"],
    "supportsReferences": true,
    "maxReferences": 14,
    "maxOutputsPerRequest": 1,
    "source": "openrouter"
  },
  "msg": "ok"
}
```

`source` 可为 `openrouter`、`cache` 或 `database`，用于排查问题，不参与前端选项判断。

## OpenRouter 能力解析

后端请求：

```http
GET https://openrouter.ai/api/v1/images/models/{author}/{slug}/endpoints
```

选择 endpoint 的顺序：

1. `provider_tag` 或 `provider_slug` 等于 `google-vertex/global`。
2. 否则选择第一个以 `google-vertex/` 开头的 endpoint。
3. 没有 Google Vertex endpoint 时视为上游能力不可用并进入数据库兜底，不使用其他供应商的能力冒充 Google Vertex。

字段归一化规则：

- `supported_parameters.resolution.values` -> `supportedResolutions`。
- `supported_parameters.aspect_ratio.values` -> `supportedRatios`。
- `supported_parameters.input_references.max > 0` -> `supportsReferences=true`。
- `supported_parameters.input_references.max` -> `maxReferences`。
- `supported_parameters.n.max` -> `maxOutputsPerRequest`。
- 上游未返回某个参数时，对应能力为空或 `false`，前端不展示该参数。

模型 ID 必须符合 `{author}/{slug}` 结构；后端分别转义两个路径段，并为 OpenRouter 请求设置 10 秒超时。

## 缓存与数据库兜底

- 后端以内存缓存模型能力 10 分钟，键为规范化后的模型 ID。
- 前端查询同一模型时也设置 10 分钟 `staleTime`，避免在模型之间来回切换时重复闪烁。
- OpenRouter 请求失败或找不到 Google Vertex endpoint 时，读取现有 `model_capabilities` 表中 `model + ability=image` 的启用记录。
- 数据库只回退具体模型，不回退当前过于宽泛的 `default` 记录。
- 初始化时以“冲突则不覆盖”的方式补齐三款模型的兜底记录，保留管理员后续修改的值。
- 缓存和数据库都没有有效能力时返回错误；前端隐藏能力参数、禁用生成并提供重试，不猜测模型支持项。

Google Vertex 当前兜底数据：

| 模型 | 分辨率 | 宽高比 | 参考图上限 | 单次上游输出上限 |
| --- | --- | --- | --- | --- |
| `google/gemini-3.1-flash-lite-image` | `1K` | `1:1`、`1:4`、`1:8`、`2:3`、`3:2`、`3:4`、`4:1`、`4:3`、`4:5`、`5:4`、`8:1`、`9:16`、`16:9`、`21:9` | 14 | 1 |
| `google/gemini-3.1-flash-image` | `512`、`1K`、`2K`、`4K` | `1:1`、`1:4`、`1:8`、`2:3`、`3:2`、`3:4`、`4:1`、`4:3`、`4:5`、`5:4`、`8:1`、`9:16`、`16:9`、`21:9` | 14 | 1 |
| `google/gemini-3-pro-image` | `1K`、`2K` | `1:1`、`2:3`、`3:2`、`3:4`、`4:3`、`4:5`、`5:4`、`9:16`、`16:9`、`21:9` | 14 | 1 |

## 前端交互

### 模型选择

- 工作台的模型字段跨越参数区两列，触发框使用全部可用宽度。
- 下拉层宽度至少跟随触发框，最大不超过视口；模型名和渠道名分层展示，长名称允许换行，不再用单行截断隐藏关键部分。
- 默认生图模型列表只保留三款 3.x 图片模型。

### 能力加载

- 初始模型和每次切换后的模型分别触发能力查询。
- 查询期间隐藏旧模型的参数，显示“正在读取模型能力”，并暂时禁用生成，防止把上一模型的参数发送给新模型。
- 查询成功后再渲染参考图、分辨率和宽高比。
- 查询失败且没有兜底时显示错误和重试入口。

### 参数切换

- 分辨率只展示 `supportedResolutions`。
- 宽高比只展示 `supportedRatios`；不额外添加上游未声明的 `auto`。
- 切换模型后，如果原选择仍受支持则保留；否则分辨率优先选择 `1K`，宽高比优先选择 `1:1`，不存在时选择能力列表第一项。
- 不再展示任意宽高输入，因为 Google Vertex endpoint 的能力是枚举集合。
- 工作台的“生成张数”是客户端批次大小：当前实现会拆成多个 `n=1` 请求，因此继续允许 1 到 10 张，不受 endpoint 的 `n.max=1` 限制。

### 参考图

- `supportsReferences=true` 时展示参考图区，并限制最多 `maxReferences` 张。
- `supportsReferences=false` 时不展示参考图区，也不向生成请求发送参考图。
- 如果用户已经选择参考图后切换到不支持参考图的模型，保留当前页面内的参考图状态，提示“该模型不支持参考图，本次不会发送”；切回支持模型后恢复展示。

## 请求一致性

工作台生成快照保存当前能力结果。请求适配层使用该快照生成 `resolution` 和 `aspect_ratio`，并在发送前再次过滤参考图，避免能力请求完成后模型又发生切换造成参数串用。

现有前端硬编码 Google 规格只保留为未迁移画布路径的兼容逻辑；生图工作台不再用它决定可见选项或校正请求参数。

## 错误处理

- OpenRouter 超时、非 2xx、JSON 结构错误：尝试具体模型的数据库能力。
- 能力响应缺少 Google Vertex endpoint：尝试数据库能力，并记录明确错误，不合并其他 provider 的能力。
- 能力列表为空：视为不支持该参数，而不是展示通用默认项。
- 参考图超过上限：上传入口禁用并提示允许的最大数量；生成前再次校验。
- 模型能力加载失败：禁止生成，避免发送未经验证的参数。

## 测试与验收

后端测试：

- 从包含 Google AI Studio 和 Google Vertex 的 endpoint 响应中准确选择 Google Vertex。
- Gemini 3 Pro Image 不从模型并集误取 4K。
- 正确解析 enum、range 和缺失参数。
- 上游失败时回退具体模型数据库记录；无兜底时返回错误。
- 缓存命中时不重复访问上游。

前端测试：

- Gemini 2.5 Flash Image 不出现在生图模型列表。
- 根据能力数组生成分辨率和比例选项。
- 模型切换后把失效参数归一化为 1K、1:1 或首项。
- 不支持参考图时生成快照不包含参考图。

人工验收：

- 在 `localhost:3006/image` 查看模型框和下拉项是否完整。
- 依次切换三款模型，核对分辨率、比例和参考图区域。
- 验证 Gemini 3 Pro Image 的 Google Vertex 选项中没有 4K。
- 切换模型时确认旧参数不会短暂保留并被提交。
- 使用一张参考图完成一次生成，确认生成请求仍经过 NewAPI。

## 文档影响

实现完成后在 `docs/content/docs/progress/pending-test.mdx` 记录本版本可测试变更。该任务不新增数据表或字段，因此无需修改数据库结构文档；没有新增后续待办时不修改 `todo.mdx`。
