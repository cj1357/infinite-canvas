package handler

import (
	"infinite-canvas/server/internal/httpx"
	"infinite-canvas/server/internal/service"

	"github.com/gin-gonic/gin"
)

type AdminHandler struct {
	admin *service.AdminService
}

func NewAdminHandler(admin *service.AdminService) *AdminHandler {
	return &AdminHandler{admin: admin}
}

func (h *AdminHandler) ListUsers(c *gin.Context) {
	result, err := h.admin.ListUsers(readQuery(c))
	writeResult(c, result, err)
}

func (h *AdminHandler) GetNewAPIConfig(c *gin.Context) {
	result, err := h.admin.NewAPISettings()
	writeResult(c, result, err)
}

func (h *AdminHandler) SaveNewAPIConfig(c *gin.Context) {
	var req service.NewAPIConfigInput
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.admin.SaveNewAPISettings(req)
	if err != nil {
		httpx.Error(c, err)
		return
	}
	httpx.OK(c, result)
}
