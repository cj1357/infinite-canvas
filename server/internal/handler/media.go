package handler

import (
	"io"
	"net/http"
	"strconv"

	"infinite-canvas/server/internal/httpx"
	"infinite-canvas/server/internal/middleware"
	"infinite-canvas/server/internal/service"

	"github.com/gin-gonic/gin"
)

type MediaHandler struct {
	media *service.MediaObjectService
}

func NewMediaHandler(media *service.MediaObjectService) *MediaHandler {
	return &MediaHandler{media: media}
}

func (h *MediaHandler) Upload(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		httpx.Fail(c, http.StatusBadRequest, "请选择要上传的文件")
		return
	}
	item, err := h.media.Upload(c.Request.Context(), middleware.CurrentUser(c).ID, file)
	writeResult(c, item, err)
}

func (h *MediaHandler) Get(c *gin.Context) {
	object, item, err := h.media.Open(c.Request.Context(), middleware.CurrentUser(c).ID, c.Param("id"))
	if err != nil {
		httpx.Error(c, err)
		return
	}
	defer object.Body.Close()
	contentType := object.ContentType
	if contentType == "" {
		contentType = item.MimeType
	}
	if contentType == "" {
		contentType = item.ContentType
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Header("Content-Type", contentType)
	if object.Size > 0 {
		c.Header("Content-Length", strconvFormatInt(object.Size))
	}
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, object.Body)
}

func (h *MediaHandler) Delete(c *gin.Context) {
	httpx.Error(c, h.media.Delete(c.Request.Context(), middleware.CurrentUser(c).ID, c.Param("id")))
}

func strconvFormatInt(value int64) string {
	return strconv.FormatInt(value, 10)
}
