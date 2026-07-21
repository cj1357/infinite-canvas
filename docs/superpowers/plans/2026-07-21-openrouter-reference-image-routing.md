# OpenRouter 参考图统一转发实施计划

> **供智能体执行者使用：** 必须使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 子技能，逐项执行本计划。各步骤使用复选框（`- [ ]`）跟踪进度。

**目标：** 把服务器收到的所有 multipart 图片编辑请求统一转换为 OpenRouter `input_references` JSON，并经 NewAPI `/images/generations` 转发，从而同时修复工作台、画布参考图和画布蒙版编辑的 404。

**架构：** 在 `ModelGatewayService` 中新增一个独立、可测试的请求准备器，负责 multipart 解析、图片 data URL 编码、蒙版近似提示和计费估算参数；`AIHandler` 新增专用入口，复用现有预留、代理、结算与失败逻辑，但把上游路径和 Content-Type 换成准备器的结果。前端现有 `requestEdit` 以及所有工作台／画布调用点保持不变。

**技术栈：** Go 1.23、Gin、标准库 `mime/multipart` / `encoding/base64` / `encoding/json`、现有 GORM 计费服务、Docker Compose Local。

## 全局约束

- 生产调用链固定为 Infinite Canvas -> NewAPI -> OpenRouter BYOK；本项目不直接保存 OpenRouter 密钥。
- 所有服务器模式下的 `/api/server/ai/images/edits` 请求都转换，不按 Google／非 Google 或具体模型 ID 分支。
- 所有普通 `image` 文件保持原始顺序；存在 `mask` 时把它作为最后一张参考图。
- 蒙版只做语义近似，不宣称提供原生像素级 mask 能力。
- 外部前端 URL 和 `requestEdit` 接口保持不变；不逐个修改工作台或画布调用点。
- 计费 ability 保持 `image_edit`，转换失败发生在额度预留之前，上游失败继续走现有失败结算。
- 上游统一使用 NewAPI `/images/generations`；不再把服务器模式请求发往 `/images/edits`。
- 不新增依赖，不改普通无参考图生图，不改直连 Gemini 兼容路径。
- 不自动触发真实生图测试，避免产生费用；人工验收由用户执行。
- 页面与文档文案保持中文。
- 不修改无关文件，不覆盖用户已有改动。

---

## 文件映射

**新增文件**

- `server/internal/service/model_gateway_test.go`：multipart 转换、字段、顺序、蒙版、错误和计费估算测试。
- `server/internal/handler/ai_test.go`：图片编辑上游请求头规范化测试。

**修改文件**

- `server/internal/service/model_gateway.go`：新增 `PreparedImageEditRequest` 和 `PrepareImageEditRequest`。
- `server/internal/handler/ai.go`：新增 `ProxyImageEdit`，并把通用代理结算流程提取为私有方法复用。
- `server/internal/router/router.go`：将 edits 路由切换到专用 handler。
- `docs/content/docs/progress/pending-test.mdx`：加入参考图统一转发待测项。

**只检查**

- `docs/content/docs/progress/todo.mdx`：确认没有对应待办，不新增重复事项。
- `web/src/services/api/image.ts`：确认工作台和画布仍通过现有 `requestEdit` 命中服务器路由，不修改。

---

### Task 1：新增 multipart 到 OpenRouter JSON 的请求准备器

**文件：**

- 新增：`server/internal/service/model_gateway_test.go`
- 修改：`server/internal/service/model_gateway.go:1-181`

**接口：**

- 使用：`EstimateRequest`
- 产出：

```go
type PreparedImageEditRequest struct {
    UpstreamPath  string
    ContentType   string
    Body          []byte
    ReferenceCount int
    Estimate      EstimateRequest
}

func (s *ModelGatewayService) PrepareImageEditRequest(contentType string, body []byte) (PreparedImageEditRequest, error)
```

- [ ] **步骤 1：创建 multipart 测试辅助函数**

在 `server/internal/service/model_gateway_test.go` 写入：

