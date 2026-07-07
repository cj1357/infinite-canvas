package httpx

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestFailKeyWritesStableErrorKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/fail", func(c *gin.Context) {
		FailKey(c, http.StatusPaymentRequired, "quota.insufficient", "额度不足")
	})

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/fail", nil)
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusPaymentRequired {
		t.Fatalf("expected status %d, got %d", http.StatusPaymentRequired, recorder.Code)
	}

	var payload Response
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.ErrorKey != "quota.insufficient" {
		t.Fatalf("expected errorKey quota.insufficient, got %q", payload.ErrorKey)
	}
	if payload.Msg != "额度不足" {
		t.Fatalf("expected message preserved, got %q", payload.Msg)
	}
}
