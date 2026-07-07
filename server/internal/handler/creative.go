package handler

import (
	"infinite-canvas/server/internal/httpx"
	"infinite-canvas/server/internal/middleware"
	"infinite-canvas/server/internal/service"

	"github.com/gin-gonic/gin"
)

type CreativeHandler struct {
	references *service.ReferenceService
}

func NewCreativeHandler(references *service.ReferenceService) *CreativeHandler {
	return &CreativeHandler{references: references}
}

func (h *CreativeHandler) ListReferenceSets(c *gin.Context) {
	result, err := h.references.ListReferenceSets(middleware.CurrentUser(c).ID, readQuery(c))
	writeResult(c, result, err)
}

func (h *CreativeHandler) CreateReferenceSet(c *gin.Context) {
	var req service.ReferenceSetInput
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.references.CreateReferenceSet(middleware.CurrentUser(c).ID, req)
	writeResult(c, result, err)
}

func (h *CreativeHandler) GetReferenceSet(c *gin.Context) {
	result, err := h.references.GetReferenceSet(middleware.CurrentUser(c).ID, c.Param("id"))
	writeResult(c, result, err)
}

func (h *CreativeHandler) UpdateReferenceSet(c *gin.Context) {
	var req service.ReferenceSetInput
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.references.UpdateReferenceSet(middleware.CurrentUser(c).ID, c.Param("id"), req)
	writeResult(c, result, err)
}

func (h *CreativeHandler) CreateReferenceIntent(c *gin.Context) {
	var req service.ReferenceIntentInput
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.references.CreateReferenceIntent(middleware.CurrentUser(c).ID, c.Param("id"), req)
	writeResult(c, result, err)
}

func (h *CreativeHandler) UpdateReferenceIntent(c *gin.Context) {
	var req service.ReferenceIntentInput
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.references.UpdateReferenceIntent(middleware.CurrentUser(c).ID, c.Param("id"), req)
	writeResult(c, result, err)
}

func (h *CreativeHandler) CompileReferenceSetPreview(c *gin.Context) {
	var req service.CompileReferenceSetPreviewInput
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.references.CompileReferenceSetPreview(middleware.CurrentUser(c).ID, c.Param("id"), req)
	if err != nil {
		httpx.Error(c, err)
		return
	}
	httpx.OK(c, result)
}
