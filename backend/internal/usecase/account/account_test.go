package account

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security"
	"commerce-backend/internal/security/jwt"
)

type fakeAccountRepo struct {
	user           *domain.User
	revokedCount   int
	createdHash    string
	updateAvatarFn func(avatarKey *string) error
	rotateErr      error
}

func newFakeAccountRepo() *fakeAccountRepo {
	hash, _ := security.HashPassword("oldpassword1")
	return &fakeAccountRepo{
		user: &domain.User{
			ID:           "11111111-1111-1111-1111-111111111111",
			Email:        "khach@example.com",
			PasswordHash: hash,
			Role:         domain.RoleCustomer,
			Status:       domain.UserStatusActive,
			CreatedAt:    time.Now().UTC(),
			UpdatedAt:    time.Now().UTC(),
		},
	}
}

func (f *fakeAccountRepo) GetByID(_ context.Context, userID string) (*domain.User, error) {
	if f.user == nil || f.user.ID != userID {
		return nil, domain.ErrNotFound
	}
	cp := *f.user
	return &cp, nil
}

func (f *fakeAccountRepo) UpdateProfile(_ context.Context, userID string, displayName, phone *string) (*domain.User, error) {
	if f.user == nil || f.user.ID != userID {
		return nil, domain.ErrNotFound
	}
	f.user.DisplayName = displayName
	f.user.Phone = phone
	f.user.UpdatedAt = time.Now().UTC()
	cp := *f.user
	return &cp, nil
}

func (f *fakeAccountRepo) UpdateAvatar(_ context.Context, userID string, avatarKey *string) (*domain.User, *string, error) {
	if f.user == nil || f.user.ID != userID {
		return nil, nil, domain.ErrNotFound
	}
	if f.updateAvatarFn != nil {
		if err := f.updateAvatarFn(avatarKey); err != nil {
			return nil, nil, err
		}
	}
	prev := f.user.AvatarKey
	f.user.AvatarKey = avatarKey
	f.user.UpdatedAt = time.Now().UTC()
	cp := *f.user
	return &cp, prev, nil
}

func (f *fakeAccountRepo) ChangePasswordAndRotateSession(_ context.Context, userID, passwordHash, newTokenHash string, _ time.Time) (*domain.User, error) {
	if f.user == nil || f.user.ID != userID {
		return nil, domain.ErrNotFound
	}
	if f.rotateErr != nil {
		return nil, f.rotateErr
	}
	f.user.PasswordHash = passwordHash
	f.revokedCount++
	f.createdHash = newTokenHash
	f.user.UpdatedAt = time.Now().UTC()
	cp := *f.user
	return &cp, nil
}

type fakeAvatarStore struct {
	objects   map[string][]byte
	types     map[string]string
	removeErr error
}

func newFakeAvatarStore() *fakeAvatarStore {
	return &fakeAvatarStore{
		objects: map[string][]byte{},
		types:   map[string]string{},
	}
}

func (s *fakeAvatarStore) PutObject(_ context.Context, objectKey string, reader io.Reader, _ int64, contentType string) error {
	b, err := io.ReadAll(reader)
	if err != nil {
		return err
	}
	s.objects[objectKey] = b
	s.types[objectKey] = contentType
	return nil
}

func (s *fakeAvatarStore) StatObject(_ context.Context, objectKey string) (*domain.ChatObjectInfo, error) {
	b, ok := s.objects[objectKey]
	if !ok {
		return nil, errors.New("NoSuchKey: The specified key does not exist.")
	}
	return &domain.ChatObjectInfo{
		Key:         objectKey,
		Size:        int64(len(b)),
		ContentType: s.types[objectKey],
	}, nil
}

func (s *fakeAvatarStore) GetObject(_ context.Context, objectKey string) (io.ReadCloser, error) {
	b, ok := s.objects[objectKey]
	if !ok {
		return nil, errors.New("NoSuchKey: The specified key does not exist.")
	}
	return io.NopCloser(bytes.NewReader(b)), nil
}

func (s *fakeAvatarStore) RemoveObject(_ context.Context, objectKey string) error {
	if s.removeErr != nil {
		return s.removeErr
	}
	delete(s.objects, objectKey)
	delete(s.types, objectKey)
	return nil
}

