package http

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"commerce-backend/internal/domain"
	reviewuc "commerce-backend/internal/usecase/review"
)

type mediaHandler struct {
	uc *reviewuc.UseCase
}

func newMediaHandler(uc *reviewuc.UseCase) *mediaHandler {
	return &mediaHandler{uc: uc}
}

func (h *mediaHandler) GetPublicMedia(c *gin.Context) {
	mediaID := c.Param("mediaId")
	if _, err := uuid.Parse(mediaID); err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	// 1. Check database reference and get object metadata from storage first (or full/range object)
	rangeHeader := c.GetHeader("Range")
	ifNoneMatch := c.GetHeader("If-None-Match")

	// First fetch with full object to get metadata (stat)
	mediaObj, err := h.uc.GetPublicMedia(c.Request.Context(), mediaID, -1, -1)
	if err != nil {
		if errors.Is(err, domain.ErrReviewMediaNotFound) {
			c.Status(http.StatusNotFound)
			return
		}
		c.Status(http.StatusServiceUnavailable)
		return
	}
	defer mediaObj.Body.Close()

	etag := mediaObj.ETag
	if etag != "" && !strings.HasPrefix(etag, "\"") {
		etag = fmt.Sprintf("\"%s\"", etag)
	}

	// Check conditional ETag
	if ifNoneMatch != "" {
		matches := false
		for _, rawTag := range strings.Split(ifNoneMatch, ",") {
			tag := strings.TrimSpace(rawTag)
			if tag == "*" || tag == etag || tag == strings.Trim(etag, "\"") {
				matches = true
				break
			}
		}
		if matches {
			c.Header("Cache-Control", "public, max-age=0, must-revalidate")
			c.Header("ETag", etag)
			c.Status(http.StatusNotModified)
			return
		}
	}

	totalSize := mediaObj.Size

	// Check if Range header is requested
	if rangeHeader != "" {
		if !strings.HasPrefix(rangeHeader, "bytes=") {
			c.Header("Content-Range", fmt.Sprintf("bytes */%d", totalSize))
			c.Status(http.StatusRequestedRangeNotSatisfiable)
			return
		}

		spec := strings.TrimPrefix(rangeHeader, "bytes=")
		if strings.Contains(spec, ",") { // Multiple ranges not supported
			c.Header("Content-Range", fmt.Sprintf("bytes */%d", totalSize))
			c.Status(http.StatusRequestedRangeNotSatisfiable)
			return
		}

		parts := strings.Split(spec, "-")
		if len(parts) != 2 {
			c.Header("Content-Range", fmt.Sprintf("bytes */%d", totalSize))
			c.Status(http.StatusRequestedRangeNotSatisfiable)
			return
		}

		var start, end int64
		if parts[0] == "" { // Suffix range: -500
			suffixLen, err := strconv.ParseInt(parts[1], 10, 64)
			if err != nil || suffixLen <= 0 {
				c.Header("Content-Range", fmt.Sprintf("bytes */%d", totalSize))
				c.Status(http.StatusRequestedRangeNotSatisfiable)
				return
			}
			start = totalSize - suffixLen
			if start < 0 {
				start = 0
			}
			end = totalSize - 1
		} else {
			s, err := strconv.ParseInt(parts[0], 10, 64)
			if err != nil || s < 0 || s >= totalSize {
				c.Header("Content-Range", fmt.Sprintf("bytes */%d", totalSize))
				c.Status(http.StatusRequestedRangeNotSatisfiable)
				return
			}
			start = s

			if parts[1] == "" { // Open range: 500-
				end = totalSize - 1
			} else {
				e, err := strconv.ParseInt(parts[1], 10, 64)
				if err != nil || e < start {
					c.Header("Content-Range", fmt.Sprintf("bytes */%d", totalSize))
					c.Status(http.StatusRequestedRangeNotSatisfiable)
					return
				}
				if e >= totalSize {
					e = totalSize - 1
				}
				end = e
			}
		}

		// Fetch byte range
		rangeObj, err := h.uc.GetPublicMedia(c.Request.Context(), mediaID, start, end)
		if err != nil {
			if errors.Is(err, domain.ErrReviewMediaNotFound) {
				c.Status(http.StatusNotFound)
				return
			}
			c.Status(http.StatusServiceUnavailable)
			return
		}
		defer rangeObj.Body.Close()

		rangeLen := end - start + 1
		c.Header("Accept-Ranges", "bytes")
		c.Header("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, totalSize))
		c.Header("Content-Length", strconv.FormatInt(rangeLen, 10))
		c.Header("Content-Type", mediaObj.ContentType)
		c.Header("Cache-Control", "public, max-age=0, must-revalidate")
		c.Header("ETag", etag)
		c.Status(http.StatusPartialContent)
		_, _ = io.Copy(c.Writer, rangeObj.Body)
		return
	}

	// Serve full object
	c.Header("Accept-Ranges", "bytes")
	c.Header("Content-Length", strconv.FormatInt(totalSize, 10))
	c.Header("Content-Type", mediaObj.ContentType)
	c.Header("Cache-Control", "public, max-age=0, must-revalidate")
	c.Header("ETag", etag)
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, mediaObj.Body)
}
