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

func TestPrepareImageEditRequestBuildsGenerationPayloadForEveryModel(t *testing.T) {
	models := []string{
		"google/gemini-3.1-flash-lite-image",
		"openai/gpt-image-1",
	}
	for _, modelName := range models {
		t.Run(modelName, func(t *testing.T) {
			contentType, body := buildImageEditMultipart(t, map[string]string{
				"model":           modelName,
				"prompt":          "变成动漫风格",
				"n":               "1",
				"resolution":      "1K",
				"aspect_ratio":    "3:4",
				"response_format": "b64_json",
				"output_format":   "png",
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

func TestPrepareImageEditRequestAppendsMaskLast(t *testing.T) {
	contentType, body := buildImageEditMultipart(t, map[string]string{
		"model":  "google/gemini-3.1-flash-image",
		"prompt": "替换背景",
		"n":      "2",
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
		"model":  "google/gemini-3.1-flash-image",
		"prompt": "编辑图片",
	}, []testUpload{
		{field: "mask", name: "mask.png", mime: "image/png", data: []byte("mask")},
	})
	if _, err := (&ModelGatewayService{}).PrepareImageEditRequest(contentType, body); err == nil {
		t.Fatal("expected missing image error")
	}
}
