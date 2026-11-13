package live

import (
	"context"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

// Comment posts a comment to a live session and broadcasts it to the room.
// Customers may comment at most once every LiveCommentInterval; admins are not
// limited.
func (uc *UseCase) Comment(ctx context.Context, sessionID, userID, role, content string) (*domain.LiveComment, error) {
	s, err := uc.getSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	content = strings.TrimSpace(content)
	if n := utf8.RuneCountInString(content); n < 1 || n > domain.LiveCommentMaxLength {
		return nil, domain.NewValidationError(map[string]string{"content": "Bình luận phải từ 1 đến 200 ký tự"})
	}
	if !s.IsLive() {
		return nil, domain.ErrLivestreamEnded
	}
	if role != domain.RoleAdmin {
		last, err := uc.repo.LastCommentAt(ctx, s.ID, userID)
		if err != nil {
			return nil, err
		}
		if last != nil && uc.clock().Sub(*last) < domain.LiveCommentInterval {
			return nil, domain.ErrRateLimited
		}
	}
	comment, err := uc.repo.InsertComment(ctx, s.ID, userID, content)
	if err != nil {
		return nil, err
	}
	uc.broadcaster.Broadcast(s.ID, domain.LiveEventComment, *comment)
	return comment, nil
}

// HideComment hides a comment from viewers; hiding it again is a no-op.
func (uc *UseCase) HideComment(ctx context.Context, commentID string) (*domain.LiveComment, error) {
	if _, err := uuid.Parse(commentID); err != nil {
		return nil, domain.ErrLiveCommentNotFound
	}
	comment, err := uc.repo.HideComment(ctx, commentID)
	if err != nil {
		return nil, err
	}
	uc.broadcaster.Broadcast(comment.SessionID, domain.LiveEventCommentHidden, domain.LiveCommentHiddenEvent{CommentID: comment.ID})
	return comment, nil
}
