package live

import (
	"context"
	"errors"
	"strings"

	"commerce-backend/internal/domain"
)

const (
	MediaActionPublish = "publish"
	MediaActionRead    = "read"
)

// AuthorizeMedia decides whether an authenticated user may publish to or read
// a MediaMTX path. Only paths of live sessions are served; only admins publish.
func (uc *UseCase) AuthorizeMedia(ctx context.Context, action, path, role string) (bool, error) {
	if action != MediaActionPublish && action != MediaActionRead {
		return false, nil
	}
	sessionID, ok := strings.CutPrefix(path, domain.LivePath(""))
	if !ok || !isUUID(sessionID) {
		return false, nil
	}
	session, err := uc.repo.GetSession(ctx, sessionID)
	if errors.Is(err, domain.ErrLivestreamNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !session.IsLive() {
		return false, nil
	}
	if action == MediaActionPublish {
		return role == domain.RoleAdmin, nil
	}
	return true, nil
}
