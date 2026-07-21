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
