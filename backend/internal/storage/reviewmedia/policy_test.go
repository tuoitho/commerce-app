package reviewmedia

import (
	"testing"
)

func TestIsPolicyAllowingAnonymousRead(t *testing.T) {
	tests := []struct {
		name       string
		policy     string
		wantPublic bool
		wantErr    bool
	}{
		{
			name:       "empty policy",
			policy:     "",
			wantPublic: false,
			wantErr:    false,
		},
		{
			name:       "whitespace policy",
			policy:     "   \n\t  ",
			wantPublic: false,
			wantErr:    false,
		},
		{
			name: "anonymous read with string principal and action",
			policy: `{
				"Version": "2012-10-17",
				"Statement": [
					{
						"Effect": "Allow",
						"Principal": "*",
						"Action": "s3:GetObject",
						"Resource": "arn:aws:s3:::product-review-media/*"
					}
				]
			}`,
			wantPublic: true,
			wantErr:    false,
		},
		{
			name: "anonymous read with object principal and array action",
			policy: `{
				"Version": "2012-10-17",
				"Statement": [
					{
						"Effect": "Allow",
						"Principal": {
							"AWS": ["*"]
						},
						"Action": [
							"s3:GetObject",
							"s3:GetBucketLocation"
						],
						"Resource": "arn:aws:s3:::product-review-media/*"
					}
				]
			}`,
			wantPublic: true,
			wantErr:    false,
		},
		{
			name: "anonymous wildcard action",
			policy: `{
				"Version": "2012-10-17",
				"Statement": [
					{
						"Effect": "Allow",
						"Principal": "*",
						"Action": "*",
						"Resource": "arn:aws:s3:::product-review-media/*"
					}
				]
			}`,
			wantPublic: true,
			wantErr:    false,
		},
		{
			name: "anonymous s3 wildcard action",
			policy: `{
				"Version": "2012-10-17",
				"Statement": [
					{
						"Effect": "Allow",
						"Principal": {
							"AWS": "*"
						},
						"Action": "s3:*",
						"Resource": "arn:aws:s3:::product-review-media/*"
					}
				]
			}`,
			wantPublic: true,
			wantErr:    false,
		},
		{
			name: "specific user allow - private",
			policy: `{
				"Version": "2012-10-17",
				"Statement": [
					{
						"Effect": "Allow",
						"Principal": {
							"AWS": "arn:aws:iam::123456789012:user/Alice"
						},
						"Action": "s3:GetObject",
						"Resource": "arn:aws:s3:::product-review-media/*"
					}
				]
			}`,
			wantPublic: false,
			wantErr:    false,
		},
		{
			name: "anonymous write only - not read",
			policy: `{
				"Version": "2012-10-17",
				"Statement": [
					{
						"Effect": "Allow",
						"Principal": "*",
						"Action": "s3:PutObject",
						"Resource": "arn:aws:s3:::product-review-media/*"
					}
				]
			}`,
			wantPublic: false,
			wantErr:    false,
		},
		{
			name: "anonymous deny effect",
			policy: `{
				"Version": "2012-10-17",
				"Statement": [
					{
						"Effect": "Deny",
						"Principal": "*",
						"Action": "s3:GetObject",
						"Resource": "arn:aws:s3:::product-review-media/*"
					}
				]
			}`,
			wantPublic: false,
			wantErr:    false,
		},
		{
			name:       "invalid json",
			policy:     `{not-valid-json`,
			wantPublic: false,
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := IsPolicyAllowingAnonymousRead(tt.policy)
			if (err != nil) != tt.wantErr {
				t.Fatalf("IsPolicyAllowingAnonymousRead() error = %v, wantErr %v", err, tt.wantErr)
			}
			if got != tt.wantPublic {
				t.Errorf("IsPolicyAllowingAnonymousRead() = %v, want %v", got, tt.wantPublic)
			}
		})
	}
}
