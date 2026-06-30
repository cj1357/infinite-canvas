package httpx

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Response struct {
	Code int    `json:"code"`
	Data any    `json:"data,omitempty"`
	Msg  string `json:"msg"`
}

func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, Response{Code: 0, Data: data, Msg: "ok"})
}

func Fail(c *gin.Context, status int, msg string) {
	if msg == "" {
		msg = http.StatusText(status)
	}
	c.JSON(status, Response{Code: status, Msg: msg})
}

func Error(c *gin.Context, err error) {
	if err == nil {
		OK(c, nil)
		return
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		Fail(c, http.StatusNotFound, "数据不存在")
		return
	}
	Fail(c, http.StatusBadRequest, err.Error())
}
