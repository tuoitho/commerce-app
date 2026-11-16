package http

import (
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"commerce-backend/internal/domain"
	accountuc "commerce-backend/internal/usecase/account"
)

type accountHandler struct {
	uc         *accountuc.UseCase
	refreshTTL time.Duration
	secure     bool
	sameSite   http.SameSite
	logger     *slog.Logger
}

func newAccountHandler(uc *accountuc.UseCase, refreshTTL time.Duration, cookieSecure bool, logger *slog.Logger) *accountHandler {
	if logger == nil {
		logger = slog.Default()
	}
	return &accountHandler{
		uc:         uc,
		refreshTTL: refreshTTL,
		secure:     cookieSecure,
		sameSite:   http.SameSiteLaxMode,
		logger:     logger,
	}
}

type updateProfileRequest struct {
	DisplayName *string `json:"displayName"`
	Phone       *string `json:"phone"`
}

type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

func (h *accountHandler) GetProfile(c *gin.Context) {
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}
	user, err := h.uc.GetProfile(c.Request.Context(), callerUserID(c))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Lấy thông tin tài khoản thành công", user)
}

func (h *accountHandler) UpdateProfile(c *gin.Context) {
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}
	var req updateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{
			"body": "Dữ liệu không hợp lệ",
		}))
		return
	}
	user, err := h.uc.UpdateProfile(c.Request.Context(), callerUserID(c), domain.UpdateProfileInput{
		DisplayName: req.DisplayName,
		Phone:       req.Phone,
	})
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Cập nhật hồ sơ thành công", user)
}

func (h *accountHandler) UploadAvatar(c *gin.Context) {
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, domain.MaxAvatarRequestBytes)

	form, err := c.MultipartForm()
	if err != nil {
		writeError(c, domain.NewValidationError(map[string]string{
			"avatar": "Ảnh đại diện không hợp lệ hoặc vượt quá 5MB",
		}))
		return
	}
	files := form.File["avatar"]
	if len(files) == 0 {
		writeError(c, domain.NewValidationError(map[string]string{
			"avatar": "Vui lòng chọn ảnh đại diện",
		}))
		return
	}
	fh := files[0]
	if fh.Size <= 0 || fh.Size > domain.MaxAvatarBytes {
		writeError(c, domain.NewValidationError(map[string]string{
			"avatar": "Ảnh đại diện không hợp lệ hoặc vượt quá 5MB",
		}))
		return
	}
	file, err := fh.Open()
	if err != nil {
		writeError(c, domain.NewValidationError(map[string]string{
			"avatar": "Không thể đọc tệp ảnh đại diện",
		}))
		return
	}
	defer file.Close()

	user, err := h.uc.UploadAvatar(c.Request.Context(), callerUserID(c), domain.UploadAvatarInput{
		Reader:              file,
		Size:                fh.Size,
		DeclaredContentType: fh.Header.Get("Content-Type"),
	})
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Cập nhật ảnh đại diện thành công", user)
}

func (h *accountHandler) DeleteAvatar(c *gin.Context) {
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}
	user, err := h.uc.DeleteAvatar(c.Request.Context(), callerUserID(c))
	if err != nil {
		writeError(c, err)
		return
	}
	writeSuccess(c, http.StatusOK, "Đã xóa ảnh đại diện", user)
}

func (h *accountHandler) ChangePassword(c *gin.Context) {
	if h.uc == nil {
		writeError(c, domain.ErrNotFound)
		return
	}
	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, domain.NewValidationError(map[string]string{
			"body": "Dữ liệu không hợp lệ",
		}))
		return
	}

	userID := callerUserID(c)
	sess, err := h.uc.ChangePassword(c.Request.Context(), userID, domain.ChangePasswordInput{
		CurrentPassword: req.CurrentPassword,
		NewPassword:     req.NewPassword,
	})
	if err != nil {
		writeError(c, err)
		return
	}

	c.SetSameSite(h.sameSite)
	c.SetCookie(refreshCookieName, sess.RefreshToken, int(h.refreshTTL.Seconds()), refreshCookiePath, "", h.secure, true)
	h.logger.InfoContext(c.Request.Context(), "account password changed", "user_id", userID)

	writeSuccess(c, http.StatusOK, "Đổi mật khẩu thành công", sessionResponse{
		User:        sess.User,
		AccessToken: sess.AccessToken,
	})
}

func (h *accountHandler) GetAvatarMedia(c *gin.Context) {
	if h.uc == nil {
		writeError(c, domain.ErrAvatarNotFound)
		return
	}
	avatarKey := c.Param("avatarKey")
	if c.Request.Method == http.MethodHead {
		info, err := h.uc.StatAvatar(c.Request.Context(), avatarKey)
		if err != nil {
			writeError(c, err)
			return
		}
		writeAvatarHeaders(c, info)
		c.Status(http.StatusOK)
		return
	}

	stream, info, err := h.uc.OpenAvatar(c.Request.Context(), avatarKey)
	if err != nil {
		writeError(c, err)
		return
	}
	defer stream.Close()

	writeAvatarHeaders(c, info)
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, stream)
}

func writeAvatarHeaders(c *gin.Context, info *domain.ChatObjectInfo) {
	c.Header("Content-Type", info.ContentType)
	c.Header("Content-Length", strconv.FormatInt(info.Size, 10))
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "public, max-age=86400, immutable")
	c.Header("Content-Disposition", "inline")
}
