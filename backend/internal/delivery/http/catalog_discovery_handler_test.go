package http

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/security/jwt"
	"commerce-backend/internal/storage/reviewmedia"
	cataloguc "commerce-backend/internal/usecase/catalog"
	catalogfakerepos "commerce-backend/internal/usecase/catalog/fakerepos"
)

func setupCatalogDiscoveryRouter(t *testing.T) (*gin.Engine, *jwt.Manager, *catalogfakerepos.Catalog, *reviewmedia.FakeStore) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	manager := jwt.NewManager(testSecret, "commerce-backend")
	repo := catalogfakerepos.NewCatalog()
	store := reviewmedia.NewFakeStore()

	catID := "11111111-1111-1111-1111-111111111111"
	repo.AddCategory(domain.Category{ID: catID, Name: "Điện thoại"})

	t1 := time.Date(2026, 11, 1, 10, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)
	t3 := time.Date(2026, 11, 3, 10, 0, 0, 0, time.UTC)

	endsAt := time.Date(2026, 12, 1, 15, 0, 0, 0, time.UTC)
	repo.AddProductWithActiveState(domain.Product{
		ID:            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
		Name:          "iPhone 16 Pro",
		Model:         "A3294",
		Brand:         "Apple",
		Description:   "Titanium design",
		Category:      domain.Category{ID: catID, Name: "Điện thoại"},
		Featured:      true,
		ImageURLs:     []string{"/media/products/550e8400-e29b-41d4-a716-446655440000.webp"},
		AverageRating: 4.8,
		ReviewCount:   34,
		SoldCount:     120,
		CreatedAt:     t1,
		UpdatedAt:     t1,
		Specs: []domain.SpecGroup{
			{
				Group: "Màn hình",
				Items: []domain.SpecItem{{Label: "Kích thước & Tấm nền", Value: "6.3 inch, LTPO Super Retina XDR OLED, 120Hz"}},
			},
			{
				Group: "Hiệu năng & Chipset",
				Items: []domain.SpecItem{{Label: "Chipset", Value: "Apple A18 Pro"}},
			},
		},
		OptionGroups: []domain.OptionGroup{
			{
				ID:       "grp-storage-1",
				Label:    "Dung lượng",
				Position: 0,
				Values: []domain.OptionValue{
					{ID: "val-256", Label: "256GB"},
					{ID: "val-512", Label: "512GB"},
				},
			},
		},
		Variants: []domain.ProductVariant{
			{
				ID:             "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
				OptionValueIDs: map[string]string{"grp-storage-1": "val-256"},
				PriceVND:       "28990000",
				StockQuantity:  10,
				Active:         true,
				FlashSale: &domain.VariantFlashSale{
					FlashSaleID:   "cccccccc-cccc-cccc-cccc-ccccccccccc1",
					CampaignName:  "Flash Sale Giờ Vàng",
					FlashPriceVND: "25990000",
					Quota:         20,
					SoldQuantity:  7,
					EndsAt:        endsAt,
				},
			},
			{
				ID:             "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2",
				OptionValueIDs: map[string]string{"grp-storage-1": "val-512"},
				PriceVND:       "34990000",
				StockQuantity:  5,
				Active:         true,
				FlashSale:      nil,
			},
		},
	}, true)

	repo.AddProductWithActiveState(domain.Product{
		ID:            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
		Name:          "Samsung Galaxy S25 Đặc Biệt",
		Model:         "SM-S931B",
		Brand:         "Samsung",
		Category:      domain.Category{ID: catID, Name: "Điện thoại"},
		Featured:      false,
		ImageURLs:     []string{"https://example.com/s25.jpg"},
		AverageRating: 4.9,
		ReviewCount:   18,
		SoldCount:     210,
		CreatedAt:     t2,
		UpdatedAt:     t2,
		Variants: []domain.ProductVariant{
			{ID: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3", PriceVND: "21990000", StockQuantity: 12, Active: true},
		},
	}, true)

	repo.AddProductWithActiveState(domain.Product{
		ID:            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
		Name:          "Xiaomi 15",
		Model:         "24129PN74G",
		Brand:         "Xiaomi",
		Category:      domain.Category{ID: catID, Name: "Điện thoại"},
		Featured:      false,
		ImageURLs:     []string{"https://example.com/xm15.jpg"},
		AverageRating: 0,
		ReviewCount:   0,
		SoldCount:     15,
		CreatedAt:     t3,
		UpdatedAt:     t3,
		Variants: []domain.ProductVariant{
			{ID: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4", PriceVND: "18990000", StockQuantity: 7, Active: true},
		},
	}, true)

	uc := cataloguc.New(cataloguc.Dependencies{
		Catalog:    repo,
		MediaStore: store,
	})

	router := gin.New()
	NewRouter(router, Dependencies{
		Catalog: uc,
		JWT:     manager,
	})
	return router, manager, repo, store
}

func makeProductImageUploadRequest(path, token, filename, contentType string, content []byte) *http.Request {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", `form-data; name="file"; filename="`+filename+`"`)
	if contentType != "" {
		h.Set("Content-Type", contentType)
	}
	part, _ := writer.CreatePart(h)
	_, _ = part.Write(content)
	_ = writer.Close()

	req := httptest.NewRequest(http.MethodPost, path, &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", token)
	}
	return req
}

func TestCatalogDiscovery_StorefrontEndpointsAndSnapshots(t *testing.T) {
	router, _, _, _ := setupCatalogDiscoveryRouter(t)

	// 1. GET /api/v1/products?q=dien%20thoai&sort=bestselling&page=1&limit=2 -> sorted full set before pagination
	wList := httptest.NewRecorder()
	router.ServeHTTP(wList, httptest.NewRequest(http.MethodGet, "/api/v1/products?q=dien%20thoai&sort=bestselling&page=1&limit=2", nil))
	require.Equal(t, http.StatusOK, wList.Code, wList.Body.String())

	var listEnv struct {
		Success bool             `json:"success"`
		Data    []map[string]any `json:"data"`
		Meta    ResponseMeta     `json:"meta"`
	}
	require.NoError(t, json.Unmarshal(wList.Body.Bytes(), &listEnv))
	require.Len(t, listEnv.Data, 2)
	assert.Equal(t, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", listEnv.Data[0]["id"], "bestselling #1 should be Samsung (210 sold)")
	assert.EqualValues(t, 4.9, listEnv.Data[0]["averageRating"])
	assert.EqualValues(t, 18, listEnv.Data[0]["reviewCount"])
	assert.EqualValues(t, 210, listEnv.Data[0]["soldCount"])
	assert.Equal(t, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", listEnv.Data[1]["id"], "bestselling #2 should be iPhone (120 sold)")
	require.NotNil(t, listEnv.Meta.Pagination)
	assert.Equal(t, 3, listEnv.Meta.Pagination.Total)
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "products_list_200", "API-CATALOG-MEDIA-SPECS@1", "GET /api/v1/products", nil, wList)

	// 2. min_rating filter excludes unreviewed and low-rated products
	wMinRating := httptest.NewRecorder()
	router.ServeHTTP(wMinRating, httptest.NewRequest(http.MethodGet, "/api/v1/products?min_rating=4.9", nil))
	require.Equal(t, http.StatusOK, wMinRating.Code)
	var minRatingEnv struct {
		Data []map[string]any `json:"data"`
	}
	require.NoError(t, json.Unmarshal(wMinRating.Body.Bytes(), &minRatingEnv))
	require.Len(t, minRatingEnv.Data, 1)
	assert.Equal(t, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", minRatingEnv.Data[0]["id"])

	// 3. Invalid sort & min_rating -> 400 invalid_filter
	wBadFilter := httptest.NewRecorder()
	router.ServeHTTP(wBadFilter, httptest.NewRequest(http.MethodGet, "/api/v1/products?sort=trending&min_rating=6", nil))
	assertErrorEnvelope(t, wBadFilter, http.StatusBadRequest, "invalid_filter", "sort")
	assertErrorEnvelope(t, wBadFilter, http.StatusBadRequest, "invalid_filter", "min_rating")
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "products_filter_invalid_400", "API-CATALOG-MEDIA-SPECS@1", "GET /api/v1/products", nil, wBadFilter)

	// 4. GET /api/v1/products/featured includes stats
	wFeatured := httptest.NewRecorder()
	router.ServeHTTP(wFeatured, httptest.NewRequest(http.MethodGet, "/api/v1/products/featured", nil))
	require.Equal(t, http.StatusOK, wFeatured.Code)
	var featEnv struct {
		Data []map[string]any `json:"data"`
	}
	require.NoError(t, json.Unmarshal(wFeatured.Body.Bytes(), &featEnv))
	require.Len(t, featEnv.Data, 1)
	assert.EqualValues(t, 4.8, featEnv.Data[0]["averageRating"])
	assert.EqualValues(t, 34, featEnv.Data[0]["reviewCount"])
	assert.EqualValues(t, 120, featEnv.Data[0]["soldCount"])
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "products_featured_200", "API-CATALOG-MEDIA-SPECS@1", "GET /api/v1/products/featured", nil, wFeatured)

	// 5. GET /api/v1/products/:id includes specs, stats, and variants[].flashSale
	wDetail := httptest.NewRecorder()
	router.ServeHTTP(wDetail, httptest.NewRequest(http.MethodGet, "/api/v1/products/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", nil))
	require.Equal(t, http.StatusOK, wDetail.Code)
	var detailEnv struct {
		Data map[string]any `json:"data"`
	}
	require.NoError(t, json.Unmarshal(wDetail.Body.Bytes(), &detailEnv))
	assert.EqualValues(t, 4.8, detailEnv.Data["averageRating"])
	assert.EqualValues(t, 34, detailEnv.Data["reviewCount"])
	assert.EqualValues(t, 120, detailEnv.Data["soldCount"])
	specs, ok := detailEnv.Data["specs"].([]any)
	require.True(t, ok)
	require.Len(t, specs, 2)
	variants := detailEnv.Data["variants"].([]any)
	require.Len(t, variants, 2)
	v0 := variants[0].(map[string]any)
	require.NotNil(t, v0["flashSale"])
	fs0 := v0["flashSale"].(map[string]any)
	assert.Equal(t, "25990000", fs0["flashPriceVnd"])
	assert.EqualValues(t, 20, fs0["quota"])
	assert.EqualValues(t, 7, fs0["soldQuantity"])
	v1 := variants[1].(map[string]any)
	assert.Contains(t, v1, "flashSale")
	assert.Nil(t, v1["flashSale"])
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "product_detail_200", "API-CATALOG-MEDIA-SPECS@1", "GET /api/v1/products/:id", nil, wDetail)
}

