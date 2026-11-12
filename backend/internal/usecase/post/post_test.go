package post_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/storage/chatmedia"
	postuc "commerce-backend/internal/usecase/post"
)

// ============================================================================
// Mocks
// ============================================================================

type mockPostRepo struct {
	createPostFn                 func(ctx context.Context, input domain.CreatePostInput) (*domain.PostDetail, error)
	getPostByIDFn                func(ctx context.Context, postID string, viewerUserID *string) (*domain.PostDetail, error)
	listPostsFn                  func(ctx context.Context, filter domain.ListPostsFilter) ([]domain.PostItem, int, error)
	updatePostFn                 func(ctx context.Context, input domain.UpdatePostInput) (*domain.PostDetail, error)
	deletePostFn                 func(ctx context.Context, postID string) error
	createPendingMediaFn         func(ctx context.Context, uploaderID string, objectKey string, fileType domain.PostMediaType, fileName string, fileSize int64, mimeType string) (*domain.PostMediaAttachment, error)
	getMediaByIDFn               func(ctx context.Context, mediaID string) (*domain.PostMediaAttachment, error)
	getMediaByIDsFn              func(ctx context.Context, mediaIDs []string) ([]domain.PostMediaAttachment, error)
	deleteMediaFn                func(ctx context.Context, mediaID string) (string, error)
	setPostReactionFn            func(ctx context.Context, postID string, userID string, reaction *domain.ReactionType) (*domain.ReactionSummary, *domain.ReactionType, error)
	setCommentReactionFn         func(ctx context.Context, commentID string, userID string, reaction *domain.ReactionType) (*domain.ReactionSummary, *domain.ReactionType, error)
	createCommentFn              func(ctx context.Context, input domain.CreateCommentInput) (*domain.PostComment, error)
	deleteCommentFn              func(ctx context.Context, commentID string) (string, int, error)
	getCommentByIDFn             func(ctx context.Context, commentID string) (*domain.PostComment, error)
	createNotificationFn                  func(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error)
	deleteUnreadNotificationByGroupKeyFn  func(ctx context.Context, recipientID, groupKey string) error
	syncUnreadReactionNotificationFn      func(ctx context.Context, recipientID, groupKey string, postID, commentID *string) (*domain.NotificationItem, error)
	listNotificationsFn                   func(ctx context.Context, recipientID string, limit, offset int) (*domain.NotificationsListResult, error)
	markNotificationReadFn       func(ctx context.Context, notificationID string, recipientID string) (*domain.NotificationItem, error)
	markAllNotificationsReadFn   func(ctx context.Context, recipientID string) error
	getUnreadNotificationCountFn func(ctx context.Context, recipientID string) (int, error)
}

func (m *mockPostRepo) CreatePost(ctx context.Context, input domain.CreatePostInput) (*domain.PostDetail, error) {
	if m.createPostFn != nil {
		return m.createPostFn(ctx, input)
	}
	return nil, nil
}

func (m *mockPostRepo) GetPostByID(ctx context.Context, postID string, viewerUserID *string) (*domain.PostDetail, error) {
	if m.getPostByIDFn != nil {
		return m.getPostByIDFn(ctx, postID, viewerUserID)
	}
	return nil, domain.ErrPostNotFound
}

func (m *mockPostRepo) ListPosts(ctx context.Context, filter domain.ListPostsFilter) ([]domain.PostItem, int, error) {
	if m.listPostsFn != nil {
		return m.listPostsFn(ctx, filter)
	}
	return nil, 0, nil
}

func (m *mockPostRepo) UpdatePost(ctx context.Context, input domain.UpdatePostInput) (*domain.PostDetail, error) {
	if m.updatePostFn != nil {
		return m.updatePostFn(ctx, input)
	}
	return nil, nil
}

func (m *mockPostRepo) DeletePost(ctx context.Context, postID string) error {
	if m.deletePostFn != nil {
		return m.deletePostFn(ctx, postID)
	}
	return nil
}

func (m *mockPostRepo) CreatePendingMedia(ctx context.Context, uploaderID string, objectKey string, fileType domain.PostMediaType, fileName string, fileSize int64, mimeType string) (*domain.PostMediaAttachment, error) {
	if m.createPendingMediaFn != nil {
		return m.createPendingMediaFn(ctx, uploaderID, objectKey, fileType, fileName, fileSize, mimeType)
	}
	return &domain.PostMediaAttachment{
		ID:         uuid.NewString(),
		FileURL:    "/api/v1/posts/media/test",
		FileType:   fileType,
		FileName:   fileName,
		FileSize:   fileSize,
		MimeType:   mimeType,
		Position:   0,
		ObjectKey:  objectKey,
		UploaderID: uploaderID,
	}, nil
}

func (m *mockPostRepo) GetMediaByID(ctx context.Context, mediaID string) (*domain.PostMediaAttachment, error) {
	if m.getMediaByIDFn != nil {
		return m.getMediaByIDFn(ctx, mediaID)
	}
	return nil, domain.ErrPostMediaNotFound
}

func (m *mockPostRepo) GetMediaByIDs(ctx context.Context, mediaIDs []string) ([]domain.PostMediaAttachment, error) {
	if m.getMediaByIDsFn != nil {
		return m.getMediaByIDsFn(ctx, mediaIDs)
	}
	return nil, nil
}

func (m *mockPostRepo) DeleteMedia(ctx context.Context, mediaID string) (string, error) {
	if m.deleteMediaFn != nil {
		return m.deleteMediaFn(ctx, mediaID)
	}
	return "", nil
}

func (m *mockPostRepo) SetPostReaction(ctx context.Context, postID string, userID string, reaction *domain.ReactionType) (*domain.ReactionSummary, *domain.ReactionType, error) {
	if m.setPostReactionFn != nil {
		return m.setPostReactionFn(ctx, postID, userID, reaction)
	}
	return nil, nil, nil
}

func (m *mockPostRepo) SetCommentReaction(ctx context.Context, commentID string, userID string, reaction *domain.ReactionType) (*domain.ReactionSummary, *domain.ReactionType, error) {
	if m.setCommentReactionFn != nil {
		return m.setCommentReactionFn(ctx, commentID, userID, reaction)
	}
	return nil, nil, nil
}

func (m *mockPostRepo) CreateComment(ctx context.Context, input domain.CreateCommentInput) (*domain.PostComment, error) {
	if m.createCommentFn != nil {
		return m.createCommentFn(ctx, input)
	}
	return nil, nil
}

func (m *mockPostRepo) DeleteComment(ctx context.Context, commentID string) (string, int, error) {
	if m.deleteCommentFn != nil {
		return m.deleteCommentFn(ctx, commentID)
	}
	return "", 0, nil
}

func (m *mockPostRepo) GetCommentByID(ctx context.Context, commentID string) (*domain.PostComment, error) {
	if m.getCommentByIDFn != nil {
		return m.getCommentByIDFn(ctx, commentID)
	}
	return nil, nil
}

func (m *mockPostRepo) CreateNotification(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error) {
	if m.createNotificationFn != nil {
		return m.createNotificationFn(ctx, input)
	}
	return nil, nil
}

func (m *mockPostRepo) DeleteUnreadNotificationByGroupKey(ctx context.Context, recipientID, groupKey string) error {
	if m.deleteUnreadNotificationByGroupKeyFn != nil {
		return m.deleteUnreadNotificationByGroupKeyFn(ctx, recipientID, groupKey)
	}
	return nil
}

func (m *mockPostRepo) SyncUnreadReactionNotification(ctx context.Context, recipientID, groupKey string, postID, commentID *string) (*domain.NotificationItem, error) {
	if m.syncUnreadReactionNotificationFn != nil {
		return m.syncUnreadReactionNotificationFn(ctx, recipientID, groupKey, postID, commentID)
	}
	return nil, nil
}

func (m *mockPostRepo) ListNotifications(ctx context.Context, recipientID string, limit, offset int) (*domain.NotificationsListResult, error) {
	if m.listNotificationsFn != nil {
		return m.listNotificationsFn(ctx, recipientID, limit, offset)
	}
	return nil, nil
}

func (m *mockPostRepo) MarkNotificationRead(ctx context.Context, notificationID string, recipientID string) (*domain.NotificationItem, error) {
	if m.markNotificationReadFn != nil {
		return m.markNotificationReadFn(ctx, notificationID, recipientID)
	}
	return nil, nil
}

func (m *mockPostRepo) MarkAllNotificationsRead(ctx context.Context, recipientID string) error {
	if m.markAllNotificationsReadFn != nil {
		return m.markAllNotificationsReadFn(ctx, recipientID)
	}
	return nil
}

func (m *mockPostRepo) GetUnreadNotificationCount(ctx context.Context, recipientID string) (int, error) {
	if m.getUnreadNotificationCountFn != nil {
		return m.getUnreadNotificationCountFn(ctx, recipientID)
	}
	return 0, nil
}

