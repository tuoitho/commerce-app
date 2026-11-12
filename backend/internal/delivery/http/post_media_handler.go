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
)

type postMediaHandler struct {
	uc domain.PostUseCase
}

func newPostMediaHandler(uc domain.PostUseCase) *postMediaHandler {
	return &postMediaHandler{uc: uc}
}

const maxPostMultipartBytes = 55 * 1024 * 1024 // 55MB to allow 50MB video + multipart overhead

func (h *postMediaHandler) uploadMedia(c *gin.Context) {
	adminID := callerUserID(c)
	if adminID == "" {
		writeError(c, domain.ErrInvalidToken)
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxPostMultipartBytes)

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

	if strings.HasPrefix(normMime, "image/") && fh.Size > domain.MaxImageSizeBytes {
		writeError(c, domain.NewValidationError(map[string]string{
			"file": "Dung lượng tệp vượt quá giới hạn cho phép (tối đa 10MB cho ảnh, 50MB cho video)",
		}))
		return
	}
	if strings.HasPrefix(normMime, "video/") && fh.Size > domain.MaxVideoSizeBytes {
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

	attachment, err := h.uc.UploadMedia(c.Request.Context(), adminID, fh.Filename, file, fh.Size, normMime)
	if err != nil {
		writeError(c, err)
		return
	}

	writeSuccess(c, http.StatusCreated, "Tải tệp lên thành công", attachment)
}

func (h *postMediaHandler) getMedia(c *gin.Context) {
	mediaID := c.Param("id")
	if _, err := uuid.Parse(mediaID); err != nil {
		writeError(c, domain.ErrPostMediaNotFound)
		return
	}

	rangeHeader := c.GetHeader("Range")

	if c.Request.Method == http.MethodHead {
		stream, attachment, _, err := h.uc.GetMediaStream(c.Request.Context(), mediaID, 0, -1)
		if err != nil {
			writeError(c, err)
			return
		}
		if stream != nil {
			_ = stream.Close()
		}

		c.Header("Content-Type", attachment.MimeType)
		c.Header("Content-Length", strconv.FormatInt(attachment.FileSize, 10))
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Content-Disposition", "inline")
		if attachment.FileType == domain.PostMediaTypeImage {
			c.Header("Cache-Control", "public, max-age=86400")
		} else {
			c.Header("Accept-Ranges", "bytes")
		}
		c.Status(http.StatusOK)
		return
	}

	if rangeHeader != "" && strings.HasPrefix(rangeHeader, "bytes=") {
		stream, attachment, _, err := h.uc.GetMediaStream(c.Request.Context(), mediaID, 0, -1)
		if err != nil {
			writeError(c, err)
			return
		}
		if stream != nil {
			_ = stream.Close()
		}

		if attachment.FileType == domain.PostMediaTypeVideo {
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
					rangeStream, _, _, err := h.uc.GetMediaStream(c.Request.Context(), mediaID, start, length)
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

	stream, attachment, _, err := h.uc.GetMediaStream(c.Request.Context(), mediaID, 0, 0)
	if err != nil {
		writeError(c, err)
		return
	}
	defer stream.Close()

	c.Header("Content-Type", attachment.MimeType)
	c.Header("Content-Length", strconv.FormatInt(attachment.FileSize, 10))
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Disposition", "inline")

	if attachment.FileType == domain.PostMediaTypeImage {
		c.Header("Cache-Control", "public, max-age=86400")
	} else if attachment.FileType == domain.PostMediaTypeVideo {
		c.Header("Accept-Ranges", "bytes")
	}

	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, stream)
}
