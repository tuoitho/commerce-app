package http

import (
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"commerce-backend/internal/domain"
	chatuc "commerce-backend/internal/usecase/chat"
)

type chatMediaHandler struct {
	uc domain.ChatUseCase
}

func newChatMediaHandler(uc domain.ChatUseCase) *chatMediaHandler {
	return &chatMediaHandler{uc: uc}
}

type chatMediaUploadResponse struct {
	ID       string `json:"id"`
	FileURL  string `json:"fileUrl"`
	FileType string `json:"fileType"`
	FileName string `json:"fileName"`
	FileSize int64  `json:"fileSize"`
	MimeType string `json:"mimeType"`
}

const maxChatMultipartBytes = 55 * 1024 * 1024 // 55MB to allow 50MB video + multipart overhead

func (h *chatMediaHandler) uploadMedia(c *gin.Context) {
	uploaderID := callerUserID(c)
	if uploaderID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxChatMultipartBytes)

	form, err := c.MultipartForm()
	if err != nil {
		writeError(c, domain.NewValidationError(map[string]string{
			"file": "Dung lượng tệp vượt quá giới hạn cho phép (tối đa 10MB cho ảnh, 50MB cho video)",
		}))
		return
	}

	files := form.File["file"]
	if len(files) == 0 {
		writeError(c, domain.NewValidationError(map[string]string{
			"file": "Vui lòng chọn tệp để tải lên",
		}))
		return
	}

	fh := files[0]
	if fh.Size <= 0 {
		writeError(c, domain.NewValidationError(map[string]string{
			"file": "Dung lượng tệp vượt quá giới hạn cho phép (tối đa 10MB cho ảnh, 50MB cho video)",
		}))
		return
	}

	rawContentType := fh.Header.Get("Content-Type")
	parsedMime, _, _ := mime.ParseMediaType(rawContentType)
	if parsedMime == "" {
		parsedMime = rawContentType
	}
	normMime := strings.ToLower(strings.TrimSpace(parsedMime))
	if normMime == "image/jpg" {
		normMime = "image/jpeg"
	}

	switch normMime {
	case "image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm":
		// Supported
	default:
		writeError(c, domain.NewValidationError(map[string]string{
			"file_type": "Định dạng tệp không được hỗ trợ (chỉ chấp nhận JPEG, PNG, WebP, GIF, MP4, WebM)",
		}))
		return
	}

	if strings.HasPrefix(normMime, "image/") && fh.Size > chatuc.MaxChatImageSizeBytes {
		writeError(c, domain.NewValidationError(map[string]string{
			"file": "Dung lượng tệp vượt quá giới hạn cho phép (tối đa 10MB cho ảnh, 50MB cho video)",
		}))
		return
	}
	if strings.HasPrefix(normMime, "video/") && fh.Size > chatuc.MaxChatVideoSizeBytes {
		writeError(c, domain.NewValidationError(map[string]string{
			"file": "Dung lượng tệp vượt quá giới hạn cho phép (tối đa 10MB cho ảnh, 50MB cho video)",
		}))
		return
	}

	file, err := fh.Open()
	if err != nil {
		writeError(c, domain.NewValidationError(map[string]string{
			"file": "Không thể mở tệp tải lên",
		}))
		return
	}
	defer file.Close()

	attachment, err := h.uc.UploadMedia(c.Request.Context(), uploaderID, fh.Filename, file, fh.Size, normMime)
	if err != nil {
		writeError(c, err)
		return
	}

	resp := chatMediaUploadResponse{
		ID:       attachment.ID,
		FileURL:  "/api/v1/chat/media/" + attachment.ID,
		FileType: string(attachment.FileType),
		FileName: attachment.FileName,
		FileSize: attachment.FileSize,
		MimeType: attachment.MimeType,
	}

	writeSuccess(c, http.StatusCreated, "Tải tệp lên thành công", resp)
}

func (h *chatMediaHandler) getMedia(c *gin.Context) {
	mediaID := c.Param("id")
	if _, err := uuid.Parse(mediaID); err != nil {
		writeError(c, domain.ErrChatAttachmentNotFound)
		return
	}

	requesterID := callerUserID(c)
	requesterRole := callerRole(c)

	rangeHeader := c.GetHeader("Range")

	if c.Request.Method == http.MethodHead {
		stream, attachment, err := h.uc.GetMediaStream(c.Request.Context(), requesterID, requesterRole, mediaID, 0, 0)
		if err != nil {
			writeError(c, err)
			return
		}
		_ = stream.Close()

		c.Header("Content-Type", attachment.MimeType)
		c.Header("Content-Length", strconv.FormatInt(attachment.FileSize, 10))
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Content-Disposition", "inline")
		if attachment.FileType == domain.ChatAttachmentImage {
			c.Header("Cache-Control", "public, max-age=86400")
		} else {
			c.Header("Accept-Ranges", "bytes")
		}
		c.Status(http.StatusOK)
		return
	}

	if rangeHeader != "" && strings.HasPrefix(rangeHeader, "bytes=") {
		stream, attachment, err := h.uc.GetMediaStream(c.Request.Context(), requesterID, requesterRole, mediaID, 0, 0)
		if err != nil {
			writeError(c, err)
			return
		}
		_ = stream.Close()

		if attachment.FileType == domain.ChatAttachmentVideo {
			c.Header("Accept-Ranges", "bytes")
			c.Header("Content-Type", attachment.MimeType)
			c.Header("X-Content-Type-Options", "nosniff")
			c.Header("Content-Disposition", "inline")

			rangeSpec := strings.TrimPrefix(rangeHeader, "bytes=")
			parts := strings.Split(rangeSpec, "-")
			if len(parts) == 2 {
				start, err1 := strconv.ParseInt(parts[0], 10, 64)
				var end int64 = attachment.FileSize - 1
				var err2 error
				if parts[1] != "" {
					end, err2 = strconv.ParseInt(parts[1], 10, 64)
				}
				if err1 == nil && err2 == nil && start >= 0 && end >= start && start < attachment.FileSize {
					if end >= attachment.FileSize {
						end = attachment.FileSize - 1
					}
					length := end - start + 1
					rangeStream, _, err := h.uc.GetMediaStream(c.Request.Context(), requesterID, requesterRole, mediaID, start, length)
					if err != nil {
						c.Status(http.StatusServiceUnavailable)
						return
					}
					defer rangeStream.Close()

					c.Header("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, attachment.FileSize))
					c.Header("Content-Length", strconv.FormatInt(length, 10))
					c.Status(http.StatusPartialContent)
					_, _ = io.Copy(c.Writer, rangeStream)
					return
				}
				c.Header("Content-Range", fmt.Sprintf("bytes */%d", attachment.FileSize))
				c.Status(http.StatusRequestedRangeNotSatisfiable)
				return
			}
		}
	}

	stream, attachment, err := h.uc.GetMediaStream(c.Request.Context(), requesterID, requesterRole, mediaID, 0, 0)
	if err != nil {
		writeError(c, err)
		return
	}
	defer stream.Close()

	c.Header("Content-Type", attachment.MimeType)
	c.Header("Content-Length", strconv.FormatInt(attachment.FileSize, 10))
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Disposition", "inline")

	if attachment.FileType == domain.ChatAttachmentImage {
		c.Header("Cache-Control", "public, max-age=86400")
	} else if attachment.FileType == domain.ChatAttachmentVideo {
		c.Header("Accept-Ranges", "bytes")
	}

	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, stream)
}