func TestAdminCatalogMediaAndSpecs_EndpointsAndSnapshots(t *testing.T) {
	router, manager, _, store := setupCatalogDiscoveryRouter(t)
	adminToken := adminBearerToken(t, manager)
	customerToken := customerBearerToken(t, manager)

	// 1. Auth guards on POST /api/v1/admin/products/images
	pngBytes := append([]byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}, bytes.Repeat([]byte{0x42}, 32)...)
	wUnauth := httptest.NewRecorder()
	router.ServeHTTP(wUnauth, makeProductImageUploadRequest("/api/v1/admin/products/images", "", "phone.png", "image/png", pngBytes))
	require.Equal(t, http.StatusUnauthorized, wUnauth.Code)

	wForbidden := httptest.NewRecorder()
	router.ServeHTTP(wForbidden, makeProductImageUploadRequest("/api/v1/admin/products/images", customerToken, "phone.png", "image/png", pngBytes))
	require.Equal(t, http.StatusForbidden, wForbidden.Code)

	// 2. Upload invalid / spoofed image -> 400 validation_error
	wBadUpload := httptest.NewRecorder()
	router.ServeHTTP(wBadUpload, makeProductImageUploadRequest("/api/v1/admin/products/images", adminToken, "fake.png", "image/png", []byte("<html>not an image</html>")))
	assertErrorEnvelope(t, wBadUpload, http.StatusBadRequest, "validation_error", "file")
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_product_image_upload_validation_400", "API-CATALOG-MEDIA-SPECS@1", "POST /api/v1/admin/products/images", nil, wBadUpload)

	// 3. Upload valid WebP image -> 201 Created + stored in products/<key>
	webpBytes := append([]byte("RIFF\x24\x00\x00\x00WEBPVP8 "), make([]byte, 24)...)
	wUpload := httptest.NewRecorder()
	router.ServeHTTP(wUpload, makeProductImageUploadRequest("/api/v1/admin/products/images", adminToken, "phone.webp", "image/webp", webpBytes))
	require.Equal(t, http.StatusCreated, wUpload.Code, wUpload.Body.String())
	var upEnv struct {
		Success bool                        `json:"success"`
		Data    domain.UploadedProductImage `json:"data"`
	}
	require.NoError(t, json.Unmarshal(wUpload.Body.Bytes(), &upEnv))
	assert.True(t, upEnv.Success)
	assert.True(t, domain.ProductImageKeyRegex.MatchString(upEnv.Data.Key))
	assert.Equal(t, "/media/products/"+upEnv.Data.Key, upEnv.Data.URL)
	assert.Equal(t, "image/webp", upEnv.Data.MimeType)
	assert.Equal(t, int64(len(webpBytes)), upEnv.Data.SizeBytes)
	assert.True(t, store.HasObject("products/"+upEnv.Data.Key))
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_product_image_upload_201", "API-CATALOG-MEDIA-SPECS@1", "POST /api/v1/admin/products/images", nil, wUpload)

	// 4. HEAD & GET /media/products/:imageKey -> 200 with Cache-Control & nosniff
	wHead := httptest.NewRecorder()
	router.ServeHTTP(wHead, httptest.NewRequest(http.MethodHead, upEnv.Data.URL, nil))
	require.Equal(t, http.StatusOK, wHead.Code)
	assert.Equal(t, "image/webp", wHead.Header().Get("Content-Type"))
	assert.Equal(t, "public, max-age=86400", wHead.Header().Get("Cache-Control"))
	assert.Equal(t, "nosniff", wHead.Header().Get("X-Content-Type-Options"))
	assert.Empty(t, wHead.Body.Bytes())

	wMediaGet := httptest.NewRecorder()
	router.ServeHTTP(wMediaGet, httptest.NewRequest(http.MethodGet, upEnv.Data.URL, nil))
	require.Equal(t, http.StatusOK, wMediaGet.Code)
	assert.Equal(t, "image/webp", wMediaGet.Header().Get("Content-Type"))
	assert.Equal(t, "public, max-age=86400", wMediaGet.Header().Get("Cache-Control"))
	assert.Equal(t, "nosniff", wMediaGet.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, webpBytes, wMediaGet.Body.Bytes())

	// Missing / invalid imageKey -> 404 product_image_not_found
	wBadKey := httptest.NewRecorder()
	router.ServeHTTP(wBadKey, httptest.NewRequest(http.MethodGet, "/media/products/invalid-key.gif", nil))
	assertErrorEnvelope(t, wBadKey, http.StatusNotFound, "product_image_not_found", "")

	wMissingKey := httptest.NewRecorder()
	router.ServeHTTP(wMissingKey, httptest.NewRequest(http.MethodGet, "/media/products/550e8400-e29b-41d4-a716-446655440099.png", nil))
	assertErrorEnvelope(t, wMissingKey, http.StatusNotFound, "product_image_not_found", "")

	// 5. GET /api/v1/admin/products -> includes stats
	reqAdminList := httptest.NewRequest(http.MethodGet, "/api/v1/admin/products", nil)
	reqAdminList.Header.Set("Authorization", adminToken)
	wAdminList := httptest.NewRecorder()
	router.ServeHTTP(wAdminList, reqAdminList)
	require.Equal(t, http.StatusOK, wAdminList.Code)
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_products_list_200", "API-CATALOG-MEDIA-SPECS@1", "GET /api/v1/admin/products", nil, wAdminList)

	// 6. GET /api/v1/admin/products/:id -> includes specs, no live/flashSale
	reqAdminGet := httptest.NewRequest(http.MethodGet, "/api/v1/admin/products/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", nil)
	reqAdminGet.Header.Set("Authorization", adminToken)
	wAdminGet := httptest.NewRecorder()
	router.ServeHTTP(wAdminGet, reqAdminGet)
	require.Equal(t, http.StatusOK, wAdminGet.Code)
	assert.NotContains(t, wAdminGet.Body.String(), "flashSale")
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_product_detail_200", "API-CATALOG-MEDIA-SPECS@1", "GET /api/v1/admin/products/:id", nil, wAdminGet)

	// 7. POST /api/v1/admin/products with non-empty specs & uploaded + legacy imageUrls
	createPayload := map[string]any{
		"name":          "iPhone 16 Pro Max",
		"model":         "A3297",
		"brand":         "Apple",
		"description":   "Flagship titanium",
		"categoryId":    "11111111-1111-1111-1111-111111111111",
		"price":         "34990000",
		"currency":      "VND",
		"stockQuantity": 20,
		"featured":      true,
		"imageUrls":     []string{upEnv.Data.URL, "https://example.com/ip16pm.jpg"},
		"hasVariants":   true,
		"optionGroups": []map[string]any{
			{
				"id":       "grp-storage",
				"label":    "Dung lượng",
				"position": 0,
				"values": []map[string]any{
					{"id": "val-256", "label": "256GB", "position": 0},
				},
			},
		},
		"variants": []map[string]any{
			{
				"id":             "var-256",
				"optionValueIds": map[string]string{"grp-storage": "val-256"},
				"priceVnd":       "34990000",
				"stockQuantity":  20,
				"active":         true,
			},
		},
		"specs": []map[string]any{
			{
				"group": "Màn hình",
				"items": []map[string]any{
					{"label": "Kích thước & Tấm nền", "value": "6.9 inch Super Retina XDR OLED"},
				},
			},
		},
	}
	createRaw, err := json.Marshal(createPayload)
	require.NoError(t, err)
	reqCreate := httptest.NewRequest(http.MethodPost, "/api/v1/admin/products", bytes.NewReader(createRaw))
	reqCreate.Header.Set("Authorization", adminToken)
	reqCreate.Header.Set("Content-Type", "application/json")
	wCreate := httptest.NewRecorder()
	router.ServeHTTP(wCreate, reqCreate)
	require.Equal(t, http.StatusCreated, wCreate.Code, wCreate.Body.String())

	var createdEnv struct {
		Data struct {
			ID        string             `json:"id"`
			ImageURLs []string           `json:"imageUrls"`
			Specs     []domain.SpecGroup `json:"specs"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(wCreate.Body.Bytes(), &createdEnv))
	require.Equal(t, []string{upEnv.Data.URL, "https://example.com/ip16pm.jpg"}, createdEnv.Data.ImageURLs)
	require.Len(t, createdEnv.Data.Specs, 1)
	assert.Equal(t, "Màn hình", createdEnv.Data.Specs[0].Group)
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_product_create_201", "API-CATALOG-MEDIA-SPECS@1", "POST /api/v1/admin/products", createPayload, wCreate)

	// 8. PUT /api/v1/admin/products/:id with updated specs
	updatePayload := make(map[string]any, len(createPayload))
	for k, v := range createPayload {
		updatePayload[k] = v
	}
	updatePayload["name"] = "iPhone 16 Pro Max (Updated)"
	updatePayload["specs"] = []map[string]any{
		{
			"group": "Hiệu năng & Chipset",
			"items": []map[string]any{
				{"label": "Chipset", "value": "Apple A18 Pro"},
			},
		},
	}
	updateRaw, err := json.Marshal(updatePayload)
	require.NoError(t, err)
	reqUpdate := httptest.NewRequest(http.MethodPut, "/api/v1/admin/products/"+createdEnv.Data.ID, bytes.NewReader(updateRaw))
	reqUpdate.Header.Set("Authorization", adminToken)
	reqUpdate.Header.Set("Content-Type", "application/json")
	wUpdate := httptest.NewRecorder()
	router.ServeHTTP(wUpdate, reqUpdate)
	require.Equal(t, http.StatusOK, wUpdate.Code, wUpdate.Body.String())
	var updatedEnv struct {
		Data struct {
			Name  string `json:"name"`
			Specs []struct {
				Group string `json:"group"`
				Items []struct {
					Label string `json:"label"`
					Value string `json:"value"`
				} `json:"items"`
			} `json:"specs"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(wUpdate.Body.Bytes(), &updatedEnv))
	assert.Equal(t, "iPhone 16 Pro Max (Updated)", updatedEnv.Data.Name)
	require.Len(t, updatedEnv.Data.Specs, 1)
	assert.Equal(t, "Hiệu năng & Chipset", updatedEnv.Data.Specs[0].Group)
	assertOrRecordContractSnapshot(t, enhancementSnapshotPath, enhancementFeature, "admin_product_update_200", "API-CATALOG-MEDIA-SPECS@1", "PUT /api/v1/admin/products/:id", updatePayload, wUpdate)

	// Invalid specs via HTTP -> 400 validation_error
	badSpecsPayload := `{
		"name": "Bad Specs",
		"categoryId": "11111111-1111-1111-1111-111111111111",
		"price": "1000000",
		"specs": [{"group": "", "items": []}]
	}`
	reqBadSpecs := httptest.NewRequest(http.MethodPost, "/api/v1/admin/products", strings.NewReader(badSpecsPayload))
	reqBadSpecs.Header.Set("Authorization", adminToken)
	reqBadSpecs.Header.Set("Content-Type", "application/json")
	wBadSpecs := httptest.NewRecorder()
	router.ServeHTTP(wBadSpecs, reqBadSpecs)
	assertErrorEnvelope(t, wBadSpecs, http.StatusBadRequest, "validation_error", "specs[0].group")
}
