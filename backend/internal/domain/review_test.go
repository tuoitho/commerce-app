package domain

import (
	"encoding/json"
	"math"
	"strings"
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

func TestNormalizeStoreReviewResponseContent(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    string
		wantErr bool
	}{
		{name: "trims plain text", content: "  <script>alert(1)</script>  ", want: "<script>alert(1)</script>"},
		{name: "accepts 1000 characters after trim", content: " " + strings.Repeat("a", 1000) + " ", want: strings.Repeat("a", 1000)},
		{name: "rejects whitespace only", content: " \n\t ", wantErr: true},
		{name: "rejects 1001 characters after trim", content: strings.Repeat("a", 1001), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NormalizeStoreReviewResponseContent(tt.content)
			if (err != nil) != tt.wantErr {
				t.Fatalf("error = %v, wantErr %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Fatalf("content length = %d, want %d", len(got), len(tt.want))
			}
		})
	}
}

func TestReviewResponseJSONDoesNotExposeAdminIdentityOrVersion(t *testing.T) {
	review := Review{Response: &StoreReviewResponse{Content: "Cảm ơn bạn"}}
	b, err := json.Marshal(review)
	if err != nil {
		t.Fatal(err)
	}
	jsonBody := string(b)
	if !strings.Contains(jsonBody, `"response":`) {
		t.Fatalf("response field missing: %s", jsonBody)
	}
	if strings.Contains(jsonBody, "version") || strings.Contains(jsonBody, "admin") {
		t.Fatalf("public review leaked admin capability or identity: %s", jsonBody)
	}
}
