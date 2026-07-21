package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"infinite-canvas/server/internal/model"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type stubCapabilityRepository struct {
	item model.ModelCapability
	err  error
}

func (s stubCapabilityRepository) FindModelCapability(string, string) (model.ModelCapability, error) {
	return s.item, s.err
}

func TestModelCapabilitySelectsGoogleVertexAndCaches(t *testing.T) {
	var requests int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&requests, 1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
            "id":"google/gemini-3-pro-image",
            "endpoints":[
                {
                    "provider_slug":"google-ai-studio/global",
                    "provider_tag":"google-ai-studio/global",
                    "supported_parameters":{
                        "resolution":{"type":"enum","values":["1K","2K","4K"]}
                    }
                },
                {
                    "provider_slug":"google-vertex/global",
                    "provider_tag":"google-vertex/global",
                    "supported_parameters":{
                        "resolution":{"type":"enum","values":["1K","2K"]},
                        "aspect_ratio":{"type":"enum","values":["1:1","16:9"]},
                        "n":{"type":"range","min":1,"max":1},
                        "input_references":{"type":"range","min":0,"max":14}
                    }
                }
            ]
        }`))
	}))
	defer upstream.Close()

	resolver := newModelCapabilityService(
		stubCapabilityRepository{err: gorm.ErrRecordNotFound},
		upstream.Client(),
		upstream.URL,
		time.Now,
	)

	first, err := resolver.Resolve(context.Background(), "default::google/gemini-3-pro-image")
	if err != nil {
		t.Fatalf("resolve capability: %v", err)
	}
	second, err := resolver.Resolve(context.Background(), "google/gemini-3-pro-image")
	if err != nil {
		t.Fatalf("resolve cached capability: %v", err)
	}

	if first.Provider != "google-vertex/global" {
		t.Fatalf("expected Google Vertex, got %q", first.Provider)
	}
	if len(first.SupportedResolutions) != 2 || first.SupportedResolutions[1] != "2K" {
		t.Fatalf("expected Vertex resolutions without 4K, got %#v", first.SupportedResolutions)
	}
	if !first.SupportsReferences || first.MaxReferences != 14 || first.MaxOutputsPerRequest != 1 {
		t.Fatalf("unexpected range capabilities: %#v", first)
	}
	if second.Source != "cache" {
		t.Fatalf("expected cache source, got %q", second.Source)
	}
	if atomic.LoadInt32(&requests) != 1 {
		t.Fatalf("expected one upstream request, got %d", requests)
	}
}

func TestModelCapabilityFallsBackToExactDatabaseModel(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "unavailable", http.StatusBadGateway)
	}))
	defer upstream.Close()

	resolver := newModelCapabilityService(
		stubCapabilityRepository{item: model.ModelCapability{
			Model:                    "google/gemini-3.1-flash-lite-image",
			Ability:                  "image",
			MaxReferences:            14,
			MaxOutputs:               1,
			SupportedRatiosJSON:      datatypes.JSON([]byte(`["1:1","16:9"]`)),
			SupportedResolutionsJSON: datatypes.JSON([]byte(`["1K"]`)),
			Enabled:                  true,
		}},
		upstream.Client(),
		upstream.URL,
		time.Now,
	)

	got, err := resolver.Resolve(context.Background(), "google/gemini-3.1-flash-lite-image")
	if err != nil {
		t.Fatalf("resolve fallback: %v", err)
	}
	if got.Source != "database" || got.Provider != "google-vertex" {
		t.Fatalf("unexpected fallback source: %#v", got)
	}
	if len(got.SupportedResolutions) != 1 || got.SupportedResolutions[0] != "1K" {
		t.Fatalf("unexpected fallback resolutions: %#v", got.SupportedResolutions)
	}
}
