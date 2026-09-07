package domain_test

import (
	"testing"
	"time"

	"commerce-backend/internal/domain"
)

func TestCalculatePresence(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name         string
		lastActiveAt *time.Time
		wantStatus   string
		wantText     string
	}{
		{
			name:         "Nil last active",
			lastActiveAt: nil,
			wantStatus:   "offline",
			wantText:     "Chưa hoạt động",
		},
		{
			name: "Active 30 seconds ago (online)",
			lastActiveAt: func() *time.Time {
				t := now.Add(-30 * time.Second)
				return &t
			}(),
			wantStatus: "online",
			wantText:   "Đang hoạt động",
		},
		{
			name: "Active 2 minutes ago (online)",
			lastActiveAt: func() *time.Time {
				t := now.Add(-2 * time.Minute)
				return &t
			}(),
			wantStatus: "online",
			wantText:   "Đang hoạt động",
		},
		{
			name: "Active 5 minutes ago (just now)",
			lastActiveAt: func() *time.Time {
				t := now.Add(-5 * time.Minute)
				return &t
			}(),
			wantStatus: "active",
			wantText:   "Vừa xong",
		},
		{
			name: "Active 25 minutes ago",
			lastActiveAt: func() *time.Time {
				t := now.Add(-25 * time.Minute)
				return &t
			}(),
			wantStatus: "active",
			wantText:   "Hoạt động 25 phút trước",
		},
		{
			name: "Active 3 hours ago",
			lastActiveAt: func() *time.Time {
				t := now.Add(-3 * time.Hour)
				return &t
			}(),
			wantStatus: "active",
			wantText:   "Hoạt động 3 giờ trước",
		},
		{
			name: "Active 2 days ago",
			lastActiveAt: func() *time.Time {
				t := now.Add(-48 * time.Hour)
				return &t
			}(),
			wantStatus: "offline",
			wantText:   "Hoạt động ngày " + now.Add(-48*time.Hour).Format("02/01"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := domain.CalculatePresence(tt.lastActiveAt, now)
			if res.Status != tt.wantStatus {
				t.Errorf("got status %q, want %q", res.Status, tt.wantStatus)
			}
			if res.DisplayText != tt.wantText {
				t.Errorf("got displayText %q, want %q", res.DisplayText, tt.wantText)
			}
		})
	}
}

func TestValidateMessageContent(t *testing.T) {
	tests := []struct {
		name       string
		content    string
		mediaCount int
		hasOrder   bool
		wantErr    bool
	}{
		{
			name:       "Valid text only",
			content:    "Xin chào shop",
			mediaCount: 0,
			hasOrder:   false,
			wantErr:    false,
		},
		{
			name:       "Empty text with media",
			content:    "",
			mediaCount: 1,
			hasOrder:   false,
			wantErr:    false,
		},
		{
			name:       "Empty text with order attachment",
			content:    "",
			mediaCount: 0,
			hasOrder:   true,
			wantErr:    false,
		},
		{
			name:       "Empty text and no media and no order",
			content:    "   ",
			mediaCount: 0,
			hasOrder:   false,
			wantErr:    true,
		},
		{
			name:       "Too many media files",
			content:    "Hello",
			mediaCount: 6,
			hasOrder:   false,
			wantErr:    true,
		},
		{
			name:       "Max allowed media",
			content:    "",
			mediaCount: 5,
			hasOrder:   false,
			wantErr:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := domain.ValidateMessageContent(tt.content, tt.mediaCount, tt.hasOrder)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateMessageContent() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

