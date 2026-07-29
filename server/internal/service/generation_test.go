package service

import (
	"encoding/json"
	"testing"

	"infinite-canvas/server/internal/model"
)

func TestGenerationRequestPayloadStripsInternalAsyncFieldsAndAddsProvider(t *testing.T) {
	params := mustJSON(map[string]any{
		"n":                       2,
		"resolution":              "1K",
		"aspect_ratio":            "3:4",
		"referenceMediaObjectIds": []string{"media-1"},
		"maskMediaObjectId":       "mask-1",
		"reference_count":         2,
	})
	payload := generationRequestPayload(model.GenerationRun{
		Model:          "google/gemini-3.1-flash-image",
		CompiledPrompt: "生成商品图",
		ParamsJSON:     params,
	})

	if payload["prompt"] != "生成商品图" || payload["model"] != "google/gemini-3.1-flash-image" {
		t.Fatalf("unexpected prompt or model: %#v", payload)
	}
	if payload["n"] != float64(2) || payload["resolution"] != "1K" || payload["aspect_ratio"] != "3:4" {
		t.Fatalf("generation params were not preserved: %#v", payload)
	}
	for _, key := range []string{"referenceMediaObjectIds", "maskMediaObjectId", "reference_count"} {
		if _, ok := payload[key]; ok {
			t.Fatalf("internal field %s leaked upstream: %#v", key, payload)
		}
	}
	provider, ok := payload["provider"].(map[string]any)
	if !ok || len(provider["only"].([]string)) != 1 || provider["only"].([]string)[0] != "google-vertex" {
		encoded, _ := json.Marshal(payload["provider"])
		t.Fatalf("google vertex provider missing: %s", encoded)
	}
}

func TestGenerationRequestPayloadsSplitReferenceBatchIntoSingleRequests(t *testing.T) {
	payload := map[string]any{
		"model":            "google/gemini-3.1-flash-image",
		"prompt":           "生成商品图",
		"n":                float64(3),
		"input_references": []map[string]any{{"type": "image_url"}},
	}
	requests := generationRequestPayloads(payload)

	if len(requests) != 3 {
		t.Fatalf("expected 3 single-image requests, got %d", len(requests))
	}
	if payload["n"] != float64(3) {
		t.Fatalf("original payload should not be mutated: %#v", payload)
	}
	for index, request := range requests {
		if request["n"] != 1 {
			t.Fatalf("request %d should be clamped to one image: %#v", index+1, request)
		}
		if request["input_references"] == nil {
			t.Fatalf("request %d lost references: %#v", index+1, request)
		}
	}
}

func TestGenerationRequestPayloadsKeepPlainBatchTogether(t *testing.T) {
	payload := map[string]any{
		"model":  "google/gemini-3.1-flash-image",
		"prompt": "生成商品图",
		"n":      float64(3),
	}
	requests := generationRequestPayloads(payload)

	if len(requests) != 1 || requests[0]["n"] != float64(3) {
		t.Fatalf("plain image generation batch should stay unchanged: %#v", requests)
	}
}

func TestGenerationReferenceCountIncludesAsyncMediaAndMask(t *testing.T) {
	params := map[string]any{
		"referenceMediaObjectIds": []any{"media-1", "media-2"},
		"maskMediaObjectId":       "mask-1",
	}
	if got := generationReferenceCount(params, []string{"compiled-1"}); got != 4 {
		t.Fatalf("unexpected reference count: %d", got)
	}
	params["reference_count"] = 8
	if got := generationReferenceCount(params, nil); got != 8 {
		t.Fatalf("explicit reference count should win when larger, got %d", got)
	}
}

func TestRedactGenerationResponsePayloadRemovesStoredBase64(t *testing.T) {
	payload := redactGenerationResponsePayload([]byte(`{"data":[{"b64_json":"abcdef","url":"https://example.com/a.png"}]}`))
	decoded := decodePreparedBody(t, payload)
	items := decoded["data"].([]any)
	image := items[0].(map[string]any)
	if image["b64_json"] != "[base64:6 chars]" || image["url"] != "https://example.com/a.png" {
		t.Fatalf("unexpected redacted response: %#v", image)
	}
}
