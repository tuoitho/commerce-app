package catalog_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/storage/reviewmedia"
	cataloguc "commerce-backend/internal/usecase/catalog"
	"commerce-backend/internal/usecase/catalog/fakerepos"
)

func setupMediaSpecsUseCase() (*cataloguc.UseCase, *fakerepos.Catalog, *reviewmedia.FakeStore) {
	repo := fakerepos.NewCatalog()
	repo.AddCategory(domain.Category{ID: "11111111-1111-1111-1111-111111111111", Name: "Điện thoại"})
	store := reviewmedia.NewFakeStore()
	uc := cataloguc.New(cataloguc.Dependencies{
		Catalog:    repo,
		MediaStore: store,
	})
	return uc, repo, store
}

func TestAdminUseCase_CreateAndUpdateProduct_WithSpecsAndMediaURLs(t *testing.T) {
	uc, _, _ := setupMediaSpecsUseCase()
	ctx := context.Background()

	mediaURL := "/media/products/550e8400-e29b-41d4-a716-446655440000.webp"
	legacyURL := "https://example.com/phone.jpg"

	created, err := uc.CreateProduct(ctx, domain.SaveProductInput{
		Name:          "iPhone 16 Pro",
		Model:         "A3294",
		Brand:         "Apple",
		CategoryID:    "11111111-1111-1111-1111-111111111111",
		Price:         "28990000",
		StockQuantity: 10,
		ImageURLs:     []string{mediaURL, legacyURL},
		Specs: []domain.SpecGroup{
			{
				Group: " Màn hình ",
				Items: []domain.SpecItem{
					{Label: " Kích thước ", Value: " 6.3 inch OLED "},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("CreateProduct failed: %v", err)
	}
	if len(created.ImageURLs) != 2 || created.ImageURLs[0] != mediaURL || created.ImageURLs[1] != legacyURL {
		t.Fatalf("unexpected imageUrls: %+v", created.ImageURLs)
	}
	if len(created.Specs) != 1 || created.Specs[0].Group != "Màn hình" || created.Specs[0].Items[0].Label != "Kích thước" || created.Specs[0].Items[0].Value != "6.3 inch OLED" {
		t.Fatalf("unexpected created specs: %+v", created.Specs)
	}

	updated, err := uc.UpdateProduct(ctx, created.ID, domain.SaveProductInput{
		Name:          "iPhone 16 Pro",
		Model:         "A3294",
		Brand:         "Apple",
		CategoryID:    "11111111-1111-1111-1111-111111111111",
		Price:         "27990000",
		StockQuantity: 8,
		ImageURLs:     []string{mediaURL},
		Specs: []domain.SpecGroup{
			{
				Group: "Pin & Sạc",
				Items: []domain.SpecItem{{Label: "Sạc nhanh", Value: "MagSafe 25W"}},
			},
		},
	})
	if err != nil {
		t.Fatalf("UpdateProduct failed: %v", err)
	}
	if len(updated.Specs) != 1 || updated.Specs[0].Group != "Pin & Sạc" {
		t.Fatalf("unexpected updated specs: %+v", updated.Specs)
	}
}

func TestAdminUseCase_SpecsAndImageURLsValidation(t *testing.T) {
	uc, _, _ := setupMediaSpecsUseCase()
	ctx := context.Background()

	base := func() domain.SaveProductInput {
		return domain.SaveProductInput{
			Name:          "Phone",
			CategoryID:    "11111111-1111-1111-1111-111111111111",
			Price:         "10000000",
			StockQuantity: 5,
		}
	}

	tooManyGroups := make([]domain.SpecGroup, 13)
	for i := range tooManyGroups {
		tooManyGroups[i] = domain.SpecGroup{
			Group: "Group " + string(rune('A'+i)),
			Items: []domain.SpecItem{{Label: "L", Value: "V"}},
		}
	}

	tooManyItems := make([]domain.SpecItem, 21)
	for i := range tooManyItems {
		tooManyItems[i] = domain.SpecItem{Label: "L", Value: "V"}
	}

	tests := []struct {
		name  string
		mut   func(*domain.SaveProductInput)
		field string
	}{
		{
			name:  "more than 12 spec groups",
			mut:   func(in *domain.SaveProductInput) { in.Specs = tooManyGroups },
			field: "specs",
		},
		{
			name: "empty group name",
			mut: func(in *domain.SaveProductInput) {
				in.Specs = []domain.SpecGroup{{Group: "   ", Items: []domain.SpecItem{{Label: "L", Value: "V"}}}}
			},
			field: "specs[0].group",
		},
		{
			name: "group name longer than 80 chars",
			mut: func(in *domain.SaveProductInput) {
				in.Specs = []domain.SpecGroup{{Group: strings.Repeat("ă", 81), Items: []domain.SpecItem{{Label: "L", Value: "V"}}}}
			},
			field: "specs[0].group",
		},
		{
			name: "duplicate group name case-insensitive",
			mut: func(in *domain.SaveProductInput) {
				in.Specs = []domain.SpecGroup{
					{Group: "Màn hình", Items: []domain.SpecItem{{Label: "L", Value: "V"}}},
					{Group: "màn hình", Items: []domain.SpecItem{{Label: "L2", Value: "V2"}}},
				}
			},
			field: "specs[1].group",
		},
		{
			name: "empty items in group",
			mut: func(in *domain.SaveProductInput) {
				in.Specs = []domain.SpecGroup{{Group: "Camera", Items: nil}}
			},
			field: "specs[0].items",
		},
		{
			name: "more than 20 items in group",
			mut: func(in *domain.SaveProductInput) {
				in.Specs = []domain.SpecGroup{{Group: "Camera", Items: tooManyItems}}
			},
			field: "specs[0].items",
		},
		{
			name: "empty item label",
			mut: func(in *domain.SaveProductInput) {
				in.Specs = []domain.SpecGroup{{Group: "Camera", Items: []domain.SpecItem{{Label: " ", Value: "48MP"}}}}
			},
			field: "specs[0].items[0].label",
		},
		{
			name: "item value longer than 300 chars",
			mut: func(in *domain.SaveProductInput) {
				in.Specs = []domain.SpecGroup{{Group: "Camera", Items: []domain.SpecItem{{Label: "Cảm biến", Value: strings.Repeat("x", 301)}}}}
			},
			field: "specs[0].items[0].value",
		},
		{
			name: "invalid image url traversal",
			mut: func(in *domain.SaveProductInput) {
				in.ImageURLs = []string{"/media/products/../secret.png"}
			},
			field: "imageUrls[0]",
		},
		{
			name: "invalid image url javascript scheme",
			mut: func(in *domain.SaveProductInput) {
				in.ImageURLs = []string{"javascript:alert(1)"}
			},
			field: "imageUrls[0]",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			in := base()
			tc.mut(&in)
			_, err := uc.CreateProduct(ctx, in)
			var valErr *domain.ValidationError
			if !errors.As(err, &valErr) {
				t.Fatalf("expected ValidationError, got %v", err)
			}
			if valErr.Fields[tc.field] == "" {
				t.Fatalf("expected error on field %q, got %+v", tc.field, valErr.Fields)
			}
		})
	}
}

func TestProductMedia_UploadAndServe(t *testing.T) {
	uc, _, store := setupMediaSpecsUseCase()
	ctx := context.Background()

	jpegBytes := append([]byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00}, make([]byte, 32)...)
	pngBytes := append([]byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 32)...)
	webpBytes := append([]byte("RIFF\x24\x00\x00\x00WEBPVP8 "), make([]byte, 24)...)

	for _, tc := range []struct {
		name     string
		data     []byte
		declared string
		wantMime string
		wantExt  string
	}{
		{"jpeg", jpegBytes, "image/jpeg", "image/jpeg", ".jpg"},
		{"png", pngBytes, "image/png", "image/png", ".png"},
		{"webp", webpBytes, "image/webp", "image/webp", ".webp"},
	} {
		t.Run("valid_"+tc.name, func(t *testing.T) {
			res, err := uc.UploadProductImage(ctx, domain.UploadProductImageInput{
				Reader:              bytes.NewReader(tc.data),
				Size:                int64(len(tc.data)),
				DeclaredContentType: tc.declared,
			})
			if err != nil {
				t.Fatalf("UploadProductImage failed: %v", err)
			}
			if !domain.ProductImageKeyRegex.MatchString(res.Key) || !strings.HasSuffix(res.Key, tc.wantExt) {
				t.Fatalf("unexpected key %q", res.Key)
			}
			if res.URL != "/media/products/"+res.Key || res.MimeType != tc.wantMime || res.SizeBytes != int64(len(tc.data)) {
				t.Fatalf("unexpected response %+v", res)
			}
			if !store.HasObject("products/" + res.Key) {
				t.Fatalf("expected object stored at products/%s", res.Key)
			}

			info, err := uc.StatProductImage(ctx, res.Key)
			if err != nil {
				t.Fatalf("StatProductImage failed: %v", err)
			}
			if info.ContentType != tc.wantMime || info.Size != int64(len(tc.data)) {
				t.Fatalf("unexpected stat info %+v", info)
			}

			stream, info2, err := uc.OpenProductImage(ctx, res.Key)
			if err != nil {
				t.Fatalf("OpenProductImage failed: %v", err)
			}
			defer stream.Close()
			gotBytes, err := io.ReadAll(stream)
			if err != nil || !bytes.Equal(gotBytes, tc.data) || info2.ContentType != tc.wantMime {
				t.Fatalf("unexpected stream data/info: len=%d err=%v info=%+v", len(gotBytes), err, info2)
			}
		})
	}

	// Reject empty, >10MB, fake magic bytes, MIME mismatch
	t.Run("reject empty", func(t *testing.T) {
		_, err := uc.UploadProductImage(ctx, domain.UploadProductImageInput{
			Reader: bytes.NewReader(nil), Size: 0, DeclaredContentType: "image/png",
		})
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) || valErr.Fields["file"] == "" {
			t.Fatalf("expected validation error on file, got %v", err)
		}
	})

	t.Run("reject > 10MB", func(t *testing.T) {
		oversize := domain.MaxProductImageBytes + 1
		_, err := uc.UploadProductImage(ctx, domain.UploadProductImageInput{
			Reader: bytes.NewReader(pngBytes), Size: oversize, DeclaredContentType: "image/png",
		})
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) || valErr.Fields["file"] == "" {
			t.Fatalf("expected validation error on file, got %v", err)
		}
	})

	t.Run("reject spoofed magic bytes", func(t *testing.T) {
		_, err := uc.UploadProductImage(ctx, domain.UploadProductImageInput{
			Reader: bytes.NewReader([]byte("<html>not an image</html>")), Size: 25, DeclaredContentType: "image/png",
		})
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) || valErr.Fields["file"] == "" {
			t.Fatalf("expected validation error on spoofed file, got %v", err)
		}
	})

	t.Run("reject declared MIME mismatch", func(t *testing.T) {
		_, err := uc.UploadProductImage(ctx, domain.UploadProductImageInput{
			Reader: bytes.NewReader(pngBytes), Size: int64(len(pngBytes)), DeclaredContentType: "image/jpeg",
		})
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) || valErr.Fields["file"] == "" {
			t.Fatalf("expected validation error on MIME mismatch, got %v", err)
		}
	})

	t.Run("stat and open reject invalid or missing key", func(t *testing.T) {
		if _, err := uc.StatProductImage(ctx, "../bad.png"); !errors.Is(err, domain.ErrProductImageNotFound) {
			t.Fatalf("expected ErrProductImageNotFound, got %v", err)
		}
		if _, _, err := uc.OpenProductImage(ctx, "550e8400-e29b-41d4-a716-446655440001.png"); !errors.Is(err, domain.ErrProductImageNotFound) {
			t.Fatalf("expected ErrProductImageNotFound for missing object, got %v", err)
		}
	})
}
