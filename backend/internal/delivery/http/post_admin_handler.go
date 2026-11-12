package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

type postAdminHandler struct {
	uc domain.PostUseCase
}

func newPostAdminHandler(uc domain.PostUseCase) *postAdminHandler {
	return &postAdminHandler{uc: uc}
}

func (h *postAdminHandler) createPost(c *gin.Context) {
	adminID := callerUserID(c)
	if adminID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	var req domain.CreatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "validation_error", "Dữ liệu không hợp lệ", nil)
		return
	}

	post, err := h.uc.CreatePost(c.Request.Context(), adminID, req)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusCreated, "Tạo bài viết thành công", post)
}

func (h *postAdminHandler) updatePost(c *gin.Context) {
	adminID := callerUserID(c)
	if adminID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	postID := c.Param("id")
	if _, err := uuid.Parse(postID); err != nil {
		writeError(c, domain.ErrPostNotFound)
		return
	}

	var req domain.UpdatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "validation_error", "Dữ liệu không hợp lệ", nil)
		return
	}

	post, err := h.uc.UpdatePost(c.Request.Context(), adminID, postID, req)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Cập nhật bài viết thành công", post)
}

func (h *postAdminHandler) deletePost(c *gin.Context) {
	adminID := callerUserID(c)
	if adminID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	postID := c.Param("id")
	if _, err := uuid.Parse(postID); err != nil {
		writeError(c, domain.ErrPostNotFound)
		return
	}

	if err := h.uc.DeletePost(c.Request.Context(), adminID, postID); err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Xóa bài viết thành công", gin.H{"id": postID})
}
