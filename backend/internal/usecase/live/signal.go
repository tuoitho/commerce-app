package live

import (
	"context"
	"time"

	"commerce-backend/internal/domain"
)

const mediaWarnInterval = time.Minute

// CheckSignal polls the media server for the live session's publisher,
// announces changes of its state, and ends the session once no signal has been
// seen for the configured timeout. It is meant to run on a fixed interval.
func (uc *UseCase) CheckSignal(ctx context.Context) {
	s, err := uc.repo.GetCurrentSession(ctx)
	if err != nil {
		if err != domain.ErrLivestreamNotFound {
			uc.logger.Error("load live session for signal check failed", "error", err)
		}
		return
	}
	now := uc.clock()
	online, err := uc.media.PathOnline(ctx, domain.LivePath(s.ID))
	if err != nil {
		uc.warnMedia(now, err)
		online = false
	}
	if online {
		if err := uc.repo.TouchSignal(ctx, s.ID, now); err != nil {
			uc.logger.Error("record live signal failed", "session_id", s.ID, "error", err)
		}
	}
	if uc.setSignal(s.ID, online) {
		uc.broadcaster.Broadcast(s.ID, domain.LiveEventSignal, domain.LiveSignalEvent{Online: online})
	}
	if online {
		return
	}

	lastSeen := s.StartedAt
	if s.LastSignalAt != nil && s.LastSignalAt.After(lastSeen) {
		lastSeen = *s.LastSignalAt
	}
	if now.Sub(lastSeen) >= uc.timeout {
		if _, err := uc.End(ctx, s.ID, domain.LiveEndReasonSignalLost); err != nil {
			uc.logger.Error("end live session after signal loss failed", "session_id", s.ID, "error", err)
		}
	}
}

// setSignal stores the publisher state and reports whether it changed.
// Sessions start offline.
func (uc *UseCase) setSignal(id string, online bool) bool {
	uc.signalMu.Lock()
	defer uc.signalMu.Unlock()
	if uc.signal[id] == online {
		return false
	}
	uc.signal[id] = online
	return true
}

func (uc *UseCase) warnMedia(now time.Time, err error) {
	uc.signalMu.Lock()
	shouldLog := now.Sub(uc.lastMediaWarn) >= mediaWarnInterval
	if shouldLog {
		uc.lastMediaWarn = now
	}
	uc.signalMu.Unlock()
	if shouldLog {
		uc.logger.Warn("media server signal check failed", "error", err)
	}
}