type mockBroadcaster struct {
	broadcastFn func(ctx context.Context, recipientID string, notification *domain.NotificationItem) error
	calls       []struct {
		recipientID  string
		notification *domain.NotificationItem
	}
}

func (b *mockBroadcaster) BroadcastNotification(ctx context.Context, recipientID string, notification *domain.NotificationItem) error {
	b.calls = append(b.calls, struct {
		recipientID  string
		notification *domain.NotificationItem
	}{recipientID: recipientID, notification: notification})
	if b.broadcastFn != nil {
		return b.broadcastFn(ctx, recipientID, notification)
	}
	return nil
}

var _ domain.NotificationBroadcaster = (*mockBroadcaster)(nil)

type mockCatalogRepo struct {
	getProductByIDFn            func(ctx context.Context, id string) (*domain.Product, error)
	countActiveProductsByIDsFn  func(ctx context.Context, ids []string) (int, error)
}

func (m *mockCatalogRepo) CountActiveProductsByIDs(ctx context.Context, ids []string) (int, error) {
	if m.countActiveProductsByIDsFn != nil {
		return m.countActiveProductsByIDsFn(ctx, ids)
	}
	count := 0
	for _, id := range ids {
		prod, err := m.GetProductByID(ctx, id)
		if err != nil {
			return 0, err
		}
		if prod != nil && prod.Active {
			count++
		}
	}
	return count, nil
}

func (m *mockCatalogRepo) ListCategories(ctx context.Context) ([]domain.Category, error) {
	return nil, nil
}
func (m *mockCatalogRepo) ListBrands(ctx context.Context) ([]string, error) { return nil, nil }
func (m *mockCatalogRepo) ListProducts(ctx context.Context, f domain.ProductFilter) ([]domain.Product, error) {
	return nil, nil
}
func (m *mockCatalogRepo) ListFeaturedProducts(ctx context.Context) ([]domain.Product, error) {
	return nil, nil
}
func (m *mockCatalogRepo) GetProductByID(ctx context.Context, id string) (*domain.Product, error) {
	if m.getProductByIDFn != nil {
		return m.getProductByIDFn(ctx, id)
	}
	return &domain.Product{ID: id, Active: true, Name: "Test Product"}, nil
}
func (m *mockCatalogRepo) ListAdminProducts(ctx context.Context, query string) ([]domain.Product, error) {
	return nil, nil
}
func (m *mockCatalogRepo) GetAdminProductByID(ctx context.Context, id string) (*domain.Product, error) {
	return m.GetProductByID(ctx, id)
}
func (m *mockCatalogRepo) CreateProduct(ctx context.Context, input domain.SaveProductInput) (*domain.Product, error) {
	return nil, nil
}
func (m *mockCatalogRepo) UpdateProduct(ctx context.Context, id string, input domain.SaveProductInput) (*domain.Product, error) {
	return nil, nil
}
func (m *mockCatalogRepo) DeleteProduct(ctx context.Context, id string) error { return nil }
func (m *mockCatalogRepo) GetCategoryByID(ctx context.Context, id string) (*domain.Category, error) {
	return nil, nil
}
func (m *mockCatalogRepo) ListAdminCategories(ctx context.Context) ([]domain.Category, error) {
	return nil, nil
}
func (m *mockCatalogRepo) CreateCategory(ctx context.Context, name string) (*domain.Category, error) {
	return nil, nil
}
func (m *mockCatalogRepo) UpdateCategory(ctx context.Context, id, name string) (*domain.Category, error) {
	return nil, nil
}
func (m *mockCatalogRepo) DeleteCategory(ctx context.Context, id string) (*domain.Category, error) {
	return nil, nil
}

type spyMediaStore struct {
	*chatmedia.FakeStore
	getObjectCalls      int
	getObjectRangeCalls int
}

func newSpyMediaStore() *spyMediaStore {
	return &spyMediaStore{
		FakeStore: chatmedia.NewFakeStore(),
	}
}

func (s *spyMediaStore) GetObject(ctx context.Context, objectKey string) (io.ReadCloser, error) {
	s.getObjectCalls++
	return s.FakeStore.GetObject(ctx, objectKey)
}

func (s *spyMediaStore) GetObjectRange(ctx context.Context, objectKey string, start, length int64) (io.ReadCloser, error) {
	s.getObjectRangeCalls++
	return s.FakeStore.GetObjectRange(ctx, objectKey, start, length)
}

// ============================================================================
// Media Upload Tests
// ============================================================================

func TestUseCase_UploadMedia(t *testing.T) {
	ctx := context.Background()
	adminID := uuid.NewString()

	t.Run("successful image upload (JPEG with jpg normalization)", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockPostRepo{}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		content := []byte("fake-jpeg-image-bytes")
		attachment, err := uc.UploadMedia(ctx, adminID, "photo.jpg", bytes.NewReader(content), int64(len(content)), "image/jpg")
		require.NoError(t, err)
		assert.NotEmpty(t, attachment.ID)
		assert.Equal(t, domain.PostMediaTypeImage, attachment.FileType)
		assert.Equal(t, "image/jpeg", attachment.MimeType)
		assert.Equal(t, "photo.jpg", attachment.FileName)
		assert.Equal(t, int64(len(content)), attachment.FileSize)
		assert.Equal(t, 1, fakeStore.ObjectCount())
	})

	t.Run("successful image upload for all valid image MIME types", func(t *testing.T) {
		validMimes := []struct {
			mime string
			name string
		}{
			{"image/jpeg", "test.jpeg"},
			{"image/png", "test.png"},
			{"image/webp", "test.webp"},
			{"image/gif", "test.gif"},
		}

		for _, tc := range validMimes {
			t.Run(tc.mime, func(t *testing.T) {
				fakeStore := chatmedia.NewFakeStore()
				repo := &mockPostRepo{}
				catRepo := &mockCatalogRepo{}
				uc := postuc.New(repo, catRepo, fakeStore)

				data := []byte("test-content")
				att, err := uc.UploadMedia(ctx, adminID, tc.name, bytes.NewReader(data), int64(len(data)), tc.mime)
				require.NoError(t, err)
				assert.Equal(t, domain.PostMediaTypeImage, att.FileType)
				assert.Equal(t, tc.mime, att.MimeType)
			})
		}
	})

	t.Run("successful video upload for all valid video MIME types", func(t *testing.T) {
		validMimes := []struct {
			mime string
			name string
		}{
			{"video/mp4", "test.mp4"},
			{"video/webm", "test.webm"},
		}

		for _, tc := range validMimes {
			t.Run(tc.mime, func(t *testing.T) {
				fakeStore := chatmedia.NewFakeStore()
				repo := &mockPostRepo{}
				catRepo := &mockCatalogRepo{}
				uc := postuc.New(repo, catRepo, fakeStore)

				data := []byte("video-data")
				att, err := uc.UploadMedia(ctx, adminID, tc.name, bytes.NewReader(data), int64(len(data)), tc.mime)
				require.NoError(t, err)
				assert.Equal(t, domain.PostMediaTypeVideo, att.FileType)
				assert.Equal(t, tc.mime, att.MimeType)
			})
		}
	})

	t.Run("unsupported MIME types rejected", func(t *testing.T) {
		unsupported := []string{"application/pdf", "text/plain", "image/bmp", "video/avi", "application/octet-stream"}
		for _, mime := range unsupported {
			t.Run(mime, func(t *testing.T) {
				fakeStore := chatmedia.NewFakeStore()
				repo := &mockPostRepo{}
				catRepo := &mockCatalogRepo{}
				uc := postuc.New(repo, catRepo, fakeStore)

				_, err := uc.UploadMedia(ctx, adminID, "file.bin", strings.NewReader("dummy"), 5, mime)
				require.Error(t, err)
				var valErr *domain.ValidationError
				require.True(t, errors.As(err, &valErr))
				assert.Contains(t, valErr.Fields, "file_type")
				assert.Equal(t, 0, fakeStore.ObjectCount())
			})
		}
	})

	t.Run("image size exceeding 10MB rejected", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockPostRepo{}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		tooBig := domain.MaxImageSizeBytes + 1
		_, err := uc.UploadMedia(ctx, adminID, "large.png", strings.NewReader(""), tooBig, "image/png")
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "file")
		assert.Equal(t, 0, fakeStore.ObjectCount())
	})

	t.Run("video size exceeding 50MB rejected", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockPostRepo{}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		tooBig := domain.MaxVideoSizeBytes + 1
		_, err := uc.UploadMedia(ctx, adminID, "large.mp4", strings.NewReader(""), tooBig, "video/mp4")
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "file")
		assert.Equal(t, 0, fakeStore.ObjectCount())
	})

	t.Run("zero or negative size rejected", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockPostRepo{}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		_, err := uc.UploadMedia(ctx, adminID, "zero.png", strings.NewReader(""), 0, "image/png")
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "file")

		_, err = uc.UploadMedia(ctx, adminID, "neg.png", strings.NewReader(""), -5, "image/png")
		require.Error(t, err)
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "file")
	})

	t.Run("empty adminID rejected", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockPostRepo{}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		_, err := uc.UploadMedia(ctx, "", "file.png", strings.NewReader("data"), 4, "image/png")
		require.ErrorIs(t, err, domain.ErrInvalidToken)
	})
}

