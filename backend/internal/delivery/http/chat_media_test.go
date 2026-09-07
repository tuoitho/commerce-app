package http_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	delivery "commerce-backend/internal/delivery/http"
	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	"commerce-backend/internal/storage"
	chatuc "commerce-backend/internal/usecase/chat"
)

type mockChatRepoForMedia struct {
	domain.ChatRepository
	media *domain.MessageMedia
}

func (m *mockChatRepoForMedia) GetMediaByID(ctx context.Context, mediaID string) (*domain.MessageMedia, error) {
	if m.media != nil && m.media.ID == mediaID {
		return m.media, nil
	}
	return nil, domain.ErrChatMessageMediaNotFound
}

func TestChatMedia_StreamingProxy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	jwtMgr := jwt.NewManager("super-secret-key-that-is-at-least-32-chars-long", "commerce-backend")

	store := storage.NewMemoryStorage("test-bucket")
	ctx := context.Background()

	testData := []byte("\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xFF\xDB\x00C\x00")
	objKey := "chat/test-media-123/img.jpg"
	_, _ = store.PutObject(ctx, objKey, bytes.NewReader(testData), int64(len(testData)), "image/jpeg")

	mediaID := "11111111-2222-3333-4444-555555555555"
	mockRepo := &mockChatRepoForMedia{
		media: &domain.MessageMedia{
			ID:          mediaID,
			MessageID:   "m1",
			MediaType:   "image",
			ObjectKey:   objKey,
			URL:         "/media/chat/" + mediaID,
			ContentType: "image/jpeg",
			FileSize:    int64(len(testData)),
			FileName:    "img.jpg",
		},
	}

	uc := chatuc.NewUseCase(chatuc.Dependencies{
		ChatRepo: mockRepo,
		Storage:  store,
	})

	router := gin.New()
	delivery.NewRouter(router, delivery.Dependencies{
		Chat:       uc,
		JWT:        jwtMgr,
		RefreshTTL: 720 * time.Hour,
	})

	t.Run("Valid media streaming returns 200 with raw bytes and ETag", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/media/chat/"+mediaID, nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		if w.Header().Get("Content-Type") != "image/jpeg" {
			t.Errorf("expected Content-Type image/jpeg, got %s", w.Header().Get("Content-Type"))
		}
		if w.Header().Get("Accept-Ranges") != "bytes" {
			t.Errorf("expected Accept-Ranges bytes, got %s", w.Header().Get("Accept-Ranges"))
		}
		if !bytes.Equal(w.Body.Bytes(), testData) {
			t.Errorf("body data mismatch")
		}
	})

	t.Run("Range request returns 206 Partial Content", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/media/chat/"+mediaID, nil)
		req.Header.Set("Range", "bytes=0-9")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusPartialContent {
			t.Fatalf("expected 206, got %d", w.Code)
		}
		if w.Body.Len() != 10 {
			t.Errorf("expected 10 bytes, got %d", w.Body.Len())
		}
	})

	t.Run("API v1 prefix alias also serves media", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/media/chat/"+mediaID, nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		if !bytes.Equal(w.Body.Bytes(), testData) {
			t.Errorf("body data mismatch")
		}
	})

	t.Run("Non-existent media returns 404", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/media/chat/00000000-0000-0000-0000-000000000000", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", w.Code)
		}
	})

	t.Run("Malformed UUID returns 404", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, "/media/chat/not-a-uuid", nil)
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", w.Code)
		}
	})

	t.Run("Media exists in DB but object missing in storage returns 404", func(t *testing.T) {
		missingObjMediaID := "22222222-2222-2222-2222-222222222222"
		mockRepoMissing := &mockChatRepoForMedia{
			media: &domain.MessageMedia{
				ID:          missingObjMediaID,
				MessageID:   "m2",
				MediaType:   "image",
				ObjectKey:   "chat/non-existent-object.jpg",
				URL:         "/media/chat/" + missingObjMediaID,
				ContentType: "image/jpeg",
				FileSize:    1024,
				FileName:    "missing.jpg",
			},
		}

		ucMissing := chatuc.NewUseCase(chatuc.Dependencies{
			ChatRepo: mockRepoMissing,
			Storage:  store, // store does not contain chat/non-existent-object.jpg
		})

		routerMissing := gin.New()
		delivery.NewRouter(routerMissing, delivery.Dependencies{
			Chat: ucMissing,
			JWT:  jwtMgr,
		})

		req, _ := http.NewRequest(http.MethodGet, "/media/chat/"+missingObjMediaID, nil)
		w := httptest.NewRecorder()
		routerMissing.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404 when object missing in storage, got %d", w.Code)
		}
	})
}
