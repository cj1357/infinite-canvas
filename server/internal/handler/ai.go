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
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			httpx.Fail(c, http.StatusBadRequest, "读取请求失败")
			return
		}
		h.proxyPost(c, upstreamPath, c.Request.Header, body, h.gateway.ExtractEstimateRequest(ability, c.GetHeader("Content-Type"), body))
	}
}

func (h *AIHandler) ProxyImageGeneration() gin.HandlerFunc {
	return func(c *gin.Context) {
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			httpx.Fail(c, http.StatusBadRequest, "读取请求失败")
			return
		}
		prepared, err := h.gateway.PrepareImageGenerationRequest(body)
		if err != nil {
			httpx.Fail(c, http.StatusBadRequest, err.Error())
			return
		}
		h.proxyPost(c, "/images/generations", c.Request.Header, prepared, h.gateway.ExtractEstimateRequest("image_generation", c.GetHeader("Content-Type"), prepared))
	}
}

func (h *AIHandler) ProxyImageEdit() gin.HandlerFunc {
	return func(c *gin.Context) {
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			httpx.Fail(c, http.StatusBadRequest, "读取请求失败")
			return
		}
		prepared, err := h.gateway.PrepareImageEditRequest(c.GetHeader("Content-Type"), body)
		if err != nil {
			httpx.Fail(c, http.StatusBadRequest, err.Error())
			return
		}
		h.proxyPost(c, prepared.UpstreamPath, imageEditGatewayHeaders(c.Request.Header, prepared.ContentType), prepared.Body, prepared.Estimate)
	}
}

func (h *AIHandler) proxyPost(c *gin.Context, upstreamPath string, headers http.Header, body []byte, estimateReq service.EstimateRequest) {
	user := middleware.CurrentUser(c)
	usage, err := h.billing.Reserve(c.Request.Context(), user.ID, estimateReq)
	if err != nil {
		httpx.Fail(c, http.StatusPaymentRequired, err.Error())
		return
	}
	resp, err := h.gateway.Proxy(c.Request.Context(), http.MethodPost, upstreamPath, headers, body)
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

func imageEditGatewayHeaders(source http.Header, contentType string) http.Header {
	headers := make(http.Header, len(source))
	for key, values := range source {
		for _, value := range values {
			headers.Add(key, value)
		}
	}
	headers.Del("Content-Length")
	headers.Set("Content-Type", contentType)
	return headers
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
