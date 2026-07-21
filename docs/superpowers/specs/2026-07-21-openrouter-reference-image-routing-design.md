# OpenRouter 参考图统一转发设计

## 背景

当前生图工作台和画布只要带参考图，就会调用本项目的：

```http
POST /api/server/ai/images/edits
Content-Type: multipart/form-data
```

后端再把请求原样转发到 NewAPI 的 `/images/edits`。普通文本生图使用 `/images/generations` 可以成功，但参考图请求经过 NewAPI -> OpenRouter BYOK 后返回 404。服务日志确认本项目路由已经命中，404 来自上游，不是前端代理或 Gin 路由缺失。

OpenRouter 专用 Image API 使用统一图片生成请求，并通过 JSON 字段 `input_references` 接收参考图；它不要求 OpenAI multipart `/images/edits` 形式。因此需要在本项目后端把现有 edits 请求转换为 OpenRouter/NewAPI 能接受的 generations JSON。

## 目标

- 修复生图工作台使用参考图时的 404。
- 同时修复画布中的单图参考、多图参考、视角生成、批量参考图生成和失败重试。
- 画布蒙版编辑也走统一转换，把蒙版作为最后一张参考图近似表达。
- 所有模型都执行转换，不按模型厂商或模型 ID 分支，因为平台渠道统一为 NewAPI -> OpenRouter BYOK。
- 保持现有前端 `requestEdit` 调用方式，不让工作台和画布各自实现一套 OpenRouter 请求格式。
- 保持 `image_edit` 计费能力、鉴权、用量预留和失败退款流程。

## 非目标

- 不实现 OpenRouter 原生不存在的精确像素级 mask API。
- 不保证“蒙版作为参考图”的近似方案能完全锁定未选区域。
- 不改普通文本生图 `/images/generations` 的前端请求。
- 不改直连 Gemini 的前端兼容路径；本设计只作用于本项目服务器的 `/api/server/ai/images/edits`。
- 不新增依赖，不调整 NewAPI 或 OpenRouter 渠道配置。

## 已确认调用范围

生图工作台带参考图时调用 `requestEdit`。画布以下操作也复用同一函数：

- 单张图片作为参考图继续生成。
- 多参考图批量生成。
- 图片视角生成。
- 带参考图的失败任务重试。
- 局部蒙版编辑。

因此在后端入口统一转换，可以同时覆盖工作台和画布，不需要逐个修改调用点。

## 采用方案

把 `/api/server/ai/images/edits` 从通用原样代理改成专用处理器：

```text
工作台／画布 multipart edits
        |
        v
本项目后端解析表单和图片
        |
        v
生成 JSON + input_references
        |
        v
NewAPI /images/generations
        |
        v
OpenRouter Image API -> BYOK provider
```

转换对所有模型统一执行，不保留按 Google／非 Google 分流，也不再把服务器模式下的请求转发到上游 `/images/edits`。

## 请求转换规则

### 普通字段

保留当前 multipart 表单中的图片生成参数：

- `model`
- `prompt`
- `n`
- `response_format`
- `output_format`
- `resolution`
- `aspect_ratio`
- `quality`
- `size`

`n` 转成 JSON 数字；其他已发送字段保持现有字符串值。空字段不写入 JSON。

### 参考图

按 multipart 中 `image` 文件的原始顺序读取图片，并转成 data URL：

```json
{
  "type": "image_url",
  "image_url": {
    "url": "data:image/png;base64,..."
  }
}
```

最终写入：

```json
{
  "input_references": [
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
  ]
}
```

优先使用文件声明的图片 MIME；声明缺失时使用内容探测结果。没有任何 `image` 文件时返回 400，不向上游发送无效请求，也不预留额度。

### 蒙版

存在 `mask` 文件时：

1. 先放入所有普通 `image` 参考图。
2. 再把 `mask` 作为最后一张 `input_references`。
3. 在提示词末尾追加中文说明：最后一张参考图是蒙版，仅修改蒙版透明区域，其他区域尽量保持不变。

这是语义近似，不是原生 mask。UI 现有提示词和生成记录保持不变，后端只在实际发往上游的提示词中补充说明。

## 后端职责划分

### service

在 `ModelGatewayService` 所在领域新增可单测的图片编辑请求准备逻辑，负责：

- 解析 multipart 边界和表单。
- 读取普通字段。
- 把 `image`、`mask` 文件转换为 data URL。
- 生成 OpenRouter generations JSON。
- 返回参考图数量，供计费估算使用。

转换结果只包含上游需要的 JSON，不把内部计数字段发送给 OpenRouter。

### handler

新增专用 `ProxyImageEdit`：

- 读取 HTTP 请求体。
- 在预留额度前调用转换服务；格式错误直接返回 400。
- 继续以 `image_edit` 作为计费 ability。
- 使用转换后的字段估算额度，并把参考图数量写入估算参数。
- 把上游路径改为 `/images/generations`。
- 克隆必要请求头，移除旧 multipart `Content-Length`，把 `Content-Type` 改为 `application/json`。
- 沿用现有成功响应、上游错误透传、结算和失败退款流程。

### router

把现有：

```go
protected.POST("/ai/images/edits", aiHandler.ProxyPost("image_edit", "/images/edits"))
```

替换为专用处理器，外部 URL 保持不变，前端无需修改。

## 错误处理

- Content-Type 不是合法 multipart：400，中文提示请求格式错误。
- multipart 缺少边界或无法解析：400。
- 缺少普通参考图 `image`：400。
- 图片读取失败：400。
- JSON 序列化失败：500。
- NewAPI/OpenRouter 返回 4xx/5xx：继续透传状态码和响应体，并执行现有失败结算。
- 转换失败发生在额度预留前，避免产生无意义的冻结或失败用量记录。

## 计费

- 外部路由和业务语义仍是 `image_edit`，默认估算规则保持不变。
- 估算参数继续包含模型、数量、分辨率、质量等字段。
- 额外把普通参考图和蒙版的合计数量作为 `reference_count` 提供给计费计算，但不把该内部字段发送到上游。
- 成功后仍按预留额度结算；上游失败仍标记失败并释放额度。

## 测试

后端定向测试覆盖：

1. 单张参考图转换为 `/images/generations` JSON。
2. 多张 `image` 保持输入顺序。
3. `mask` 排在最后，并追加蒙版提示词。
4. 模型、数量、分辨率、宽高比、输出格式等字段保持正确。
5. 所有模型使用同一转换逻辑，不存在模型厂商分支。
6. 非法 multipart、缺边界、缺少 `image` 返回错误。
7. JSON 请求头替换正确，不把旧 multipart Content-Type 和 Content-Length 发送给上游。
8. 参考图数量进入 `image_edit` 计费估算，但不进入上游 JSON。
9. 现有普通生图、能力解析和 HTTP 响应测试继续通过。

不执行完整构建，只运行相关 Go 定向测试。实现后重建 `docker-compose.local.yml` 的 server，并由用户在 3006 开发前端验证工作台和画布参考图；真实生成会产生费用，不由自动测试触发。

## 验收标准

- 工作台上传参考图后不再请求一个会被 NewAPI/OpenRouter 返回 404 的上游 `/images/edits`。
- 本项目浏览器端 URL 仍可为 `/api/server/ai/images/edits`，但后端实际向 NewAPI 发送 `/images/generations` JSON。
- 工作台普通参考图生图成功。
- 画布单图、多图和重试参考图生图成功。
- 画布蒙版编辑可以生成结果，并明确属于近似效果。
- 普通无参考图生图保持成功。
- 失败请求不错误结算额度。
