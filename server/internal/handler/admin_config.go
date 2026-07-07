package handler

import (
	"infinite-canvas/server/internal/httpx"
	"infinite-canvas/server/internal/service"

	"github.com/gin-gonic/gin"
)

func (h *AdminHandler) GetModelGateway(c *gin.Context) {
	result, err := h.admin.ModelGatewaySettings()
	writeResult(c, result, err)
}

func (h *AdminHandler) SaveModelGateway(c *gin.Context) {
	var req service.ModelGatewayConfigInput
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.admin.SaveModelGatewaySettings(req)
	if err != nil {
		httpx.Error(c, err)
		return
	}
	httpx.OK(c, result)
}

func (h *AdminHandler) TestModelGateway(c *gin.Context) {
	result, err := h.admin.TestModelGatewaySettings(c.Request.Context())
	writeResult(c, result, err)
}