```go
package service

import (
    "bytes"
    "encoding/json"
    "mime/multipart"
    "net/textproto"
    "testing"
)

type testUpload struct {
    field string
    name  string
    mime  string
    data  []byte
}

func buildImageEditMultipart(t *testing.T, values map[string]string, files []testUpload) (string, []byte) {
    t.Helper()
    var body bytes.Buffer
    writer := multipart.NewWriter(&body)
    for key, value := range values {
        if err := writer.WriteField(key, value); err != nil {
            t.Fatal(err)
        }
    }
    for _, file := range files {
        header := textproto.MIMEHeader{}
        header.Set("Content-Disposition", `form-data; name="`+file.field+`"; filename="`+file.name+`"`)
        header.Set("Content-Type", file.mime)
        part, err := writer.CreatePart(header)
        if err != nil {
            t.Fatal(err)
        }
        if _, err := part.Write(file.data); err != nil {
            t.Fatal(err)
        }
    }
    if err := writer.Close(); err != nil {
        t.Fatal(err)
    }
    return writer.FormDataContentType(), body.Bytes()
}

func decodePreparedBody(t *testing.T, body []byte) map[string]any {
    t.Helper()
    var payload map[string]any
    if err := json.Unmarshal(body, &payload); err != nil {
        t.Fatal(err)
    }
    return payload
}
```

- [ ] **步骤 2：写普通参考图与全模型统一转换的失败测试**

继续写入：

```go
func TestPrepareImageEditRequestBuildsGenerationPayloadForEveryModel(t *testing.T) {
    models := []string{
        "google/gemini-3.1-flash-lite-image",
        "openai/gpt-image-1",
    }
    for _, modelName := range models {
        t.Run(modelName, func(t *testing.T) {
            contentType, body := buildImageEditMultipart(t, map[string]string{
                "model": modelName,
                "prompt": "变成动漫风格",
                "n": "1",
                "resolution": "1K",
                "aspect_ratio": "3:4",
                "response_format": "b64_json",
                "output_format": "png",
            }, []testUpload{
                {field: "image", name: "one.png", mime: "image/png", data: []byte("first-image")},
            })

            prepared, err := (&ModelGatewayService{}).PrepareImageEditRequest(contentType, body)
            if err != nil {
                t.Fatal(err)
            }
            if prepared.UpstreamPath != "/images/generations" {
                t.Fatalf("unexpected upstream path: %s", prepared.UpstreamPath)
            }
            if prepared.ContentType != "application/json" {
                t.Fatalf("unexpected content type: %s", prepared.ContentType)
            }
            if prepared.ReferenceCount != 1 {
                t.Fatalf("unexpected reference count: %d", prepared.ReferenceCount)
            }

            payload := decodePreparedBody(t, prepared.Body)
            if payload["model"] != modelName || payload["prompt"] != "变成动漫风格" {
                t.Fatalf("unexpected payload: %#v", payload)
            }
            if payload["n"] != float64(1) || payload["resolution"] != "1K" || payload["aspect_ratio"] != "3:4" {
                t.Fatalf("generation options were not preserved: %#v", payload)
            }
            references, ok := payload["input_references"].([]any)
            if !ok || len(references) != 1 {
                t.Fatalf("unexpected references: %#v", payload["input_references"])
            }
            reference := references[0].(map[string]any)
            imageURL := reference["image_url"].(map[string]any)["url"].(string)
            if reference["type"] != "image_url" || imageURL != "data:image/png;base64,Zmlyc3QtaW1hZ2U=" {
                t.Fatalf("unexpected reference: %#v", reference)
            }
            if prepared.Estimate.Ability != "image_edit" || prepared.Estimate.Model != modelName {
                t.Fatalf("unexpected estimate: %#v", prepared.Estimate)
            }
            if prepared.Estimate.Params["reference_count"] != 1 {
                t.Fatalf("reference count missing from estimate: %#v", prepared.Estimate.Params)
            }
            if _, exists := payload["reference_count"]; exists {
                t.Fatalf("internal billing field leaked upstream: %#v", payload)
            }
        })
    }
}
```

