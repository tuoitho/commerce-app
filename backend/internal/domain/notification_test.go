package domain

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNotificationCategory_IsValid(t *testing.T) {
	assert.True(t, NotificationCategoryPost.IsValid())
	assert.True(t, NotificationCategoryOrder.IsValid())
	assert.True(t, NotificationCategoryReturn.IsValid())
	assert.True(t, NotificationCategoryReview.IsValid())
	assert.True(t, NotificationCategoryLive.IsValid())

	assert.False(t, NotificationCategory("").IsValid())
	assert.False(t, NotificationCategory("system").IsValid())
	assert.False(t, NotificationCategory("ORDER").IsValid())
}

func TestOrderShortCode(t *testing.T) {
	assert.Equal(t, "#A1B2C3D4", OrderShortCode("a1b2c3d4-e5f6-7890-abcd-ef1234567890"))
	assert.Equal(t, "#ORD123", OrderShortCode("ord123"))
	assert.Equal(t, "#ORDER", OrderShortCode("   "))
}
