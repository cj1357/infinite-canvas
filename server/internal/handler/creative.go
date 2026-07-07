package handler

import (
	"infinite-canvas/server/internal/httpx"
	"infinite-canvas/server/internal/middleware"
	"infinite-canvas/server/internal/service"

	"github.com/gin-gonic/gin"
)

type CreativeHandler struct {
	references *service.ReferenceService
	generation *service.GenerationService
}

func NewCreativeHandler(references *service.ReferenceService, generation *service.GenerationService) *CreativeHandler {
	return &CreativeHandler{references: references, generation: generation}
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

func (h *CreativeHandler) CreateGenerationRun(c *gin.Context) {
	var req service.GenerationRunInput
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.generation.CreateGenerationRun(c.Request.Context(), middleware.CurrentUser(c).ID, req)
	writeResult(c, result, err)
}

func (h *CreativeHandler) GetGenerationRun(c *gin.Context) {
	result, err := h.generation.GetGenerationRun(middleware.CurrentUser(c).ID, c.Param("id"))
	writeResult(c, result, err)
}

func (h *CreativeHandler) GetGenerationJob(c *gin.Context) {
	result, err := h.generation.GetGenerationJob(middleware.CurrentUser(c).ID, c.Param("id"))
	writeResult(c, result, err)
}

func (h *CreativeHandler) RetryGenerationRun(c *gin.Context) {
	result, err := h.generation.RetryGenerationRun(c.Request.Context(), middleware.CurrentUser(c).ID, c.Param("id"))
	writeResult(c, result, err)
}

func (h *CreativeHandler) CancelGenerationRun(c *gin.Context) {
	result, err := h.generation.CancelGenerationRun(c.Request.Context(), middleware.CurrentUser(c).ID, c.Param("id"))
	writeResult(c, result, err)
}