- [ ] **步骤 3：运行测试确认 RED**

运行：

```powershell
Set-Location server
& 'C:\Users\southpark\.cache\codex-runtimes\go1.23.12\go\bin\go.exe' test ./internal/service -run TestPrepareImageEditRequestBuildsGenerationPayloadForEveryModel -count=1
```

预期：编译失败，提示 `PreparedImageEditRequest` 或 `PrepareImageEditRequest` 未定义。

- [ ] **步骤 4：写多图顺序、蒙版和异常输入测试**

继续写入：

```go
func TestPrepareImageEditRequestAppendsMaskLast(t *testing.T) {
    contentType, body := buildImageEditMultipart(t, map[string]string{
        "model": "google/gemini-3.1-flash-image",
        "prompt": "替换背景",
        "n": "2",
    }, []testUpload{
        {field: "image", name: "one.png", mime: "image/png", data: []byte("one")},
        {field: "image", name: "two.jpg", mime: "image/jpeg", data: []byte("two")},
        {field: "mask", name: "mask.png", mime: "image/png", data: []byte("mask")},
    })

    prepared, err := (&ModelGatewayService{}).PrepareImageEditRequest(contentType, body)
    if err != nil {
        t.Fatal(err)
    }
    payload := decodePreparedBody(t, prepared.Body)
    references := payload["input_references"].([]any)
    if len(references) != 3 || prepared.ReferenceCount != 3 {
        t.Fatalf("unexpected references: %#v", references)
    }
    urls := make([]string, 0, len(references))
    for _, item := range references {
        urls = append(urls, item.(map[string]any)["image_url"].(map[string]any)["url"].(string))
    }
    expected := []string{
        "data:image/png;base64,b25l",
        "data:image/jpeg;base64,dHdv",
        "data:image/png;base64,bWFzaw==",
    }
    for index := range expected {
        if urls[index] != expected[index] {
            t.Fatalf("reference order mismatch: %#v", urls)
        }
    }
    prompt := payload["prompt"].(string)
    if prompt != "替换背景\n\n参考图说明：最后一张参考图是蒙版。请仅修改蒙版透明区域，其他区域尽量保持不变。" {
        t.Fatalf("unexpected prompt: %q", prompt)
    }
    if prepared.Estimate.Params["reference_count"] != 3 {
        t.Fatalf("unexpected estimate params: %#v", prepared.Estimate.Params)
    }
}

func TestPrepareImageEditRequestRejectsInvalidMultipart(t *testing.T) {
    tests := []struct {
        name        string
        contentType string
        body        []byte
    }{
        {name: "wrong content type", contentType: "application/json", body: []byte(`{}`)},
        {name: "missing boundary", contentType: "multipart/form-data", body: nil},
    }
    for _, item := range tests {
        t.Run(item.name, func(t *testing.T) {
            if _, err := (&ModelGatewayService{}).PrepareImageEditRequest(item.contentType, item.body); err == nil {
                t.Fatal("expected invalid multipart error")
            }
        })
    }
}

func TestPrepareImageEditRequestRequiresSourceImage(t *testing.T) {
    contentType, body := buildImageEditMultipart(t, map[string]string{
        "model": "google/gemini-3.1-flash-image",
        "prompt": "编辑图片",
    }, []testUpload{
        {field: "mask", name: "mask.png", mime: "image/png", data: []byte("mask")},
    })
    if _, err := (&ModelGatewayService{}).PrepareImageEditRequest(contentType, body); err == nil {
        t.Fatal("expected missing image error")
    }
}
```

- [ ] **步骤 5：实现最小请求准备器**

在 `server/internal/service/model_gateway.go` 的 import 中新增：

```go
"encoding/base64"
"fmt"
"strconv"
```

在 `ModelGatewayTestResult` 后新增：

