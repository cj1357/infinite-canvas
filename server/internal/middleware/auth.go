package middleware

import (
	"net/http"
	"strings"

	"infinite-canvas/server/internal/httpx"
	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/service"

	"github.com/gin-gonic/gin"
)

const CurrentUserKey = "currentUser"

type AuthMiddleware struct {
	auth       *service.AuthService
	cookieName string
}

func NewAuthMiddleware(auth *service.AuthService, cookieName string) *AuthMiddleware {
	return &AuthMiddleware{auth: auth, cookieName: cookieName}
}

func (m *AuthMiddleware) Required() gin.HandlerFunc {
	return func(c *gin.Context) {
		user, err := m.auth.UserFromToken(extractToken(c, m.cookieName))
		if err != nil {
			httpx.Fail(c, http.StatusUnauthorized, "请先登录")
			c.Abort()
			return
		}
		c.Set(CurrentUserKey, user)
		c.Next()
	}
}

func (m *AuthMiddleware) AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := CurrentUser(c)
		if user.Role != model.UserRoleAdmin {
			httpx.Fail(c, http.StatusForbidden, "需要管理员权限")
			c.Abort()
			return
		}
		c.Next()
	}
}

func CurrentUser(c *gin.Context) model.User {
	value, ok := c.Get(CurrentUserKey)
	if !ok {
		return model.User{}
	}
	user, _ := value.(model.User)
	return user
}

func extractToken(c *gin.Context, cookieName string) string {
	if token, err := c.Cookie(cookieName); err == nil && token != "" {
		return token
	}
	header := c.GetHeader("Authorization")
	if strings.HasPrefix(strings.ToLower(header), "bearer ") {
		return strings.TrimSpace(header[7:])
	}
	return ""
}