// ============================================================================
// Media Streaming Tests
// ============================================================================

func TestUseCase_GetMediaStream(t *testing.T) {
	ctx := context.Background()

	t.Run("invalid UUID returns ErrPostMediaNotFound", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockPostRepo{}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		_, _, _, err := uc.GetMediaStream(ctx, "not-a-uuid", 0, 0)
		require.ErrorIs(t, err, domain.ErrPostMediaNotFound)
	})

	t.Run("media not found returns ErrPostMediaNotFound", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockPostRepo{
			getMediaByIDFn: func(ctx context.Context, mediaID string) (*domain.PostMediaAttachment, error) {
				return nil, domain.ErrPostMediaNotFound
			},
		}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		_, _, _, err := uc.GetMediaStream(ctx, uuid.NewString(), 0, 0)
		require.ErrorIs(t, err, domain.ErrPostMediaNotFound)
	})

	t.Run("regular stream returns full content", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		mediaID := uuid.NewString()
		objectKey := "posts/" + mediaID + "/image.jpg"
		content := []byte("full-image-bytes")
		require.NoError(t, fakeStore.PutObject(ctx, objectKey, bytes.NewReader(content), int64(len(content)), "image/jpeg"))

		repo := &mockPostRepo{
			getMediaByIDFn: func(ctx context.Context, id string) (*domain.PostMediaAttachment, error) {
				return &domain.PostMediaAttachment{
					ID:        mediaID,
					ObjectKey: objectKey,
					FileSize:  int64(len(content)),
					MimeType:  "image/jpeg",
					FileType:  domain.PostMediaTypeImage,
				}, nil
			},
		}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		stream, att, length, err := uc.GetMediaStream(ctx, mediaID, 0, 0)
		require.NoError(t, err)
		defer stream.Close()

		data, err := io.ReadAll(stream)
		require.NoError(t, err)
		assert.Equal(t, content, data)
		assert.Equal(t, int64(len(content)), length)
		assert.Equal(t, mediaID, att.ID)
	})

	t.Run("range stream returns byte slice", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		mediaID := uuid.NewString()
		objectKey := "posts/" + mediaID + "/video.mp4"
		content := []byte("0123456789abcdefghij")
		require.NoError(t, fakeStore.PutObject(ctx, objectKey, bytes.NewReader(content), int64(len(content)), "video/mp4"))

		repo := &mockPostRepo{
			getMediaByIDFn: func(ctx context.Context, id string) (*domain.PostMediaAttachment, error) {
				return &domain.PostMediaAttachment{
					ID:        mediaID,
					ObjectKey: objectKey,
					FileSize:  int64(len(content)),
					MimeType:  "video/mp4",
					FileType:  domain.PostMediaTypeVideo,
				}, nil
			},
		}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		stream, att, length, err := uc.GetMediaStream(ctx, mediaID, 5, 5)
		require.NoError(t, err)
		defer stream.Close()

		data, err := io.ReadAll(stream)
		require.NoError(t, err)
		assert.Equal(t, []byte("56789"), data)
		assert.Equal(t, int64(5), length)
		assert.Equal(t, mediaID, att.ID)
	})

	t.Run("metadata only stream when length < 0 does not call GetObject or GetObjectRange", func(t *testing.T) {
		spyStore := newSpyMediaStore()
		mediaID := uuid.NewString()
		objectKey := "posts/" + mediaID + "/video.mp4"
		content := []byte("0123456789abcdefghij")
		require.NoError(t, spyStore.PutObject(ctx, objectKey, bytes.NewReader(content), int64(len(content)), "video/mp4"))

		repo := &mockPostRepo{
			getMediaByIDFn: func(ctx context.Context, id string) (*domain.PostMediaAttachment, error) {
				return &domain.PostMediaAttachment{
					ID:        mediaID,
					ObjectKey: objectKey,
					FileSize:  int64(len(content)),
					MimeType:  "video/mp4",
					FileType:  domain.PostMediaTypeVideo,
				}, nil
			},
		}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, spyStore)

		stream, att, length, err := uc.GetMediaStream(ctx, mediaID, 0, -1)
		require.NoError(t, err)
		assert.Nil(t, stream)
		assert.Equal(t, mediaID, att.ID)
		assert.Equal(t, int64(len(content)), length)
		assert.Equal(t, 0, spyStore.getObjectCalls)
		assert.Equal(t, 0, spyStore.getObjectRangeCalls)
	})
}

// ============================================================================
// Post CRUD Tests
// ============================================================================

func TestUseCase_CreatePost(t *testing.T) {
	ctx := context.Background()
	adminID := uuid.NewString()
	prodID1 := uuid.NewString()
	prodID2 := uuid.NewString()

	t.Run("empty or whitespace content rejected", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockPostRepo{}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		_, err := uc.CreatePost(ctx, adminID, domain.CreatePostRequest{
			Content:            "   ",
			ReferredProductIDs: []string{prodID1},
		})
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "content")
	})

	t.Run("content exceeding 5000 characters rejected", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockPostRepo{}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		longContent := strings.Repeat("a", 5001)
		_, err := uc.CreatePost(ctx, adminID, domain.CreatePostRequest{
			Content:            longContent,
			ReferredProductIDs: []string{prodID1},
		})
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "content")
	})

	t.Run("empty referred products rejected", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockPostRepo{}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		_, err := uc.CreatePost(ctx, adminID, domain.CreatePostRequest{
			Content:            "Valid content",
			ReferredProductIDs: []string{},
		})
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "referredProductIds")
	})

	t.Run("referred products exceeding 10 rejected", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockPostRepo{}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		var ids []string
		for i := 0; i < 11; i++ {
			ids = append(ids, uuid.NewString())
		}
		_, err := uc.CreatePost(ctx, adminID, domain.CreatePostRequest{
			Content:            "Valid content",
			ReferredProductIDs: ids,
		})
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "referredProductIds")
	})

	t.Run("invalid UUID in referred products returns ErrProductNotFound", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockPostRepo{}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		_, err := uc.CreatePost(ctx, adminID, domain.CreatePostRequest{
			Content:            "Valid content",
			ReferredProductIDs: []string{"invalid-uuid"},
		})
		require.ErrorIs(t, err, domain.ErrProductNotFound)
	})

	t.Run("inactive or non-existent referred product returns ErrProductNotFound", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockPostRepo{}
		catRepo := &mockCatalogRepo{
			getProductByIDFn: func(ctx context.Context, id string) (*domain.Product, error) {
				return nil, domain.ErrProductNotFound
			},
		}
		uc := postuc.New(repo, catRepo, fakeStore)

		_, err := uc.CreatePost(ctx, adminID, domain.CreatePostRequest{
			Content:            "Valid content",
			ReferredProductIDs: []string{prodID1},
		})
		require.ErrorIs(t, err, domain.ErrProductNotFound)
	})

	t.Run("media exceeding 10 items rejected", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockPostRepo{}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		var mediaIDs []string
		for i := 0; i < 11; i++ {
			mediaIDs = append(mediaIDs, uuid.NewString())
		}
		_, err := uc.CreatePost(ctx, adminID, domain.CreatePostRequest{
			Content:            "Valid content",
			ReferredProductIDs: []string{prodID1},
			MediaIDs:           mediaIDs,
		})
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "mediaIds")
	})

	t.Run("media belonging to another uploader or already attached rejected", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		mediaID := uuid.NewString()
		otherAdminID := uuid.NewString()

		repo := &mockPostRepo{
			getMediaByIDsFn: func(ctx context.Context, ids []string) ([]domain.PostMediaAttachment, error) {
				return []domain.PostMediaAttachment{
					{
						ID:         mediaID,
						UploaderID: otherAdminID, // different uploader
					},
				}, nil
			},
		}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		_, err := uc.CreatePost(ctx, adminID, domain.CreatePostRequest{
			Content:            "Valid content",
			ReferredProductIDs: []string{prodID1},
			MediaIDs:           []string{mediaID},
		})
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "mediaIds")
	})

	t.Run("successful post creation", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		mediaID := uuid.NewString()

		repo := &mockPostRepo{
			getMediaByIDsFn: func(ctx context.Context, ids []string) ([]domain.PostMediaAttachment, error) {
				return []domain.PostMediaAttachment{
					{
						ID:         mediaID,
						UploaderID: adminID,
						PostID:     nil,
					},
				}, nil
			},
			createPostFn: func(ctx context.Context, input domain.CreatePostInput) (*domain.PostDetail, error) {
				assert.Equal(t, adminID, input.AuthorID)
				assert.Equal(t, "Great smartphone review", input.Content)
				assert.Equal(t, []string{prodID1, prodID2}, input.ReferredProductIDs)
				assert.Equal(t, []string{mediaID}, input.MediaIDs)

				return &domain.PostDetail{
					PostItem: domain.PostItem{
						ID:         uuid.NewString(),
						AuthorID:   adminID,
						AuthorName: "Quản trị viên",
						AuthorRole: "admin",
						Content:    input.Content,
						CreatedAt:  time.Now(),
						UpdatedAt:  time.Now(),
					},
				}, nil
			},
		}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		detail, err := uc.CreatePost(ctx, adminID, domain.CreatePostRequest{
			Content:            "Great smartphone review",
			ReferredProductIDs: []string{prodID1, prodID2},
			MediaIDs:           []string{mediaID},
		})
		require.NoError(t, err)
		assert.NotEmpty(t, detail.ID)
		assert.Equal(t, "Great smartphone review", detail.Content)
	})

	t.Run("validates referred products in a single batch call via CountActiveProductsByIDs", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		batchCalls := 0
		singleGetCalls := 0
		catRepo := &mockCatalogRepo{
			countActiveProductsByIDsFn: func(ctx context.Context, ids []string) (int, error) {
				batchCalls++
				assert.Equal(t, []string{prodID1, prodID2}, ids)
				return len(ids), nil
			},
			getProductByIDFn: func(ctx context.Context, id string) (*domain.Product, error) {
				singleGetCalls++
				return &domain.Product{ID: id, Active: true}, nil
			},
		}
		repo := &mockPostRepo{
			createPostFn: func(ctx context.Context, input domain.CreatePostInput) (*domain.PostDetail, error) {
				return &domain.PostDetail{PostItem: domain.PostItem{ID: uuid.NewString()}}, nil
			},
		}
		uc := postuc.New(repo, catRepo, fakeStore)

		_, err := uc.CreatePost(ctx, adminID, domain.CreatePostRequest{
			Content:            "Batch check review",
			ReferredProductIDs: []string{prodID1, prodID2, prodID1},
		})
		require.NoError(t, err)
		assert.Equal(t, 1, batchCalls)
		assert.Equal(t, 0, singleGetCalls)
	})
}

