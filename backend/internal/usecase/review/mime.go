package review

import (
	"bytes"
	"net/http"
	"strings"

	"commerce-backend/internal/domain"
)

// DetectMIME inspects the leading bytes of a file to detect its actual media type.
func DetectMIME(data []byte) string {
	if len(data) >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
		return "image/jpeg"
	}
	if len(data) >= 8 && bytes.Equal(data[:8], []byte("\x89PNG\r\n\x1a\n")) {
		return "image/png"
	}
	if len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		return "image/webp"
	}
	if len(data) >= 8 && (string(data[4:8]) == "ftyp" || (len(data) >= 12 && strings.Contains(string(data[:12]), "ftyp"))) {
		return "video/mp4"
	}
	if len(data) >= 4 && data[0] == 0x1A && data[1] == 0x45 && data[2] == 0xDF && data[3] == 0xA3 {
		return "video/webm"
	}

	ct := http.DetectContentType(data)
	switch {
	case strings.HasPrefix(ct, "image/jpeg"):
		return "image/jpeg"
	case strings.HasPrefix(ct, "image/png"):
		return "image/png"
	case strings.HasPrefix(ct, "image/webp"):
		return "image/webp"
	case strings.HasPrefix(ct, "video/mp4"):
		return "video/mp4"
	case strings.HasPrefix(ct, "video/webm"):
		return "video/webm"
	}

	return ""
}

func ClassifyMediaType(mimeType string) (domain.MediaType, bool) {
	if domain.AllowedImageMIMEs[mimeType] {
		return domain.MediaTypeImage, true
	}
	if domain.AllowedVideoMIMEs[mimeType] {
		return domain.MediaTypeVideo, true
	}
	return "", false
}
