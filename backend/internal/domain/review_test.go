package domain

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestMaskReviewerEmail(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected *string
	}{
		{
			name:     "Standard email",
			input:    "customer@gmail.com",
			expected: ptr("c***@gmail.com"),
		},
		{
			name:     "Display name with address",
			input:    "John Doe <john.doe@example.com>",
			expected: ptr("j***@example.com"),
		},
		{
			name:     "Single letter username",
			input:    "a@example.com",
			expected: ptr("a***@example.com"),
		},
		{
			name:     "Spaces around email",
			input:    "  user@domain.vn  ",
			expected: ptr("u***@domain.vn"),
		},
		{
			name:     "Empty email",
			input:    "",
			expected: nil,
		},
		{
			name:     "Whitespace only",
			input:    "   ",
			expected: nil,
		},
		{
			name:     "Invalid email without at",
			input:    "notanemail",
			expected: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actual := MaskReviewerEmail(tt.input)
			if tt.expected == nil {
				assert.Nil(t, actual)
			} else {
				assert.NotNil(t, actual)
				assert.Equal(t, *tt.expected, *actual)
			}
		})
	}
}

func ptr(s string) *string {
	return &s
}