func TestUseCase_UpdatePost(t *testing.T) {
	ctx := context.Background()
	adminID := uuid.NewString()
	postID := uuid.NewString()
	prodID := uuid.NewString()
	oldMediaID := uuid.NewString()
	newMediaID := uuid.NewString()

	t.Run("post not found returns ErrPostNotFound", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, postID string, viewerUserID *string) (*domain.PostDetail, error) {
				return nil, domain.ErrPostNotFound
			},
		}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		_, err := uc.UpdatePost(ctx, adminID, postID, domain.UpdatePostRequest{
			Content:            "Updated content",
			ReferredProductIDs: []string{prodID},
		})
		require.ErrorIs(t, err, domain.ErrPostNotFound)
	})

	t.Run("successful update cleans up detached media", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		oldObjKey := "posts/" + oldMediaID + "/old.png"
		require.NoError(t, fakeStore.PutObject(ctx, oldObjKey, strings.NewReader("old"), 3, "image/png"))

		existingPost := &domain.PostDetail{
			PostItem: domain.PostItem{
				ID:       postID,
				AuthorID: adminID,
				Content:  "Old content",
				Media: []domain.PostMediaAttachment{
					{
						ID:        oldMediaID,
						ObjectKey: oldObjKey,
					},
				},
			},
		}

		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return existingPost, nil
			},
			getMediaByIDsFn: func(ctx context.Context, ids []string) ([]domain.PostMediaAttachment, error) {
				return []domain.PostMediaAttachment{
					{
						ID:         newMediaID,
						UploaderID: adminID,
						PostID:     nil,
					},
				}, nil
			},
			updatePostFn: func(ctx context.Context, input domain.UpdatePostInput) (*domain.PostDetail, error) {
				assert.Equal(t, postID, input.PostID)
				assert.Equal(t, "Updated content", input.Content)
				assert.Equal(t, []string{newMediaID}, input.MediaIDs)
				return &domain.PostDetail{
					PostItem: domain.PostItem{
						ID:      postID,
						Content: input.Content,
					},
				}, nil
			},
		}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		updated, err := uc.UpdatePost(ctx, adminID, postID, domain.UpdatePostRequest{
			Content:            "Updated content",
			ReferredProductIDs: []string{prodID},
			MediaIDs:           []string{newMediaID},
		})
		require.NoError(t, err)
		assert.Equal(t, "Updated content", updated.Content)
		// Old object should be removed from fake store
		assert.Equal(t, 0, fakeStore.ObjectCount())
	})
}

func TestUseCase_DeletePost(t *testing.T) {
	ctx := context.Background()
	adminID := uuid.NewString()
	postID := uuid.NewString()
	mediaID := uuid.NewString()
	objKey := "posts/" + mediaID + "/photo.jpg"

	t.Run("post not found returns ErrPostNotFound", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return nil, domain.ErrPostNotFound
			},
		}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		err := uc.DeletePost(ctx, adminID, postID)
		require.ErrorIs(t, err, domain.ErrPostNotFound)
	})

	t.Run("successful deletion removes media from store", func(t *testing.T) {
		fakeStore := chatmedia.NewFakeStore()
		require.NoError(t, fakeStore.PutObject(ctx, objKey, strings.NewReader("data"), 4, "image/jpeg"))

		existingPost := &domain.PostDetail{
			PostItem: domain.PostItem{
				ID:       postID,
				AuthorID: adminID,
				Media: []domain.PostMediaAttachment{
					{
						ID:        mediaID,
						ObjectKey: objKey,
					},
				},
			},
		}

		deleteCalled := false
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return existingPost, nil
			},
			deletePostFn: func(ctx context.Context, id string) error {
				assert.Equal(t, postID, id)
				deleteCalled = true
				return nil
			},
		}
		catRepo := &mockCatalogRepo{}
		uc := postuc.New(repo, catRepo, fakeStore)

		err := uc.DeletePost(ctx, adminID, postID)
		require.NoError(t, err)
		assert.True(t, deleteCalled)
		assert.Equal(t, 0, fakeStore.ObjectCount())
	})
}

// ============================================================================
// Public & Interaction Tests
// ============================================================================