```go
type PreparedImageEditRequest struct {
    UpstreamPath   string
    ContentType    string
    Body           []byte
    ReferenceCount int
    Estimate       EstimateRequest
}

var imageEditValueFields = []string{
    "model",
    "prompt",
    "response_format",
    "output_format",
    "resolution",
    "aspect_ratio",
    "quality",
    "size",
}

const imageMaskPromptSuffix = "参考图说明：最后一张参考图是蒙版。请仅修改蒙版透明区域，其他区域尽量保持不变。"
```

在 `ExtractEstimateRequest` 前新增完整实现：

```go
func (s *ModelGatewayService) PrepareImageEditRequest(contentType string, body []byte) (PreparedImageEditRequest, error) {
    mediaType, values, err := mime.ParseMediaType(contentType)
    if err != nil || mediaType != "multipart/form-data" || values["boundary"] == "" {
        return PreparedImageEditRequest{}, errors.New("参考图请求格式错误")
    }
    form, err := multipart.NewReader(bytes.NewReader(body), values["boundary"]).ReadForm(64 << 20)
    if err != nil {
        return PreparedImageEditRequest{}, fmt.Errorf("解析参考图请求失败: %w", err)
    }
    defer form.RemoveAll()

    sourceFiles := form.File["image"]
    if len(sourceFiles) == 0 {
        return PreparedImageEditRequest{}, errors.New("至少需要一张参考图")
    }

    payload := map[string]any{}
    estimateParams := map[string]any{}
    for _, key := range imageEditValueFields {
        value := firstMultipartValue(form.Value[key])
        if value == "" {
            continue
        }
        payload[key] = value
        estimateParams[key] = value
    }
    if rawCount := firstMultipartValue(form.Value["n"]); rawCount != "" {
        count, err := strconv.Atoi(rawCount)
        if err != nil || count < 1 {
            return PreparedImageEditRequest{}, errors.New("生成数量格式错误")
        }
        payload["n"] = count
        estimateParams["n"] = float64(count)
    }

    references := make([]map[string]any, 0, len(sourceFiles)+1)
    for _, file := range sourceFiles {
        reference, err := multipartImageReference(file)
        if err != nil {
            return PreparedImageEditRequest{}, err
        }
        references = append(references, reference)
    }
    if masks := form.File["mask"]; len(masks) > 0 {
        reference, err := multipartImageReference(masks[0])
        if err != nil {
            return PreparedImageEditRequest{}, err
        }
        references = append(references, reference)
        prompt, _ := payload["prompt"].(string)
        payload["prompt"] = strings.TrimSpace(prompt) + "\n\n" + imageMaskPromptSuffix
    }
    payload["input_references"] = references
    estimateParams["reference_count"] = len(references)

    encoded, err := json.Marshal(payload)
    if err != nil {
        return PreparedImageEditRequest{}, fmt.Errorf("编码参考图请求失败: %w", err)
    }
    modelName, _ := payload["model"].(string)
    return PreparedImageEditRequest{
        UpstreamPath:   "/images/generations",
        ContentType:    "application/json",
        Body:           encoded,
        ReferenceCount: len(references),
        Estimate: EstimateRequest{
            Ability: "image_edit",
            Model:   modelName,
            Params:  estimateParams,
        },
    }, nil
}

func firstMultipartValue(values []string) string {
    if len(values) == 0 {
        return ""
    }
    return values[0]
}

func multipartImageReference(header *multipart.FileHeader) (map[string]any, error) {
    file, err := header.Open()
    if err != nil {
        return nil, fmt.Errorf("读取参考图失败: %w", err)
    }
    defer file.Close()
    data, err := io.ReadAll(file)
    if err != nil {
        return nil, fmt.Errorf("读取参考图失败: %w", err)
    }
    mimeType := strings.TrimSpace(header.Header.Get("Content-Type"))
    if mimeType == "" || mimeType == "application/octet-stream" {
        mimeType = http.DetectContentType(data)
    }
    if !strings.HasPrefix(mimeType, "image/") {
        return nil, errors.New("参考文件必须是图片")
    }
    return map[string]any{
        "type": "image_url",
        "image_url": map[string]any{
            "url": "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(data),
        },
    }, nil
}
```

