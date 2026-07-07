package handler

import (
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