func TestUseCase_ListPosts(t *testing.T) {
	ctx := context.Background()

	t.Run("default pagination parameters and totalPages calculation", func(t *testing.T) {
		repo := &mockPostRepo{
			listPostsFn: func(ctx context.Context, filter domain.ListPostsFilter) ([]domain.PostItem, int, error) {
				assert.Equal(t, 10, filter.Limit)
				assert.Equal(t, 0, filter.Offset)
				return []domain.PostItem{
					{ID: uuid.NewString(), Content: "Post 1"},
					{ID: uuid.NewString(), Content: "Post 2"},
				}, 25, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore())

		items, total, totalPages, err := uc.ListPosts(ctx, nil, 0, 0)
		require.NoError(t, err)
		assert.Len(t, items, 2)
		assert.Equal(t, 25, total)
		assert.Equal(t, 3, totalPages) // 25 items with limit 10 = 3 pages
	})

	t.Run("custom page and limit with viewerUserID", func(t *testing.T) {
		viewerID := uuid.NewString()
		repo := &mockPostRepo{
			listPostsFn: func(ctx context.Context, filter domain.ListPostsFilter) ([]domain.PostItem, int, error) {
				assert.Equal(t, 5, filter.Limit)
				assert.Equal(t, 5, filter.Offset) // page 2, limit 5 -> offset 5
				require.NotNil(t, filter.ViewerUserID)
				assert.Equal(t, viewerID, *filter.ViewerUserID)
				return []domain.PostItem{}, 10, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore())

		items, total, totalPages, err := uc.ListPosts(ctx, &viewerID, 2, 5)
		require.NoError(t, err)
		assert.Empty(t, items)
		assert.Equal(t, 10, total)
		assert.Equal(t, 2, totalPages)
	})
}

func TestUseCase_GetPostByID(t *testing.T) {
	ctx := context.Background()

	t.Run("invalid UUID returns ErrPostNotFound", func(t *testing.T) {
		uc := postuc.New(&mockPostRepo{}, &mockCatalogRepo{}, chatmedia.NewFakeStore())
		_, err := uc.GetPostByID(ctx, nil, "not-a-uuid")
		require.ErrorIs(t, err, domain.ErrPostNotFound)
	})

	t.Run("valid UUID returns post detail", func(t *testing.T) {
		postID := uuid.NewString()
		expected := &domain.PostDetail{
			PostItem: domain.PostItem{
				ID:      postID,
				Content: "Hello world",
			},
		}
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				assert.Equal(t, postID, id)
				return expected, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore())

		post, err := uc.GetPostByID(ctx, nil, postID)
		require.NoError(t, err)
		assert.Equal(t, expected, post)
	})
}

func TestUseCase_ReactToPost(t *testing.T) {
	ctx := context.Background()
	adminID := uuid.NewString()
	customerID := uuid.NewString()
	postID := uuid.NewString()

	t.Run("invalid reaction returns validation_error", func(t *testing.T) {
		uc := postuc.New(&mockPostRepo{}, &mockCatalogRepo{}, chatmedia.NewFakeStore())
		invalidRx := domain.ReactionType("thumbs_up") // not in 6 supported reactions
		_, err := uc.ReactToPost(ctx, customerID, postID, &invalidRx)
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "reaction")
	})

	t.Run("post not found returns ErrPostNotFound", func(t *testing.T) {
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return nil, domain.ErrPostNotFound
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore())
		rx := domain.ReactionTypeLike
		_, err := uc.ReactToPost(ctx, customerID, postID, &rx)
		require.ErrorIs(t, err, domain.ErrPostNotFound)
	})

	t.Run("author reacting to own post does not trigger notification", func(t *testing.T) {
		broadcaster := &mockBroadcaster{}
		notifCreated := false
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return &domain.PostDetail{
					PostItem: domain.PostItem{ID: postID, AuthorID: adminID},
				}, nil
			},
			setPostReactionFn: func(ctx context.Context, pID string, uID string, reaction *domain.ReactionType) (*domain.ReactionSummary, *domain.ReactionType, error) {
				return &domain.ReactionSummary{TotalCount: 1, ViewerReaction: reaction}, nil, nil
			},
			createNotificationFn: func(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error) {
				notifCreated = true
				return nil, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore(), postuc.WithBroadcaster(broadcaster))

		rx := domain.ReactionTypeLike
		summary, err := uc.ReactToPost(ctx, adminID, postID, &rx)
		require.NoError(t, err)
		assert.NotNil(t, summary)
		assert.False(t, notifCreated, "author reacting to own post should not create notification")
		assert.Empty(t, broadcaster.calls)
	})

	t.Run("customer reacting to post triggers notification and WS broadcast", func(t *testing.T) {
		broadcaster := &mockBroadcaster{}
		var createdNotifInput domain.CreateNotificationInput
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return &domain.PostDetail{
					PostItem: domain.PostItem{ID: postID, AuthorID: adminID, Content: "Post Content"},
				}, nil
			},
			setPostReactionFn: func(ctx context.Context, pID string, uID string, reaction *domain.ReactionType) (*domain.ReactionSummary, *domain.ReactionType, error) {
				return &domain.ReactionSummary{TotalCount: 1, ViewerReaction: reaction}, nil, nil
			},
			createNotificationFn: func(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error) {
				createdNotifInput = input
				return &domain.NotificationItem{
					ID:               "notif-1",
					RecipientID:      input.RecipientID,
					Category:         input.Category,
					NotificationType: input.NotificationType,
				}, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore(), postuc.WithBroadcaster(broadcaster))

		rx := domain.ReactionTypeLove
		summary, err := uc.ReactToPost(ctx, customerID, postID, &rx)
		require.NoError(t, err)
		assert.NotNil(t, summary)
		assert.Equal(t, adminID, createdNotifInput.RecipientID)
		assert.Equal(t, domain.NotificationGroupKeyPostReaction(postID), createdNotifInput.GroupKey)
		assert.Equal(t, domain.NotificationCategoryPost, createdNotifInput.Category)
		assert.Equal(t, domain.NotificationTypePostReaction, createdNotifInput.NotificationType)
		assert.Equal(t, &rx, createdNotifInput.ReactionType)
		require.Len(t, broadcaster.calls, 1)
		assert.Equal(t, adminID, broadcaster.calls[0].recipientID)
	})

	t.Run("multi-actor post reactions roll up into unread notification and broadcast updated actorCount", func(t *testing.T) {
		broadcaster := &mockBroadcaster{}
		customer2ID := uuid.NewString()
		var recordedInputs []domain.CreateNotificationInput

		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return &domain.PostDetail{
					PostItem: domain.PostItem{ID: postID, AuthorID: adminID, Content: "Post Content"},
				}, nil
			},
			setPostReactionFn: func(ctx context.Context, pID string, uID string, reaction *domain.ReactionType) (*domain.ReactionSummary, *domain.ReactionType, error) {
				return &domain.ReactionSummary{TotalCount: len(recordedInputs) + 1, ViewerReaction: reaction}, nil, nil
			},
			createNotificationFn: func(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error) {
				recordedInputs = append(recordedInputs, input)
				count := len(recordedInputs)
				return &domain.NotificationItem{
					ID:               "notif-rollup-1",
					RecipientID:      input.RecipientID,
					ActorID:          input.ActorID,
					GroupKey:         input.GroupKey,
					ActorCount:       count,
					Category:         input.Category,
					NotificationType: input.NotificationType,
					PostID:           input.PostID,
					ReactionType:     input.ReactionType,
					Metadata: map[string]interface{}{
						"recentActors": []domain.NotificationActorSummary{
							{ID: *input.ActorID, Name: "Customer", Role: "customer"},
						},
					},
				}, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore(), postuc.WithBroadcaster(broadcaster))

		rx1 := domain.ReactionTypeLike
		_, err := uc.ReactToPost(ctx, customerID, postID, &rx1)
		require.NoError(t, err)

		rx2 := domain.ReactionTypeLove
		_, err = uc.ReactToPost(ctx, customer2ID, postID, &rx2)
		require.NoError(t, err)

		require.Len(t, recordedInputs, 2)
		expectedGroupKey := domain.NotificationGroupKeyPostReaction(postID)
		assert.Equal(t, expectedGroupKey, recordedInputs[0].GroupKey)
		assert.Equal(t, expectedGroupKey, recordedInputs[1].GroupKey)
		require.Len(t, broadcaster.calls, 2)
		assert.Equal(t, "notif-rollup-1", broadcaster.calls[1].notification.ID)
		assert.Equal(t, 2, broadcaster.calls[1].notification.ActorCount)
		assert.Equal(t, expectedGroupKey, broadcaster.calls[1].notification.GroupKey)
	})

	t.Run("customer repeating identical reaction does not trigger new notification", func(t *testing.T) {
		broadcaster := &mockBroadcaster{}
		notifCreated := false
		rx := domain.ReactionTypeLove
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return &domain.PostDetail{
					PostItem: domain.PostItem{
						ID:       postID,
						AuthorID: adminID,
						Reactions: domain.ReactionSummary{
							ViewerReaction: &rx, // already reacted with love
						},
					},
				}, nil
			},
			setPostReactionFn: func(ctx context.Context, pID string, uID string, reaction *domain.ReactionType) (*domain.ReactionSummary, *domain.ReactionType, error) {
				return &domain.ReactionSummary{TotalCount: 1, ViewerReaction: reaction}, &rx, nil
			},
			createNotificationFn: func(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error) {
				notifCreated = true
				return nil, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore(), postuc.WithBroadcaster(broadcaster))

		_, err := uc.ReactToPost(ctx, customerID, postID, &rx)
		require.NoError(t, err)
		assert.False(t, notifCreated)
		assert.Empty(t, broadcaster.calls)
	})

	t.Run("removing reaction (nil) syncs unread reaction notification and broadcasts retraction when no actors remain", func(t *testing.T) {
		broadcaster := &mockBroadcaster{}
		notifCreated := false
		syncCalled := false
		var syncedRecipient, syncedGroupKey string
		var syncedPostID, syncedCommentID *string
		prevRx := domain.ReactionTypeLove
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return &domain.PostDetail{
					PostItem: domain.PostItem{
						ID:       postID,
						AuthorID: adminID,
						Reactions: domain.ReactionSummary{
							ViewerReaction: &prevRx,
						},
					},
				}, nil
			},
			setPostReactionFn: func(ctx context.Context, pID string, uID string, reaction *domain.ReactionType) (*domain.ReactionSummary, *domain.ReactionType, error) {
				return &domain.ReactionSummary{TotalCount: 0, ViewerReaction: nil}, &prevRx, nil
			},
			createNotificationFn: func(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error) {
				notifCreated = true
				return nil, nil
			},
			syncUnreadReactionNotificationFn: func(ctx context.Context, recipientID, groupKey string, pID, cID *string) (*domain.NotificationItem, error) {
				syncCalled = true
				syncedRecipient = recipientID
				syncedGroupKey = groupKey
				syncedPostID = pID
				syncedCommentID = cID
				return nil, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore(), postuc.WithBroadcaster(broadcaster))

		summary, err := uc.ReactToPost(ctx, customerID, postID, nil)
		require.NoError(t, err)
		assert.NotNil(t, summary)
		assert.False(t, notifCreated)
		assert.True(t, syncCalled, "removing reaction should sync unread reaction notification")
		assert.Equal(t, adminID, syncedRecipient)
		assert.Equal(t, domain.NotificationGroupKeyPostReaction(postID), syncedGroupKey)
		require.NotNil(t, syncedPostID)
		assert.Equal(t, postID, *syncedPostID)
		assert.Nil(t, syncedCommentID)
		require.Len(t, broadcaster.calls, 1)
		assert.Equal(t, adminID, broadcaster.calls[0].recipientID)
		assert.Equal(t, 0, broadcaster.calls[0].notification.ActorCount)
		assert.Equal(t, domain.NotificationGroupKeyPostReaction(postID), broadcaster.calls[0].notification.GroupKey)
	})

	t.Run("removing reaction (nil) broadcasts updated unread notification when other actors remain", func(t *testing.T) {
		broadcaster := &mockBroadcaster{}
		prevRx := domain.ReactionTypeLove
		otherRx := domain.ReactionTypeLike
		otherActorID := uuid.NewString()
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return &domain.PostDetail{
					PostItem: domain.PostItem{
						ID:       postID,
						AuthorID: adminID,
						Reactions: domain.ReactionSummary{
							ViewerReaction: &prevRx,
						},
					},
				}, nil
			},
			setPostReactionFn: func(ctx context.Context, pID string, uID string, reaction *domain.ReactionType) (*domain.ReactionSummary, *domain.ReactionType, error) {
				return &domain.ReactionSummary{TotalCount: 1, ViewerReaction: nil}, &prevRx, nil
			},
			syncUnreadReactionNotificationFn: func(ctx context.Context, recipientID, groupKey string, pID, cID *string) (*domain.NotificationItem, error) {
				return &domain.NotificationItem{
					ID:               "notif-remaining-1",
					RecipientID:      recipientID,
					ActorID:          &otherActorID,
					GroupKey:         groupKey,
					ActorCount:       1,
					Category:         domain.NotificationCategoryPost,
					NotificationType: domain.NotificationTypePostReaction,
					PostID:           pID,
					ReactionType:     &otherRx,
				}, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore(), postuc.WithBroadcaster(broadcaster))

		summary, err := uc.ReactToPost(ctx, customerID, postID, nil)
		require.NoError(t, err)
		assert.NotNil(t, summary)
		require.Len(t, broadcaster.calls, 1)
		assert.Equal(t, adminID, broadcaster.calls[0].recipientID)
		assert.Equal(t, "notif-remaining-1", broadcaster.calls[0].notification.ID)
		assert.Equal(t, 1, broadcaster.calls[0].notification.ActorCount)
	})
}

