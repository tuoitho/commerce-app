package account

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security"
	"commerce-backend/internal/security/jwt"
)

const avatarObjectPrefix = "avatars/"

type Dependencies struct {
	Repo                 domain.AccountRepository
	Store                domain.AvatarStore
	JWT                  *jwt.Manager
	AccessTTL            time.Duration
	RefreshTTL           time.Duration
	HashPassword         func(string) (string, error)
	CheckPassword        func(string, string) bool
	GenerateRefreshToken func() (security.RefreshTokenPair, error)
	Logger               *slog.Logger
}

type UseCase struct {
	repo                 domain.AccountRepository
	store                domain.AvatarStore
	jwt                  *jwt.Manager
	accessTTL            time.Duration
	refreshTTL           time.Duration
	hashPassword         func(string) (string, error)
	checkPassword        func(string, string) bool
	generateRefreshToken func() (security.RefreshTokenPair, error)
	logger               *slog.Logger
}

func New(deps Dependencies) *UseCase {
	logger := deps.Logger
	if logger == nil {
		logger = slog.Default()
	}
	return &UseCase{
		repo:                 deps.Repo,
		store:                deps.Store,
		jwt:                  deps.JWT,
		accessTTL:            deps.AccessTTL,
		refreshTTL:           deps.RefreshTTL,
		hashPassword:         deps.HashPassword,
		checkPassword:        deps.CheckPassword,
		generateRefreshToken: deps.GenerateRefreshToken,
		logger:               logger,
	}
}

func (uc *UseCase) GetProfile(ctx context.Context, userID string) (domain.UserPublic, error) {
	u, err := uc.repo.GetByID(ctx, userID)
	if err != nil {
		return domain.UserPublic{}, err
	}
	return u.Public(), nil
}

func (uc *UseCase) UpdateProfile(ctx context.Context, userID string, input domain.UpdateProfileInput) (domain.UserPublic, error) {
	fields := map[string]string{}

	var displayName *string
	if input.DisplayName != nil {
		trimmed := strings.TrimSpace(*input.DisplayName)
		if trimmed != "" {
			if utf8.RuneCountInString(trimmed) > domain.MaxDisplayNameRunes {
				fields["displayName"] = "Tên hiển thị tối đa 80 ký tự"
			} else {
				displayName = &trimmed
			}
		}
	}

	var phone *string
	if input.Phone != nil {
		trimmed := strings.TrimSpace(*input.Phone)
		if trimmed != "" {
			if !domain.AccountPhoneRegex.MatchString(trimmed) {
				fields["phone"] = "Số điện thoại không hợp lệ (10-11 chữ số, bắt đầu bằng 0)"
			} else {
				phone = &trimmed
			}
		}
	}

	if len(fields) > 0 {
		return domain.UserPublic{}, domain.NewValidationError(fields)
	}

	u, err := uc.repo.UpdateProfile(ctx, userID, displayName, phone)
	if err != nil {
		return domain.UserPublic{}, err
	}
	return u.Public(), nil
}

func (uc *UseCase) UploadAvatar(ctx context.Context, userID string, input domain.UploadAvatarInput) (domain.UserPublic, error) {
	if uc.store == nil {
		return domain.UserPublic{}, errors.New("avatar store is not configured")
	}
	if input.Reader == nil || input.Size <= 0 || input.Size > domain.MaxAvatarBytes {
		return domain.UserPublic{}, domain.NewValidationError(map[string]string{
			"avatar": "Ảnh đại diện không hợp lệ hoặc vượt quá 5MB",
		})
	}

	data, err := io.ReadAll(io.LimitReader(input.Reader, domain.MaxAvatarBytes+1))
	if err != nil {
		return domain.UserPublic{}, domain.NewValidationError(map[string]string{
			"avatar": "Không thể đọc tệp ảnh đại diện",
		})
	}
	if len(data) == 0 || int64(len(data)) > domain.MaxAvatarBytes {
		return domain.UserPublic{}, domain.NewValidationError(map[string]string{
			"avatar": "Ảnh đại diện không hợp lệ hoặc vượt quá 5MB",
		})
	}

	sniffLen := len(data)
	if sniffLen > 512 {
		sniffLen = 512
	}
	detectedMIME := normalizeImageMIME(http.DetectContentType(data[:sniffLen]))
	ext, supported := avatarExtensionForMIME(detectedMIME)
	if !supported {
		return domain.UserPublic{}, domain.NewValidationError(map[string]string{
			"avatar": "Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP",
		})
	}

	if declared := normalizeDeclaredImageMIME(input.DeclaredContentType); declared != "" && declared != "application/octet-stream" && declared != detectedMIME {
		return domain.UserPublic{}, domain.NewValidationError(map[string]string{
			"avatar": "Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP",
		})
	}

	newKey := uuid.NewString() + "." + ext
	objectKey := avatarObjectPrefix + newKey
	if err := uc.store.PutObject(ctx, objectKey, bytes.NewReader(data), int64(len(data)), detectedMIME); err != nil {
		return domain.UserPublic{}, err
	}

	updated, oldKey, err := uc.repo.UpdateAvatar(ctx, userID, &newKey)
	if err != nil {
		uc.removeObjectBestEffort(ctx, objectKey)
		return domain.UserPublic{}, err
	}

	if oldKey != nil && strings.TrimSpace(*oldKey) != "" && *oldKey != newKey {
		uc.removeObjectBestEffort(ctx, avatarObjectPrefix+strings.TrimSpace(*oldKey))
	}

	return updated.Public(), nil
}

