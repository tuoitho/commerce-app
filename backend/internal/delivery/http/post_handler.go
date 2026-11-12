package http

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

type postHandler struct {
	uc domain.PostUseCase
}

func newPostHandler(uc domain.PostUseCase) *postHandler {
	return &postHandler{uc: uc}
}

func (h *postHandler) listPosts(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))

	var viewerUserID *string
	if uid := callerUserID(c); uid != "" {
		viewerUserID = &uid
	}

	posts, total, totalPages, err := h.uc.ListPosts(c.Request.Context(), viewerUserID, page, limit)
	if err != nil {
		writeError(c, err)
		return
	}

	pagination := PaginationMeta{
		Page:       page,
		Limit:      limit,
		Total:      total,
		TotalPages: totalPages,
		HasNext:    page < totalPages,
		HasPrev:    page > 1,
	}

	writePaginatedSuccess(c, http.StatusOK, "Lấy danh sách bài viết thành công", posts, pagination)
}

func (h *postHandler) getPostByID(c *gin.Context) {
	postID := c.Param("id")
	if _, err := uuid.Parse(postID); err != nil {
		writeError(c, domain.ErrPostNotFound)
		return
	}

	var viewerUserID *string
	if uid := callerUserID(c); uid != "" {
		viewerUserID = &uid
	}

	post, err := h.uc.GetPostByID(c.Request.Context(), viewerUserID, postID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Lấy chi tiết bài viết thành công", post)
}

func (h *postHandler) setPostReaction(c *gin.Context) {
	userID := callerUserID(c)
	if userID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	postID := c.Param("id")
	if _, err := uuid.Parse(postID); err != nil {
		writeError(c, domain.ErrPostNotFound)
		return
	}

	var req domain.ReactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "validation_error", "Dữ liệu không hợp lệ", map[string]string{
			"reaction": "Loại cảm xúc không hợp lệ",
		})
		return
	}

	summary, err := h.uc.ReactToPost(c.Request.Context(), userID, postID, req.Reaction)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Cập nhật cảm xúc thành công", summary)
}

func (h *postHandler) createComment(c *gin.Context) {
	userID := callerUserID(c)
	if userID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	postID := c.Param("id")
	if _, err := uuid.Parse(postID); err != nil {
		writeError(c, domain.ErrPostNotFound)
		return
	}

	var req domain.CreateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "validation_error", "Dữ liệu không hợp lệ", nil)
		return
	}

	comment, err := h.uc.CreateComment(c.Request.Context(), userID, postID, req)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusCreated, "Bình luận thành công", comment)
}

func (h *postHandler) deleteComment(c *gin.Context) {
	userID := callerUserID(c)
	if userID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	postID := c.Param("id")
	if _, err := uuid.Parse(postID); err != nil {
		writeError(c, domain.ErrPostNotFound)
		return
	}

	commentID := c.Param("commentId")
	if _, err := uuid.Parse(commentID); err != nil {
		writeError(c, domain.ErrPostCommentNotFound)
		return
	}

	userRole := callerRole(c)
	deletedID, count, err := h.uc.DeleteComment(c.Request.Context(), userID, userRole, postID, commentID)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Xóa bình luận thành công", gin.H{
		"deletedCommentId": deletedID,
		"commentCount":     count,
	})
}

func (h *postHandler) setCommentReaction(c *gin.Context) {
	userID := callerUserID(c)
	if userID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	commentID := c.Param("commentId")
	if _, err := uuid.Parse(commentID); err != nil {
		writeError(c, domain.ErrPostCommentNotFound)
		return
	}

	var req domain.ReactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, http.StatusBadRequest, "validation_error", "Dữ liệu không hợp lệ", map[string]string{
			"reaction": "Loại cảm xúc không hợp lệ",
		})
		return
	}

	summary, err := h.uc.ReactToComment(c.Request.Context(), userID, commentID, req.Reaction)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusOK, "Cập nhật cảm xúc bình luận thành công", summary)
}