func TestUseCase_ReactToComment(t *testing.T) {
	ctx := context.Background()
	authorID := uuid.NewString()
	customerID := uuid.NewString()
	postID := uuid.NewString()
	commentID := uuid.NewString()

	t.Run("invalid reaction returns validation error", func(t *testing.T) {
		uc := postuc.New(&mockPostRepo{}, &mockCatalogRepo{}, chatmedia.NewFakeStore())
		badRx := domain.ReactionType("fire")
		_, err := uc.ReactToComment(ctx, customerID, commentID, &badRx)
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
	})

	t.Run("comment not found returns ErrPostCommentNotFound", func(t *testing.T) {
		repo := &mockPostRepo{
			getCommentByIDFn: func(ctx context.Context, id string) (*domain.PostComment, error) {
				return nil, domain.ErrPostCommentNotFound
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore())
		rx := domain.ReactionTypeHaha
		_, err := uc.ReactToComment(ctx, customerID, commentID, &rx)
		require.ErrorIs(t, err, domain.ErrPostCommentNotFound)
	})

	t.Run("author reacting to own comment does not create notification", func(t *testing.T) {
		broadcaster := &mockBroadcaster{}
		notifCreated := false
		repo := &mockPostRepo{
			getCommentByIDFn: func(ctx context.Context, id string) (*domain.PostComment, error) {
				return &domain.PostComment{ID: commentID, PostID: postID, AuthorID: authorID}, nil
			},
			setCommentReactionFn: func(ctx context.Context, cID string, uID string, reaction *domain.ReactionType) (*domain.ReactionSummary, *domain.ReactionType, error) {
				return &domain.ReactionSummary{TotalCount: 1, ViewerReaction: reaction}, nil, nil
			},
			createNotificationFn: func(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error) {
				notifCreated = true
				return nil, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore(), postuc.WithBroadcaster(broadcaster))

		rx := domain.ReactionTypeLike
		_, err := uc.ReactToComment(ctx, authorID, commentID, &rx)
		require.NoError(t, err)
		assert.False(t, notifCreated)
		assert.Empty(t, broadcaster.calls)
	})

	t.Run("customer reacting to another's comment creates notification and broadcasts without querying GetPostByID", func(t *testing.T) {
		broadcaster := &mockBroadcaster{}
		var createdNotifInput domain.CreateNotificationInput
		getPostCalled := false
		repo := &mockPostRepo{
			getCommentByIDFn: func(ctx context.Context, id string) (*domain.PostComment, error) {
				return &domain.PostComment{ID: commentID, PostID: postID, AuthorID: authorID, Content: "Comment text"}, nil
			},
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				getPostCalled = true
				return &domain.PostDetail{PostItem: domain.PostItem{ID: postID}}, nil
			},
			setCommentReactionFn: func(ctx context.Context, cID string, uID string, reaction *domain.ReactionType) (*domain.ReactionSummary, *domain.ReactionType, error) {
				return &domain.ReactionSummary{TotalCount: 1, ViewerReaction: reaction}, nil, nil
			},
			createNotificationFn: func(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error) {
				createdNotifInput = input
				return &domain.NotificationItem{
					ID:               "notif-2",
					RecipientID:      input.RecipientID,
					Category:         input.Category,
					NotificationType: input.NotificationType,
				}, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore(), postuc.WithBroadcaster(broadcaster))

		rx := domain.ReactionTypeWow
		summary, err := uc.ReactToComment(ctx, customerID, commentID, &rx)
		require.NoError(t, err)
		assert.NotNil(t, summary)
		assert.False(t, getPostCalled, "ReactToComment should not call GetPostByID")
		assert.Equal(t, authorID, createdNotifInput.RecipientID)
		assert.Equal(t, domain.NotificationGroupKeyCommentReaction(commentID), createdNotifInput.GroupKey)
		assert.Equal(t, domain.NotificationTypeCommentReaction, createdNotifInput.NotificationType)
		require.Len(t, broadcaster.calls, 1)
		assert.Equal(t, authorID, broadcaster.calls[0].recipientID)
	})

	t.Run("removing comment reaction (nil) syncs unread reaction notification and broadcasts when actors remain", func(t *testing.T) {
		broadcaster := &mockBroadcaster{}
		prevRx := domain.ReactionTypeWow
		otherRx := domain.ReactionTypeLike
		otherActorID := uuid.NewString()
		syncCalled := false
		var syncedRecipient, syncedGroupKey string
		var syncedPostID, syncedCommentID *string

		repo := &mockPostRepo{
			getCommentByIDFn: func(ctx context.Context, id string) (*domain.PostComment, error) {
				return &domain.PostComment{
					ID:       commentID,
					PostID:   postID,
					AuthorID: authorID,
					Content:  "Comment text",
				}, nil
			},
			setCommentReactionFn: func(ctx context.Context, cID string, uID string, reaction *domain.ReactionType) (*domain.ReactionSummary, *domain.ReactionType, error) {
				return &domain.ReactionSummary{TotalCount: 1, ViewerReaction: nil}, &prevRx, nil
			},
			syncUnreadReactionNotificationFn: func(ctx context.Context, recipientID, groupKey string, pID, cID *string) (*domain.NotificationItem, error) {
				syncCalled = true
				syncedRecipient = recipientID
				syncedGroupKey = groupKey
				syncedPostID = pID
				syncedCommentID = cID
				return &domain.NotificationItem{
					ID:               "notif-comment-remaining-1",
					RecipientID:      recipientID,
					ActorID:          &otherActorID,
					GroupKey:         groupKey,
					ActorCount:       1,
					Category:         domain.NotificationCategoryPost,
					NotificationType: domain.NotificationTypeCommentReaction,
					PostID:           pID,
					CommentID:        cID,
					ReactionType:     &otherRx,
				}, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore(), postuc.WithBroadcaster(broadcaster))

		summary, err := uc.ReactToComment(ctx, customerID, commentID, nil)
		require.NoError(t, err)
		assert.NotNil(t, summary)
		assert.True(t, syncCalled, "removing comment reaction should sync unread reaction notification")
		assert.Equal(t, authorID, syncedRecipient)
		assert.Equal(t, domain.NotificationGroupKeyCommentReaction(commentID), syncedGroupKey)
		require.NotNil(t, syncedPostID)
		assert.Equal(t, postID, *syncedPostID)
		require.NotNil(t, syncedCommentID)
		assert.Equal(t, commentID, *syncedCommentID)
		require.Len(t, broadcaster.calls, 1)
		assert.Equal(t, authorID, broadcaster.calls[0].recipientID)
		assert.Equal(t, "notif-comment-remaining-1", broadcaster.calls[0].notification.ID)
	})

	t.Run("removing comment reaction (nil) broadcasts retraction when no actors remain", func(t *testing.T) {
		broadcaster := &mockBroadcaster{}
		prevRx := domain.ReactionTypeWow

		repo := &mockPostRepo{
			getCommentByIDFn: func(ctx context.Context, id string) (*domain.PostComment, error) {
				return &domain.PostComment{
					ID:       commentID,
					PostID:   postID,
					AuthorID: authorID,
					Content:  "Comment text",
				}, nil
			},
			setCommentReactionFn: func(ctx context.Context, cID string, uID string, reaction *domain.ReactionType) (*domain.ReactionSummary, *domain.ReactionType, error) {
				return &domain.ReactionSummary{TotalCount: 0, ViewerReaction: nil}, &prevRx, nil
			},
			syncUnreadReactionNotificationFn: func(ctx context.Context, recipientID, groupKey string, pID, cID *string) (*domain.NotificationItem, error) {
				return nil, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore(), postuc.WithBroadcaster(broadcaster))

		summary, err := uc.ReactToComment(ctx, customerID, commentID, nil)
		require.NoError(t, err)
		assert.NotNil(t, summary)
		require.Len(t, broadcaster.calls, 1)
		assert.Equal(t, authorID, broadcaster.calls[0].recipientID)
		assert.Equal(t, 0, broadcaster.calls[0].notification.ActorCount)
		assert.Equal(t, domain.NotificationGroupKeyCommentReaction(commentID), broadcaster.calls[0].notification.GroupKey)
	})
}

func TestUseCase_CreateComment(t *testing.T) {
	ctx := context.Background()
	adminID := uuid.NewString()
	customer1ID := uuid.NewString()
	customer2ID := uuid.NewString()
	postID := uuid.NewString()
	rootCommentID := uuid.NewString()

	t.Run("empty content returns validation error", func(t *testing.T) {
		uc := postuc.New(&mockPostRepo{}, &mockCatalogRepo{}, chatmedia.NewFakeStore())
		_, err := uc.CreateComment(ctx, customer1ID, postID, domain.CreateCommentRequest{
			Content: "   ",
		})
		require.Error(t, err)
		var valErr *domain.ValidationError
		require.True(t, errors.As(err, &valErr))
		assert.Contains(t, valErr.Fields, "content")
	})

	t.Run("post not found returns ErrPostNotFound", func(t *testing.T) {
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return nil, domain.ErrPostNotFound
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore())
		_, err := uc.CreateComment(ctx, customer1ID, postID, domain.CreateCommentRequest{
			Content: "Bình luận hay",
		})
		require.ErrorIs(t, err, domain.ErrPostNotFound)
	})

	t.Run("parent comment not found or belongs to another post returns ErrPostCommentNotFound", func(t *testing.T) {
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return &domain.PostDetail{PostItem: domain.PostItem{ID: postID, AuthorID: adminID}}, nil
			},
			getCommentByIDFn: func(ctx context.Context, id string) (*domain.PostComment, error) {
				// belongs to a different post
				return &domain.PostComment{ID: id, PostID: uuid.NewString()}, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore())
		badParentID := uuid.NewString()
		_, err := uc.CreateComment(ctx, customer1ID, postID, domain.CreateCommentRequest{
			Content:         "Phản hồi",
			ParentCommentID: &badParentID,
		})
		require.ErrorIs(t, err, domain.ErrPostCommentNotFound)
	})

	t.Run("top-level comment by author does not create notification", func(t *testing.T) {
		broadcaster := &mockBroadcaster{}
		notifCreated := false
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return &domain.PostDetail{PostItem: domain.PostItem{ID: postID, AuthorID: adminID}}, nil
			},
			createCommentFn: func(ctx context.Context, input domain.CreateCommentInput) (*domain.PostComment, error) {
				return &domain.PostComment{ID: "c-1", PostID: postID, AuthorID: adminID, Content: input.Content}, nil
			},
			createNotificationFn: func(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error) {
				notifCreated = true
				return nil, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore(), postuc.WithBroadcaster(broadcaster))

		comment, err := uc.CreateComment(ctx, adminID, postID, domain.CreateCommentRequest{
			Content: "Admin comment",
		})
		require.NoError(t, err)
		assert.NotNil(t, comment)
		assert.False(t, notifCreated)
		assert.Empty(t, broadcaster.calls)
	})

	t.Run("top-level comment by customer creates notification for Admin", func(t *testing.T) {
		broadcaster := &mockBroadcaster{}
		var createdNotifInput domain.CreateNotificationInput
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return &domain.PostDetail{PostItem: domain.PostItem{ID: postID, AuthorID: adminID}}, nil
			},
			createCommentFn: func(ctx context.Context, input domain.CreateCommentInput) (*domain.PostComment, error) {
				return &domain.PostComment{ID: "c-2", PostID: postID, AuthorID: customer1ID, Content: input.Content}, nil
			},
			createNotificationFn: func(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error) {
				createdNotifInput = input
				return &domain.NotificationItem{
					ID:               "notif-3",
					RecipientID:      input.RecipientID,
					GroupKey:         input.GroupKey,
					ActorCount:       1,
					Category:         input.Category,
					NotificationType: input.NotificationType,
				}, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore(), postuc.WithBroadcaster(broadcaster))

		comment, err := uc.CreateComment(ctx, customer1ID, postID, domain.CreateCommentRequest{
			Content: "Khách hỏi giá",
		})
		require.NoError(t, err)
		assert.NotNil(t, comment)
		assert.Equal(t, adminID, createdNotifInput.RecipientID)
		assert.Equal(t, domain.NotificationGroupKeyPostComment(postID), createdNotifInput.GroupKey)
		assert.Equal(t, domain.NotificationTypePostComment, createdNotifInput.NotificationType)
		require.Len(t, broadcaster.calls, 1)
		assert.Equal(t, adminID, broadcaster.calls[0].recipientID)
	})

	t.Run("reply to customer comment on Admin post notifies customer AND Admin (Req 6.2 & 6.3)", func(t *testing.T) {
		broadcaster := &mockBroadcaster{}
		var createdNotifs []domain.CreateNotificationInput
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return &domain.PostDetail{PostItem: domain.PostItem{ID: postID, AuthorID: adminID}}, nil
			},
			getCommentByIDFn: func(ctx context.Context, id string) (*domain.PostComment, error) {
				return &domain.PostComment{ID: rootCommentID, PostID: postID, AuthorID: customer1ID}, nil
			},
			createCommentFn: func(ctx context.Context, input domain.CreateCommentInput) (*domain.PostComment, error) {
				return &domain.PostComment{ID: "reply-1", PostID: postID, AuthorID: customer2ID, ParentID: &rootCommentID, Content: input.Content}, nil
			},
			createNotificationFn: func(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error) {
				createdNotifs = append(createdNotifs, input)
				return &domain.NotificationItem{
					ID:               uuid.NewString(),
					RecipientID:      input.RecipientID,
					GroupKey:         input.GroupKey,
					ActorCount:       1,
					Category:         input.Category,
					NotificationType: input.NotificationType,
				}, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore(), postuc.WithBroadcaster(broadcaster))

		comment, err := uc.CreateComment(ctx, customer2ID, postID, domain.CreateCommentRequest{
			Content:         "Tôi cũng quan tâm",
			ParentCommentID: &rootCommentID,
		})
		require.NoError(t, err)
		assert.NotNil(t, comment)

		// 2 notifications created: one for customer1 (comment_reply) and one for admin (post_comment)
		require.Len(t, createdNotifs, 2)
		assert.Equal(t, customer1ID, createdNotifs[0].RecipientID)
		assert.Equal(t, domain.NotificationGroupKeyCommentReply(rootCommentID), createdNotifs[0].GroupKey)
		assert.Equal(t, domain.NotificationTypeCommentReply, createdNotifs[0].NotificationType)
		assert.Equal(t, adminID, createdNotifs[1].RecipientID)
		assert.Equal(t, domain.NotificationGroupKeyPostComment(postID), createdNotifs[1].GroupKey)
		assert.Equal(t, domain.NotificationTypePostComment, createdNotifs[1].NotificationType)

		require.Len(t, broadcaster.calls, 2)
		assert.Equal(t, customer1ID, broadcaster.calls[0].recipientID)
		assert.Equal(t, adminID, broadcaster.calls[1].recipientID)
	})

	t.Run("reply to level-2 comment flattens groupKey to root level-1 comment and rolls up multi-actor replies", func(t *testing.T) {
		broadcaster := &mockBroadcaster{}
		level2CommentID := uuid.NewString()
		customer3ID := uuid.NewString()
		var createdNotifs []domain.CreateNotificationInput

		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return &domain.PostDetail{PostItem: domain.PostItem{ID: postID, AuthorID: adminID}}, nil
			},
			getCommentByIDFn: func(ctx context.Context, id string) (*domain.PostComment, error) {
				if id == level2CommentID {
					return &domain.PostComment{
						ID:       level2CommentID,
						PostID:   postID,
						AuthorID: customer1ID,
						ParentID: &rootCommentID,
					}, nil
				}
				return &domain.PostComment{
					ID:       rootCommentID,
					PostID:   postID,
					AuthorID: customer1ID,
				}, nil
			},
			createCommentFn: func(ctx context.Context, input domain.CreateCommentInput) (*domain.PostComment, error) {
				return &domain.PostComment{
					ID:       uuid.NewString(),
					PostID:   postID,
					AuthorID: input.AuthorID,
					ParentID: &rootCommentID,
					Content:  input.Content,
				}, nil
			},
			createNotificationFn: func(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error) {
				createdNotifs = append(createdNotifs, input)
				return &domain.NotificationItem{
					ID:               "notif-reply-rollup",
					RecipientID:      input.RecipientID,
					GroupKey:         input.GroupKey,
					ActorCount:       2,
					Category:         input.Category,
					NotificationType: input.NotificationType,
				}, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore(), postuc.WithBroadcaster(broadcaster))

		_, err := uc.CreateComment(ctx, customer3ID, postID, domain.CreateCommentRequest{
			Content:         "Trả lời bình luận cấp 2",
			ParentCommentID: &level2CommentID,
		})
		require.NoError(t, err)

		require.Len(t, createdNotifs, 2)
		assert.Equal(t, customer1ID, createdNotifs[0].RecipientID)
		assert.Equal(t, domain.NotificationGroupKeyCommentReply(rootCommentID), createdNotifs[0].GroupKey)
		assert.Equal(t, adminID, createdNotifs[1].RecipientID)
		assert.Equal(t, domain.NotificationGroupKeyPostComment(postID), createdNotifs[1].GroupKey)
	})

	t.Run("reply to Admin's comment on Admin post creates only ONE notification for Admin", func(t *testing.T) {
		broadcaster := &mockBroadcaster{}
		var createdNotifs []domain.CreateNotificationInput
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return &domain.PostDetail{PostItem: domain.PostItem{ID: postID, AuthorID: adminID}}, nil
			},
			getCommentByIDFn: func(ctx context.Context, id string) (*domain.PostComment, error) {
				// Admin is the author of root comment
				return &domain.PostComment{ID: rootCommentID, PostID: postID, AuthorID: adminID}, nil
			},
			createCommentFn: func(ctx context.Context, input domain.CreateCommentInput) (*domain.PostComment, error) {
				return &domain.PostComment{ID: "reply-2", PostID: postID, AuthorID: customer1ID, Content: input.Content}, nil
			},
			createNotificationFn: func(ctx context.Context, input domain.CreateNotificationInput) (*domain.NotificationItem, error) {
				createdNotifs = append(createdNotifs, input)
				return &domain.NotificationItem{
					ID:               uuid.NewString(),
					RecipientID:      input.RecipientID,
					Category:         input.Category,
					NotificationType: input.NotificationType,
				}, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore(), postuc.WithBroadcaster(broadcaster))

		comment, err := uc.CreateComment(ctx, customer1ID, postID, domain.CreateCommentRequest{
			Content:         "Dạ cảm ơn shop",
			ParentCommentID: &rootCommentID,
		})
		require.NoError(t, err)
		assert.NotNil(t, comment)

		// Exactly 1 notification for Admin (comment_reply) - no duplicate
		require.Len(t, createdNotifs, 1)
		assert.Equal(t, adminID, createdNotifs[0].RecipientID)
		assert.Equal(t, domain.NotificationTypeCommentReply, createdNotifs[0].NotificationType)

		require.Len(t, broadcaster.calls, 1)
		assert.Equal(t, adminID, broadcaster.calls[0].recipientID)
	})
}

