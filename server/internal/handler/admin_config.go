package handler

import (
	"net/http"

	"infinite-canvas/server/internal/httpx"
	"infinite-canvas/server/internal/model"
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

func (h *AdminHandler) ListModelCapabilities(c *gin.Context) {
	result, err := h.admin.ListModelCapabilities(readQuery(c))
	writeResult(c, result, err)
}

func (h *AdminHandler) CreateModelCapability(c *gin.Context) {
	var req model.ModelCapability
	if !bindJSON(c, &req) {
		return
	}
	if req.Model == "" || req.Ability == "" {
		httpx.Fail(c, http.StatusBadRequest, "model 和 ability 不能为空")
		return
	}
	if err := h.admin.SaveModelCapability(&req); err != nil {
		httpx.Error(c, err)
		return
	}
	httpx.OK(c, req)
}

func (h *AdminHandler) UpdateModelCapability(c *gin.Context) {
	var req model.ModelCapability
	if !bindJSON(c, &req) {
		return
	}
	req.ID = c.Param("id")
	if err := h.admin.SaveModelCapability(&req); err != nil {
		httpx.Error(c, err)
		return
	}
	httpx.OK(c, req)
}

func (h *AdminHandler) ListPromptTemplates(c *gin.Context) {
	result, err := h.admin.ListPromptTemplates(readQuery(c))
	writeResult(c, result, err)
}

func (h *AdminHandler) CreatePromptTemplate(c *gin.Context) {
	var req model.PromptTemplate
	if !bindJSON(c, &req) {
		return
	}
	if req.Locale == "" || req.TemplateKey == "" || req.Ability == "" || req.Content == "" {
		httpx.Fail(c, http.StatusBadRequest, "locale、templateKey、ability 和 content 不能为空")
		return
	}
	if err := h.admin.SavePromptTemplate(&req); err != nil {
		httpx.Error(c, err)
		return
	}
	httpx.OK(c, req)
}

func (h *AdminHandler) UpdatePromptTemplate(c *gin.Context) {
	var req model.PromptTemplate
	if !bindJSON(c, &req) {
		return
	}
	req.ID = c.Param("id")
	if err := h.admin.SavePromptTemplate(&req); err != nil {
		httpx.Error(c, err)
		return
	}
	httpx.OK(c, req)
}

func (h *AdminHandler) PreviewPromptTemplate(c *gin.Context) {
	var req service.PromptTemplatePreviewInput
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.admin.PreviewPromptTemplate(req)
	writeResult(c, result, err)
}
