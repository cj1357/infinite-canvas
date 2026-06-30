package handler

import (
	"net/http"
	"strconv"

	"infinite-canvas/server/internal/httpx"
	"infinite-canvas/server/internal/middleware"
	"infinite-canvas/server/internal/model"
	"infinite-canvas/server/internal/service"

	"github.com/gin-gonic/gin"
)

type DataHandler struct {
	data *service.DataService
}

func NewDataHandler(data *service.DataService) *DataHandler {
	return &DataHandler{data: data}
}

func (h *DataHandler) ListCanvasProjects(c *gin.Context) {
	result, err := h.data.ListCanvasProjects(middleware.CurrentUser(c).ID, readQuery(c))
	writeResult(c, result, err)
}

func (h *DataHandler) CreateCanvasProject(c *gin.Context) {
	var req service.CanvasProjectInput
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.data.CreateCanvasProject(middleware.CurrentUser(c).ID, req)
	writeResult(c, result, err)
}

func (h *DataHandler) UpdateCanvasProject(c *gin.Context) {
	var req service.CanvasProjectInput
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.data.UpdateCanvasProject(middleware.CurrentUser(c).ID, c.Param("id"), req)
	writeResult(c, result, err)
}

func (h *DataHandler) DeleteCanvasProject(c *gin.Context) {
	httpx.Error(c, h.data.DeleteCanvasProject(middleware.CurrentUser(c).ID, c.Param("id")))
}

func (h *DataHandler) ListAssets(c *gin.Context) {
	result, err := h.data.ListAssets(middleware.CurrentUser(c).ID, readQuery(c))
	writeResult(c, result, err)
}

func (h *DataHandler) CreateAsset(c *gin.Context) {
	var req service.AssetInput
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.data.CreateAsset(middleware.CurrentUser(c).ID, req)
	writeResult(c, result, err)
}

func (h *DataHandler) UpdateAsset(c *gin.Context) {
	var req service.AssetInput
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.data.UpdateAsset(middleware.CurrentUser(c).ID, c.Param("id"), req)
	writeResult(c, result, err)
}

func (h *DataHandler) DeleteAsset(c *gin.Context) {
	httpx.Error(c, h.data.DeleteAsset(middleware.CurrentUser(c).ID, c.Param("id")))
}

func (h *DataHandler) ListGenerationLogs(c *gin.Context) {
	result, err := h.data.ListGenerationLogs(middleware.CurrentUser(c).ID, readQuery(c))
	writeResult(c, result, err)
}

func (h *DataHandler) CreateGenerationLog(c *gin.Context) {
	var req service.GenerationLogInput
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.data.CreateGenerationLog(middleware.CurrentUser(c).ID, req)
	writeResult(c, result, err)
}

func (h *DataHandler) DeleteGenerationLog(c *gin.Context) {
	httpx.Error(c, h.data.DeleteGenerationLog(middleware.CurrentUser(c).ID, c.Param("id")))
}

func (h *DataHandler) ImportLocalData(c *gin.Context) {
	var req service.ImportLocalDataRequest
	if !bindJSON(c, &req) {
		return
	}
	result, err := h.data.ImportLocalData(middleware.CurrentUser(c).ID, req)
	writeResult(c, result, err)
}

func readQuery(c *gin.Context) model.Query {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	return model.Query{Page: page, PageSize: pageSize, Keyword: c.Query("keyword")}
}

func bindJSON(c *gin.Context, out any) bool {
	if err := c.ShouldBindJSON(out); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "请求参数错误")
		return false
	}
	return true
}

func writeResult(c *gin.Context, data any, err error) {
	if err != nil {
		httpx.Error(c, err)
		return
	}
	httpx.OK(c, data)
}