func newTestAccountUseCase(repo domain.AccountRepository, store domain.AvatarStore) *UseCase {
	mgr := jwt.NewManager("test-secret-with-at-least-thirty-two-bytes", "commerce-backend")
	return New(Dependencies{
		Repo:                 repo,
		Store:                store,
		JWT:                  mgr,
		AccessTTL:            15 * time.Minute,
		RefreshTTL:           24 * time.Hour,
		HashPassword:         security.HashPassword,
		CheckPassword:        security.CheckPassword,
		GenerateRefreshToken: security.GenerateRefreshToken,
		Logger:               slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
}

func TestAccountUseCase_UpdateProfile_TrimClearAndValidate(t *testing.T) {
	ctx := context.Background()
	repo := newFakeAccountRepo()
	uc := newTestAccountUseCase(repo, newFakeAvatarStore())

	name := "  Nguyễn Minh Anh  "
	phone := " 0912345678 "
	pub, err := uc.UpdateProfile(ctx, repo.user.ID, domain.UpdateProfileInput{
		DisplayName: &name,
		Phone:       &phone,
	})
	require.NoError(t, err)
	require.NotNil(t, pub.DisplayName)
	require.NotNil(t, pub.Phone)
	assert.Equal(t, "Nguyễn Minh Anh", *pub.DisplayName)
	assert.Equal(t, "0912345678", *pub.Phone)

	// Empty strings clear to nil
	empty := "   "
	pub, err = uc.UpdateProfile(ctx, repo.user.ID, domain.UpdateProfileInput{
		DisplayName: &empty,
		Phone:       &empty,
	})
	require.NoError(t, err)
	assert.Nil(t, pub.DisplayName)
	assert.Nil(t, pub.Phone)

	// > 80 Unicode runes and bad phone format fail validation
	tooLong := strings.Repeat("á", 81)
	badPhone := "+84912345678"
	_, err = uc.UpdateProfile(ctx, repo.user.ID, domain.UpdateProfileInput{
		DisplayName: &tooLong,
		Phone:       &badPhone,
	})
	var valErr *domain.ValidationError
	require.ErrorAs(t, err, &valErr)
	assert.NotEmpty(t, valErr.Fields["displayName"])
	assert.NotEmpty(t, valErr.Fields["phone"])
}

func TestAccountUseCase_UploadAndDeleteAvatar(t *testing.T) {
	ctx := context.Background()
	repo := newFakeAccountRepo()
	store := newFakeAvatarStore()
	uc := newTestAccountUseCase(repo, store)

	// Fake PNG bytes (PNG magic header)
	pngBytes := append([]byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 32)...)
	pub, err := uc.UploadAvatar(ctx, repo.user.ID, domain.UploadAvatarInput{
		Reader:              bytes.NewReader(pngBytes),
		Size:                int64(len(pngBytes)),
		DeclaredContentType: "image/png",
	})
	require.NoError(t, err)
	require.NotNil(t, pub.AvatarURL)
	assert.True(t, strings.HasPrefix(*pub.AvatarURL, "/media/avatars/"))
	assert.True(t, strings.HasSuffix(*pub.AvatarURL, ".png"))
	firstKey := strings.TrimPrefix(*pub.AvatarURL, "/media/avatars/")
	assert.True(t, domain.AvatarKeyRegex.MatchString(firstKey))
	assert.Contains(t, store.objects, "avatars/"+firstKey)

	// Upload WebP replaces old object best-effort
	webpBytes := append([]byte("RIFF\x24\x00\x00\x00WEBPVP8 "), make([]byte, 24)...)
	pub2, err := uc.UploadAvatar(ctx, repo.user.ID, domain.UploadAvatarInput{
		Reader:              bytes.NewReader(webpBytes),
		Size:                int64(len(webpBytes)),
		DeclaredContentType: "image/webp",
	})
	require.NoError(t, err)
	require.NotNil(t, pub2.AvatarURL)
	assert.True(t, strings.HasSuffix(*pub2.AvatarURL, ".webp"))
	assert.NotContains(t, store.objects, "avatars/"+firstKey, "old avatar must be deleted from store")

	// Disguised .png containing ASCII text rejected via magic bytes
	_, err = uc.UploadAvatar(ctx, repo.user.ID, domain.UploadAvatarInput{
		Reader:              strings.NewReader("not really an image file"),
		Size:                24,
		DeclaredContentType: "image/png",
	})
	var valErr *domain.ValidationError
	require.ErrorAs(t, err, &valErr)
	assert.NotEmpty(t, valErr.Fields["avatar"])

	// Oversized file > 5MB rejected
	_, err = uc.UploadAvatar(ctx, repo.user.ID, domain.UploadAvatarInput{
		Reader:              bytes.NewReader(pngBytes),
		Size:                domain.MaxAvatarBytes + 1,
		DeclaredContentType: "image/png",
	})
	require.ErrorAs(t, err, &valErr)
	assert.NotEmpty(t, valErr.Fields["avatar"])

	// Delete succeeds even when RemoveObject fails (best effort) and is idempotent
	store.removeErr = errors.New("temporary minio failure")
	deletedPub, err := uc.DeleteAvatar(ctx, repo.user.ID)
	require.NoError(t, err)
	assert.Nil(t, deletedPub.AvatarURL)

	deletedAgain, err := uc.DeleteAvatar(ctx, repo.user.ID)
	require.NoError(t, err)
	assert.Nil(t, deletedAgain.AvatarURL)
}

func TestAccountUseCase_OpenAndStatAvatar_RejectsTraversal(t *testing.T) {
	ctx := context.Background()
	uc := newTestAccountUseCase(newFakeAccountRepo(), newFakeAvatarStore())

	_, err := uc.StatAvatar(ctx, "../secret.png")
	assert.ErrorIs(t, err, domain.ErrAvatarNotFound)

	_, _, err = uc.OpenAvatar(ctx, "550e8400-e29b-41d4-a716-446655440000.webp")
	assert.ErrorIs(t, err, domain.ErrAvatarNotFound)
}

func TestAccountUseCase_ChangePassword(t *testing.T) {
	ctx := context.Background()
	repo := newFakeAccountRepo()
	uc := newTestAccountUseCase(repo, newFakeAvatarStore())

	// Wrong current password -> ValidationError (400), never 401
	_, err := uc.ChangePassword(ctx, repo.user.ID, domain.ChangePasswordInput{
		CurrentPassword: "wrongpassword",
		NewPassword:     "newpassword1",
	})
	var valErr *domain.ValidationError
	require.ErrorAs(t, err, &valErr)
	assert.Equal(t, "Mật khẩu hiện tại không chính xác", valErr.Fields["currentPassword"])

	// Too short (< 8 bytes) & too long (> 72 bytes)
	_, err = uc.ChangePassword(ctx, repo.user.ID, domain.ChangePasswordInput{
		CurrentPassword: "oldpassword1",
		NewPassword:     "short",
	})
	require.ErrorAs(t, err, &valErr)
	assert.NotEmpty(t, valErr.Fields["newPassword"])

	_, err = uc.ChangePassword(ctx, repo.user.ID, domain.ChangePasswordInput{
		CurrentPassword: "oldpassword1",
		NewPassword:     strings.Repeat("a", 73),
	})
	require.ErrorAs(t, err, &valErr)
	assert.NotEmpty(t, valErr.Fields["newPassword"])

	// Reusing current password
	_, err = uc.ChangePassword(ctx, repo.user.ID, domain.ChangePasswordInput{
		CurrentPassword: "oldpassword1",
		NewPassword:     "oldpassword1",
	})
	require.ErrorAs(t, err, &valErr)
	assert.NotEmpty(t, valErr.Fields["newPassword"])

	// Valid change updates hash, rotates session, issues access & refresh tokens
	sess, err := uc.ChangePassword(ctx, repo.user.ID, domain.ChangePasswordInput{
		CurrentPassword: "oldpassword1",
		NewPassword:     "newpassword1",
	})
	require.NoError(t, err)
	assert.NotEmpty(t, sess.AccessToken)
	assert.NotEmpty(t, sess.RefreshToken)
	assert.Equal(t, repo.user.ID, sess.User.ID)
	assert.Equal(t, 1, repo.revokedCount)
	assert.True(t, security.CheckPassword("newpassword1", repo.user.PasswordHash))
}
