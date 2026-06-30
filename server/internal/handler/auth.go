package handler

import (
	"net/http"
	"time"

	"infinite-canvas/server/internal/config"
	"infinite-canvas/server/internal/httpx"
	"infinite-canvas/server/internal/middleware"
	"infinite-canvas/server/internal/service"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	auth *service.AuthService
	cfg  config.Config
}

func NewAuthHandler(auth *service.AuthService, cfg config.Config) *AuthHandler {
	return &AuthHandler{auth: auth, cfg: cfg}
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req service.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "请求参数错误")
		return
	}
	result, err := h.auth.Register(c.Request.Context(), req)
	if err != nil {
		httpx.Error(c, err)
		return
	}
	h.setCookie(c, result.Token)
	httpx.OK(c, gin.H{"user": result.User})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req service.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "请求参数错误")
		return
	}
	result, err := h.auth.Login(c.Request.Context(), req)
	if err != nil {
		httpx.Error(c, err)
		return
	}
	h.setCookie(c, result.Token)
	httpx.OK(c, gin.H{"user": result.User})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	token, _ := c.Cookie(h.cfg.CookieName)
	_ = h.auth.Logout(token)
	h.clearCookie(c)
	httpx.OK(c, nil)
}

func (h *AuthHandler) Me(c *gin.Context) {
	httpx.OK(c, gin.H{"user": middleware.CurrentUser(c)})
}

func (h *AuthHandler) setCookie(c *gin.Context, token string) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     h.cfg.CookieName,
		Value:    token,
		Path:     "/",
		Domain:   h.cfg.CookieDomain,
		MaxAge:   int(h.cfg.SessionTTL.Seconds()),
		Expires:  time.Now().Add(h.cfg.SessionTTL),
		HttpOnly: true,
		Secure:   h.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *AuthHandler) clearCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     h.cfg.CookieName,
		Value:    "",
		Path:     "/",
		Domain:   h.cfg.CookieDomain,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}
