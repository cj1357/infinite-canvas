package handler

import (
	"infinite-canvas/server/internal/middleware"
	"infinite-canvas/server/internal/service"

	"github.com/gin-gonic/gin"
)

type AgentHandler struct {
	agent *service.CreativeAgentService
}

func NewAgentHandler(agent *service.CreativeAgentService) *AgentHandler {
	return &AgentHandler{agent: agent}
}

func (h *AgentHandler) CreateSession(c *gin.Context) {
	var req service.AgentSessionInput
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.agent.CreateSession(middleware.CurrentUser(c).ID, req)
	writeResult(c, result, err)
}

func (h *AgentHandler) SendMessage(c *gin.Context) {
	var req service.AgentMessageInput
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.agent.SendMessage(middleware.CurrentUser(c).ID, c.Param("id"), req)
	writeResult(c, result, err)
}

func (h *AgentHandler) ApplyToolCall(c *gin.Context) {
	var req service.AgentApplyInput
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.agent.ApplyToolCall(middleware.CurrentUser(c).ID, c.Param("id"), req)
	writeResult(c, result, err)
}
