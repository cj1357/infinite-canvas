package handler

import (
	"net/http"

	"infinite-canvas/server/internal/httpx"
	"infinite-canvas/server/internal/middleware"
	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/service"

	"github.com/gin-gonic/gin"
)

type BillingHandler struct {
	billing *service.BillingService
}

func NewBillingHandler(billing *service.BillingService) *BillingHandler {
	return &BillingHandler{billing: billing}
}

func (h *BillingHandler) Me(c *gin.Context) {
	result, err := h.billing.Summary(middleware.CurrentUser(c).ID)
	writeResult(c, result, err)
}

func (h *BillingHandler) Estimate(c *gin.Context) {
	var req service.EstimateRequest
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.billing.Estimate(req)
	writeResult(c, result, err)
}

func (h *BillingHandler) ListUsage(c *gin.Context) {
	current := middleware.CurrentUser(c)
	userID := current.ID
	if current.Role == model.UserRoleAdmin && c.Query("userId") != "" {
		userID = c.Query("userId")
	}
	result, err := h.billing.ListUsage(userID, readQuery(c))
	writeResult(c, result, err)
}

func (h *BillingHandler) ListLedger(c *gin.Context) {
	current := middleware.CurrentUser(c)
	userID := current.ID
	if current.Role == model.UserRoleAdmin && c.Query("userId") != "" {
		userID = c.Query("userId")
	}
	result, err := h.billing.ListLedger(userID, readQuery(c))
	writeResult(c, result, err)
}

func (h *BillingHandler) GrantEntitlement(c *gin.Context) {
	var req service.GrantEntitlementRequest
	if !bindJSON(c, &req) {
		return
	}
	operator := middleware.CurrentUser(c)
	result, err := h.billing.GrantEntitlement(c.Request.Context(), operator.ID, c.Param("id"), req)
	writeResult(c, result, err)
}

func (h *BillingHandler) AdjustCredits(c *gin.Context) {
	var req service.AdjustCreditsRequest
	if !bindJSON(c, &req) {
		return
	}
	operator := middleware.CurrentUser(c)
	result, err := h.billing.AdjustCredits(c.Request.Context(), operator.ID, c.Param("id"), req)
	writeResult(c, result, err)
}

func (h *BillingHandler) ResetPeriod(c *gin.Context) {
	operator := middleware.CurrentUser(c)
	result, err := h.billing.ResetPeriod(c.Request.Context(), operator.ID, c.Param("id"))
	writeResult(c, result, err)
}

func (h *BillingHandler) ResetFiveHourWindow(c *gin.Context) {
	operator := middleware.CurrentUser(c)
	result, err := h.billing.ResetFiveHourWindow(c.Request.Context(), operator.ID, c.Param("id"))
	writeResult(c, result, err)
}

func (h *BillingHandler) ListRateRules(c *gin.Context) {
	result, err := h.billing.ListRateRules(readQuery(c))
	writeResult(c, result, err)
}

func (h *BillingHandler) CreateRateRule(c *gin.Context) {
	var req model.ModelRateRule
	if !bindJSON(c, &req) {
		return
	}
	if req.Ability == "" {
		httpx.Fail(c, http.StatusBadRequest, "ability 不能为空")
		return
	}
	if err := h.billing.SaveRateRule(&req); err != nil {
		httpx.Error(c, err)
		return
	}
	httpx.OK(c, req)
}

func (h *BillingHandler) UpdateRateRule(c *gin.Context) {
	var req model.ModelRateRule
	if !bindJSON(c, &req) {
		return
	}
	req.ID = c.Param("id")
	if err := h.billing.SaveRateRule(&req); err != nil {
		httpx.Error(c, err)
		return
	}
	httpx.OK(c, req)
}