- [ ] **步骤 6：运行 Task 1 测试确认 GREEN**

运行：

```powershell
Set-Location server
& 'C:\Users\southpark\.cache\codex-runtimes\go1.23.12\go\bin\go.exe' test ./internal/service -run TestPrepareImageEditRequest -count=1
```

预期：4 个 `TestPrepareImageEditRequest...` 测试全部 PASS，输出无警告。

- [ ] **步骤 7：提交 Task 1**

```powershell
git add server/internal/service/model_gateway.go server/internal/service/model_gateway_test.go
git commit -m "feat: prepare OpenRouter reference image requests"
```

---

### Task 2：接入专用图片编辑代理和 generations 上游路由

**文件：**

- 新增：`server/internal/handler/ai_test.go`
- 修改：`server/internal/handler/ai.go:24-62`
- 修改：`server/internal/router/router.go:111-113`

**接口：**

- 使用：`ModelGatewayService.PrepareImageEditRequest(contentType, body)`
- 使用：`PreparedImageEditRequest`
- 产出：`AIHandler.ProxyImageEdit() gin.HandlerFunc`

- [ ] **步骤 1：写请求头替换失败测试**

创建 `server/internal/handler/ai_test.go`：

```go
package handler

import (
    "net/http"
    "testing"
)

func TestImageEditGatewayHeadersUseJSON(t *testing.T) {
    source := http.Header{
        "Content-Type":   []string{"multipart/form-data; boundary=old"},
        "Content-Length": []string{"123"},
        "X-Request-ID":   []string{"request-1"},
    }
    headers := imageEditGatewayHeaders(source, "application/json")
    if headers.Get("Content-Type") != "application/json" {
        t.Fatalf("unexpected content type: %s", headers.Get("Content-Type"))
    }
    if headers.Get("Content-Length") != "" {
        t.Fatalf("stale content length leaked: %s", headers.Get("Content-Length"))
    }
    if headers.Get("X-Request-ID") != "request-1" {
        t.Fatalf("request header missing: %s", headers.Get("X-Request-ID"))
    }
    if source.Get("Content-Type") == "application/json" {
        t.Fatal("source headers were mutated")
    }
}
```

- [ ] **步骤 2：运行测试确认 RED**

运行：

```powershell
Set-Location server
& 'C:\Users\southpark\.cache\codex-runtimes\go1.23.12\go\bin\go.exe' test ./internal/handler -run TestImageEditGatewayHeadersUseJSON -count=1
```

预期：编译失败，提示 `imageEditGatewayHeaders` 未定义。

- [ ] **步骤 3：提取通用代理结算流程并新增 ProxyImageEdit**

用下面实现替换 `server/internal/handler/ai.go` 中现有 `ProxyPost`：