func (uc *UseCase) DeleteAvatar(ctx context.Context, userID string) (domain.UserPublic, error) {
	updated, oldKey, err := uc.repo.UpdateAvatar(ctx, userID, nil)
	if err != nil {
		return domain.UserPublic{}, err
	}
	if uc.store != nil && oldKey != nil && strings.TrimSpace(*oldKey) != "" {
		uc.removeObjectBestEffort(ctx, avatarObjectPrefix+strings.TrimSpace(*oldKey))
	}
	return updated.Public(), nil
}

func (uc *UseCase) StatAvatar(ctx context.Context, avatarKey string) (*domain.ChatObjectInfo, error) {
	if !domain.AvatarKeyRegex.MatchString(avatarKey) || uc.store == nil {
		return nil, domain.ErrAvatarNotFound
	}
	info, err := uc.store.StatObject(ctx, avatarObjectPrefix+avatarKey)
	if err != nil {
		if isStorageNotFound(err) {
			return nil, domain.ErrAvatarNotFound
		}
		return nil, err
	}
	if strings.TrimSpace(info.ContentType) == "" {
		info.ContentType = contentTypeForAvatarKey(avatarKey)
	}
	return info, nil
}

func (uc *UseCase) OpenAvatar(ctx context.Context, avatarKey string) (io.ReadCloser, *domain.ChatObjectInfo, error) {
	if !domain.AvatarKeyRegex.MatchString(avatarKey) || uc.store == nil {
		return nil, nil, domain.ErrAvatarNotFound
	}
	info, err := uc.StatAvatar(ctx, avatarKey)
	if err != nil {
		return nil, nil, err
	}
	stream, err := uc.store.GetObject(ctx, avatarObjectPrefix+avatarKey)
	if err != nil {
		if isStorageNotFound(err) {
			return nil, nil, domain.ErrAvatarNotFound
		}
		return nil, nil, err
	}
	return stream, info, nil
}

func (uc *UseCase) ChangePassword(ctx context.Context, userID string, input domain.ChangePasswordInput) (*domain.AccountSession, error) {
	fields := map[string]string{}
	if input.CurrentPassword == "" {
		fields["currentPassword"] = "Vui lòng nhập mật khẩu hiện tại"
	}
	if len(input.NewPassword) < domain.MinPasswordBytes {
		fields["newPassword"] = "Mật khẩu mới phải có ít nhất 8 byte"
	} else if len(input.NewPassword) > domain.MaxPasswordBytes {
		fields["newPassword"] = "Mật khẩu mới tối đa 72 byte"
	}
	if len(fields) > 0 {
		return nil, domain.NewValidationError(fields)
	}

	user, err := uc.repo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !uc.checkPassword(input.CurrentPassword, user.PasswordHash) {
		return nil, domain.NewValidationError(map[string]string{
			"currentPassword": "Mật khẩu hiện tại không chính xác",
		})
	}
	if input.NewPassword == input.CurrentPassword {
		return nil, domain.NewValidationError(map[string]string{
			"newPassword": "Mật khẩu mới phải khác mật khẩu hiện tại",
		})
	}

	newHash, err := uc.hashPassword(input.NewPassword)
	if err != nil {
		return nil, err
	}
	pair, err := uc.generateRefreshToken()
	if err != nil {
		return nil, err
	}
	refreshExpiry := time.Now().Add(uc.refreshTTL)

	updatedUser, err := uc.repo.ChangePasswordAndRotateSession(ctx, userID, newHash, pair.Hash, refreshExpiry)
	if err != nil {
		return nil, err
	}

	accessToken, err := uc.jwt.GenerateAccessToken(updatedUser.ID, updatedUser.Role, uc.accessTTL)
	if err != nil {
		return nil, err
	}

	return &domain.AccountSession{
		User:          updatedUser.Public(),
		AccessToken:   accessToken,
		RefreshToken:  pair.Plaintext,
		RefreshExpiry: refreshExpiry,
	}, nil
}

func (uc *UseCase) removeObjectBestEffort(ctx context.Context, objectKey string) {
	if uc.store == nil || objectKey == "" {
		return
	}
	if err := uc.store.RemoveObject(ctx, objectKey); err != nil {
		uc.logger.Warn("best-effort avatar removal failed", "object_key", objectKey, "error", err.Error())
	}
}

func normalizeDeclaredImageMIME(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if parsed, _, err := mime.ParseMediaType(trimmed); err == nil && parsed != "" {
		trimmed = parsed
	}
	return normalizeImageMIME(trimmed)
}

func normalizeImageMIME(v string) string {
	lower := strings.ToLower(strings.TrimSpace(v))
	if lower == "image/jpg" {
		return "image/jpeg"
	}
	return lower
}

func avatarExtensionForMIME(mimeType string) (string, bool) {
	switch mimeType {
	case "image/jpeg":
		return "jpg", true
	case "image/png":
		return "png", true
	case "image/webp":
		return "webp", true
	default:
		return "", false
	}
}

func contentTypeForAvatarKey(avatarKey string) string {
	switch strings.ToLower(filepath.Ext(avatarKey)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	default:
		return "application/octet-stream"
	}
}

func isStorageNotFound(err error) bool {
	if err == nil {
		return false
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "nosuchkey") ||
		strings.Contains(lower, "not found") ||
		strings.Contains(lower, "does not exist") ||
		strings.Contains(lower, "404")
}
