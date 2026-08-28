package domain

import (
	"math"
	"testing"
)

func TestComputeAverageRating(t *testing.T) {
	tests := []struct {
		name     string
		mean     float64
		expected float64
	}{
		{
			name:     "REQ-REVIEW-06: 3.6666... -> 3.7",
			mean:     (5.0 + 4.0 + 2.0) / 3.0,
			expected: 3.7,
		},
		{
			name:     "REQ-REVIEW-06: 4.25 -> 4.3 (round half up)",
			mean:     4.25,
			expected: 4.3,
		},
		{
			name:     "exact 5.0",
			mean:     5.0,
			expected: 5.0,
		},
		{
			name:     "exact 1.0",
			mean:     1.0,
			expected: 1.0,
		},
		{
			name:     "4.24 -> 4.2",
			mean:     4.24,
			expected: 4.2,
		},
		{
			name:     "4.26 -> 4.3",
			mean:     4.26,
			expected: 4.3,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ComputeAverageRating(tt.mean)
			if math.Abs(got-tt.expected) > 1e-9 {
				t.Errorf("ComputeAverageRating(%v) = %v; want %v", tt.mean, got, tt.expected)
			}
		})
	}
}

func TestFormatMediaURL(t *testing.T) {
	mediaID := "11111111-2222-3333-4444-555555555555"
	expected := "/media/reviews/11111111-2222-3333-4444-555555555555"
	got := FormatMediaURL(mediaID)
	if got != expected {
		t.Errorf("FormatMediaURL() = %v; want %v", got, expected)
	}
}

func TestNormalizeComment(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"   hello world   ", "hello world"},
		{"\n\t  test \t\n", "test"},
		{"   ", ""},
		{"", ""},
	}

	for _, tt := range tests {
		got := NormalizeComment(tt.input)
		if got != tt.expected {
			t.Errorf("NormalizeComment(%q) = %q; want %q", tt.input, got, tt.expected)
		}
	}
}