```go
func (h *AIHandler) ProxyPost(ability string, upstreamPath string) gin.HandlerFunc {
    return func(c *gin.Context) {
        body, err := io.ReadAll(c.Request.Body)
        if err != nil {
            httpx.Fail(c, http.StatusBadRequest, "读取请求失败")
            return
        }
        h.proxyPost(c, upstreamPath, c.Request.Header, body, h.gateway.ExtractEstimateRequest(ability, c.GetHeader("Content-Type"), body))
    }
}

func (h *AIHandler) ProxyImageEdit() gin.HandlerFunc {
    return func(c *gin.Context) {
        body, err := io.ReadAll(c.Request.Body)
        if err != nil {
            httpx.Fail(c, http.StatusBadRequest, "读取请求失败")
            return
        }
        prepared, err := h.gateway.PrepareImageEditRequest(c.GetHeader("Content-Type"), body)
        if err != nil {
            httpx.Fail(c, http.StatusBadRequest, err.Error())
            return
        }
        h.proxyPost(c, prepared.UpstreamPath, imageEditGatewayHeaders(c.Request.Header, prepared.ContentType), prepared.Body, prepared.Estimate)
    }
}

func (h *AIHandler) proxyPost(c *gin.Context, upstreamPath string, headers http.Header, body []byte, estimateReq service.EstimateRequest) {
    user := middleware.CurrentUser(c)
    usage, err := h.billing.Reserve(c.Request.Context(), user.ID, estimateReq)
    if err != nil {
        httpx.Fail(c, http.StatusPaymentRequired, err.Error())
        return
    }
    resp, err := h.gateway.Proxy(c.Request.Context(), http.MethodPost, upstreamPath, headers, body)
    if err != nil {
        _ = h.billing.Fail(c.Request.Context(), usage.ID, err.Error())
        httpx.Fail(c, http.StatusBadGateway, err.Error())
        return
    }
    defer resp.Body.Close()
    if resp.StatusCode >= 400 {
        payload, _ := io.ReadAll(resp.Body)
        _ = h.billing.Fail(c.Request.Context(), usage.ID, string(payload))
        copyResponseHeaders(c, resp.Header)
        c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), payload)
        return
    }
    copyResponseHeaders(c, resp.Header)
    c.Status(resp.StatusCode)
    if _, err := io.Copy(c.Writer, resp.Body); err != nil {
        _ = h.billing.Fail(c.Request.Context(), usage.ID, err.Error())
        return
    }
    _ = h.billing.Settle(c.Request.Context(), usage.ID, usage.EstimateCredits)
}

func imageEditGatewayHeaders(source http.Header, contentType string) http.Header {
    headers := source.Clone()
    headers.Del("Content-Length")
    headers.Set("Content-Type", contentType)
    return headers
}
```

该提取不得改变普通 generations、responses 和 audio/speech 的原行为；它们仍调用 `ProxyPost`。

- [ ] **步骤 4：切换路由到专用 handler**

把 `server/internal/router/router.go` 中：

```go
protected.POST("/ai/images/edits", aiHandler.ProxyPost("image_edit", "/images/edits"))
```

替换为：

```go
protected.POST("/ai/images/edits", aiHandler.ProxyImageEdit())
```

不要增加第二条 edits 路由，不保留模型分支。

- [ ] **步骤 5：运行 handler 和 service 测试确认 GREEN**

运行：

```powershell
Set-Location server
& 'C:\Users\southpark\.cache\codex-runtimes\go1.23.12\go\bin\go.exe' test ./internal/handler ./internal/service -count=1
```

预期：全部 PASS；`TestImageEditGatewayHeadersUseJSON` 确认旧 multipart 请求头不会泄漏。

- [ ] **步骤 6：运行现有后端定向回归**

运行：

```powershell
Set-Location server
& 'C:\Users\southpark\.cache\codex-runtimes\go1.23.12\go\bin\go.exe' test ./internal/httpx ./internal/handler ./internal/service -count=1
```

预期：全部 PASS，能力解析、HTTP 错误和网关转换测试无回归。

- [ ] **步骤 7：提交 Task 2**

```powershell
git add server/internal/handler/ai.go server/internal/handler/ai_test.go server/internal/router/router.go
git commit -m "fix: proxy reference images through generations"
```

---

### Task 3：更新待测文档、重建后端并验证路由

**文件：**

- 修改：`docs/content/docs/progress/pending-test.mdx`
- 只检查：`docs/content/docs/progress/todo.mdx`

**接口：**

- 使用：完成后的 `/api/server/ai/images/edits` 专用入口。
- 产出：用户可执行的工作台／画布待测记录，以及不产生费用的部署验证证据。

- [ ] **步骤 1：更新 pending-test**

在 `docs/content/docs/progress/pending-test.mdx` 的唯一事项列表末尾新增：

