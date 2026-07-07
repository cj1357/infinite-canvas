package handler

import (
	"io"
	"net/http"
	"strings"

	"infinite-canvas/server/internal/httpx"
	"infinite-canvas/server/internal/middleware"
	"infinite-canvas/server/internal/service"

	"github.com/gin-gonic/gin"
)

type AIHandler struct {
	billing *service.BillingService
	gateway *service.ModelGatewayService
}

func NewAIHandler(billing *service.BillingService, gateway *service.ModelGatewayService) *AIHandler {
	return &AIHandler{billing: billing, gateway: gateway}
}

func (h *AIHandler) ProxyPost(ability string, upstreamPath string) gin.HandlerFunc {
	return func(c *gin.Context) {
		user := middleware.CurrentUser(c)
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			httpx.Fail(c, http.StatusBadRequest, "读取请求失败")
			return
		}
		estimateReq := h.gateway.ExtractEstimateRequest(ability, c.GetHeader("Content-Type"), body)
		usage, err := h.billing.Reserve(c.Request.Context(), user.ID, estimateReq)
		if err != nil {
			httpx.Fail(c, http.StatusPaymentRequired, err.Error())
			return
		}
		resp, err := h.gateway.Proxy(c.Request.Context(), http.MethodPost, upstreamPath, c.Request.Header, body)
		if err != nil {
			_ = h.billing.Fail(c.Request.Context(), usage.ID, err.Error())
			httpx.Fail(c, http.StatusBadGateway, err.Error())
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 400 {
			payload, _ := io.ReadAll(resp.Body)
			_ = h.billing.Fail(c.Request.Context(), usage.ID, string(payload))
			copyResponseHeaders(c, resp.Header)
			c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), payload)
			return
		}
		copyResponseHeaders(c, resp.Header)
		c.Status(resp.StatusCode)
		if _, err := io.Copy(c.Writer, resp.Body); err != nil {
			_ = h.billing.Fail(c.Request.Context(), usage.ID, err.Error())
			return
		}
		_ = h.billing.Settle(c.Request.Context(), usage.ID, usage.EstimateCredits)
	}
}

func (h *AIHandler) ProxyGet(upstreamPathPrefix string) gin.HandlerFunc {
	return h.ProxyGetWithSuffix(upstreamPathPrefix, "")
}

func (h *AIHandler) ProxyGetWithSuffix(upstreamPathPrefix string, suffix string) gin.HandlerFunc {
	return func(c *gin.Context) {
		path := strings.TrimRight(upstreamPathPrefix, "/") + "/" + c.Param("id") + suffix
		resp, err := h.gateway.Proxy(c.Request.Context(), http.MethodGet, path, c.Request.Header, nil)
		if err != nil {
			httpx.Fail(c, http.StatusBadGateway, err.Error())
			return
		}
		defer resp.Body.Close()
		copyResponseHeaders(c, resp.Header)
		c.Status(resp.StatusCode)
		_, _ = io.Copy(c.Writer, resp.Body)
	}
}

func copyResponseHeaders(c *gin.Context, headers http.Header) {
	for key, values := range headers {
		lower := strings.ToLower(key)
		if lower == "content-length" || lower == "connection" || lower == "transfer-encoding" {
			continue
		}
		for _, value := range values {
			c.Header(key, value)
		}
	}
}
