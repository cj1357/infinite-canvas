package handler

import (
	"net/http"
	"strings"

	"infinite-canvas/server/internal/httpx"
	"infinite-canvas/server/internal/service"

	"github.com/gin-gonic/gin"
)

type ModelCapabilityHandler struct {
	capabilities *service.ModelCapabilityService
}

func NewModelCapabilityHandler(capabilities *service.ModelCapabilityService) *ModelCapabilityHandler {
	return &ModelCapabilityHandler{capabilities: capabilities}
}

func (h *ModelCapabilityHandler) Resolve(c *gin.Context) {
	modelName := strings.TrimSpace(c.Query("model"))
	if modelName == "" {
		httpx.Fail(c, http.StatusBadRequest, "model 不能为空")
		return
	}
	result, err := h.capabilities.Resolve(c.Request.Context(), modelName)
	writeResult(c, result, err)
}