```md
- OpenRouter 参考图统一转发：生图工作台和画布的参考图／蒙版请求仍调用本项目 `/api/server/ai/images/edits`，后端会把 multipart 图片转换为 `input_references` JSON 并经 NewAPI `/images/generations` 发送；需测试工作台单图、画布单图／多图／重试和近似蒙版编辑，确认普通无参考图生图不受影响。
```

检查 `docs/content/docs/progress/todo.mdx`；若没有相同事项则保持不变。

- [ ] **步骤 2：运行全部定向测试**

运行：

```powershell
Set-Location server
& 'C:\Users\southpark\.cache\codex-runtimes\go1.23.12\go\bin\go.exe' test ./internal/httpx ./internal/handler ./internal/service -count=1
Set-Location ..\web
& 'C:\Users\southpark\.bun\bin\bun.exe' test tests/image-model-capability.test.ts tests/image-workbench-capability.test.ts tests/image-generation-options.test.ts
```

预期：Go 三个目标包全部 PASS；Bun 26/26 PASS。虽然前端未修改，仍运行现有参考图能力测试证明契约未被破坏。不运行 Next build。

- [ ] **步骤 3：检查最终差异**

运行：

```powershell
git status --short
git diff --check
git diff --stat
```

预期：只有本计划列出的后端、测试和 pending-test 文件发生变化；无空白错误。

- [ ] **步骤 4：提交文档**

```powershell
git add docs/content/docs/progress/pending-test.mdx
git commit -m "docs: note OpenRouter reference image proxy"
```

- [ ] **步骤 5：重建 Docker Compose Local 的 server**

运行：

```powershell
Set-Location ..
docker compose -f docker-compose.local.yml up -d --build server
docker compose -f docker-compose.local.yml ps server
docker compose -f docker-compose.local.yml logs --tail=80 server
```

预期：`infinite-canvas-server-1` 使用新镜像重新创建并处于 `Up`；日志包含：

```text
POST /api/server/ai/images/edits
```

的 Gin 路由注册信息，且没有启动失败。PostgreSQL 卷不得删除或重建。

- [ ] **步骤 6：执行无费用 HTTP 检查**

运行：

```powershell
curl.exe -sS -o NUL -w "%{http_code}" http://localhost:3005/api/server/health
curl.exe -sS -o NUL -w "%{http_code}" -X POST http://localhost:3005/api/server/ai/images/edits
```

预期：health 返回 200；未登录的 edits 返回 401，证明受保护路由存在。不发送图片和登录凭据，不触发上游或计费。

- [ ] **步骤 7：人工验收交接**

让用户在已登录的 `http://localhost:3006/image` 依次验证：

1. 普通无参考图生图仍成功。
2. 工作台单张参考图成功，浏览器外部 URL 仍为 `/api/server/ai/images/edits`。
3. 服务日志显示该请求最终转发 `/images/generations`，不再收到上游 `/images/edits` 404。
4. 画布单图、多图、重试参考图成功。
5. 画布蒙版编辑可以生成结果；接受它是参考图近似而非精确 mask。
6. 失败请求不扣除最终额度。

自动化流程不点击生成按钮，不产生真实模型费用。

---

## 最终审查清单

- [ ] `PrepareImageEditRequest` 对所有模型统一转换，没有模型厂商条件分支。
- [ ] 普通 `image` 顺序不变，`mask` 永远追加在最后。
- [ ] 上游 JSON 使用 `input_references` 的 `image_url.url` data URL 结构。
- [ ] `reference_count` 只进入估算参数，不泄漏到上游 JSON。
- [ ] 转换错误发生在 `Reserve` 之前。
- [ ] 上游路径是 `/images/generations`，外部前端路径仍是 `/api/server/ai/images/edits`。
- [ ] 旧 multipart Content-Type 和 Content-Length 不转发。
- [ ] 普通 `ProxyPost` 调用方行为不变。
- [ ] 工作台和画布前端调用点未被重复修改。
- [ ] pending-test 已更新，todo 无重复事项。
- [ ] 未自动发起真实生图。