func TestUseCase_DeleteComment(t *testing.T) {
	ctx := context.Background()
	adminID := uuid.NewString()
	customer1ID := uuid.NewString()
	customer2ID := uuid.NewString()
	postID := uuid.NewString()
	commentID := uuid.NewString()

	t.Run("post not found returns ErrPostNotFound", func(t *testing.T) {
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return nil, domain.ErrPostNotFound
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore())
		_, _, err := uc.DeleteComment(ctx, customer1ID, "customer", postID, commentID)
		require.ErrorIs(t, err, domain.ErrPostNotFound)
	})

	t.Run("comment belongs to different post returns ErrPostCommentNotFound", func(t *testing.T) {
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return &domain.PostDetail{PostItem: domain.PostItem{ID: postID}}, nil
			},
			getCommentByIDFn: func(ctx context.Context, id string) (*domain.PostComment, error) {
				return &domain.PostComment{ID: commentID, PostID: uuid.NewString(), AuthorID: customer1ID}, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore())
		_, _, err := uc.DeleteComment(ctx, customer1ID, "customer", postID, commentID)
		require.ErrorIs(t, err, domain.ErrPostCommentNotFound)
	})

	t.Run("non-author non-admin deleting returns ErrForbidden", func(t *testing.T) {
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return &domain.PostDetail{PostItem: domain.PostItem{ID: postID}}, nil
			},
			getCommentByIDFn: func(ctx context.Context, id string) (*domain.PostComment, error) {
				return &domain.PostComment{ID: commentID, PostID: postID, AuthorID: customer1ID}, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore())
		_, _, err := uc.DeleteComment(ctx, customer2ID, "customer", postID, commentID)
		require.ErrorIs(t, err, domain.ErrForbidden)
	})

	t.Run("author deleting own comment succeeds", func(t *testing.T) {
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return &domain.PostDetail{PostItem: domain.PostItem{ID: postID}}, nil
			},
			getCommentByIDFn: func(ctx context.Context, id string) (*domain.PostComment, error) {
				return &domain.PostComment{ID: commentID, PostID: postID, AuthorID: customer1ID}, nil
			},
			deleteCommentFn: func(ctx context.Context, id string) (string, int, error) {
				return commentID, 0, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore())
		deletedID, count, err := uc.DeleteComment(ctx, customer1ID, "customer", postID, commentID)
		require.NoError(t, err)
		assert.Equal(t, commentID, deletedID)
		assert.Equal(t, 0, count)
	})

	t.Run("admin deleting customer comment succeeds", func(t *testing.T) {
		repo := &mockPostRepo{
			getPostByIDFn: func(ctx context.Context, id string, viewerUserID *string) (*domain.PostDetail, error) {
				return &domain.PostDetail{PostItem: domain.PostItem{ID: postID}}, nil
			},
			getCommentByIDFn: func(ctx context.Context, id string) (*domain.PostComment, error) {
				return &domain.PostComment{ID: commentID, PostID: postID, AuthorID: customer1ID}, nil
			},
			deleteCommentFn: func(ctx context.Context, id string) (string, int, error) {
				return commentID, 0, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore())
		deletedID, count, err := uc.DeleteComment(ctx, adminID, "admin", postID, commentID)
		require.NoError(t, err)
		assert.Equal(t, commentID, deletedID)
		assert.Equal(t, 0, count)
	})
}

func TestUseCase_Notifications(t *testing.T) {
	ctx := context.Background()
	userID := uuid.NewString()

	t.Run("ListNotifications normalizes pagination limits", func(t *testing.T) {
		repo := &mockPostRepo{
			listNotificationsFn: func(ctx context.Context, recipientID string, limit, offset int) (*domain.NotificationsListResult, error) {
				assert.Equal(t, userID, recipientID)
				assert.Equal(t, 20, limit) // default limit 20
				assert.Equal(t, 0, offset)
				return &domain.NotificationsListResult{
					Items:       []domain.NotificationItem{{ID: "n1", RecipientID: userID}},
					UnreadCount: 1,
				}, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore())

		res, err := uc.ListNotifications(ctx, userID, 0, -5)
		require.NoError(t, err)
		assert.NotNil(t, res)
		assert.Equal(t, 1, res.UnreadCount)
	})

	t.Run("MarkNotificationRead returns updated item and remaining unread count", func(t *testing.T) {
		notifID := uuid.NewString()
		repo := &mockPostRepo{
			markNotificationReadFn: func(ctx context.Context, nID string, rID string) (*domain.NotificationItem, error) {
				assert.Equal(t, notifID, nID)
				assert.Equal(t, userID, rID)
				return &domain.NotificationItem{ID: notifID, RecipientID: rID, IsRead: true}, nil
			},
			getUnreadNotificationCountFn: func(ctx context.Context, rID string) (int, error) {
				return 2, nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore())

		item, unreadCount, err := uc.MarkNotificationRead(ctx, userID, notifID)
		require.NoError(t, err)
		assert.True(t, item.IsRead)
		assert.Equal(t, 2, unreadCount)
	})

	t.Run("MarkAllNotificationsRead marks all and returns 0 unread", func(t *testing.T) {
		repo := &mockPostRepo{
			markAllNotificationsReadFn: func(ctx context.Context, rID string) error {
				assert.Equal(t, userID, rID)
				return nil
			},
		}
		uc := postuc.New(repo, &mockCatalogRepo{}, chatmedia.NewFakeStore())

		unreadCount, err := uc.MarkAllNotificationsRead(ctx, userID)
		require.NoError(t, err)
		assert.Equal(t, 0, unreadCount)
	})
}

