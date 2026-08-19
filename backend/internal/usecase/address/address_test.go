package address_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"commerce-backend/internal/domain"
	"commerce-backend/internal/usecase/address"
)

type fakeAddressRepo struct {
	addresses map[string][]domain.Address
}

func newFakeAddressRepo() *fakeAddressRepo {
	return &fakeAddressRepo{
		addresses: make(map[string][]domain.Address),
	}
}

func (f *fakeAddressRepo) ListByUser(_ context.Context, userID string) ([]domain.Address, error) {
	list, ok := f.addresses[userID]
	if !ok {
		return []domain.Address{}, nil
	}
	result := make([]domain.Address, len(list))
	copy(result, list)
	return result, nil
}

func (f *fakeAddressRepo) GetByID(_ context.Context, userID, id string) (*domain.Address, error) {
	list := f.addresses[userID]
	for _, a := range list {
		if a.ID == id {
			cp := a
			return &cp, nil
		}
	}
	return nil, domain.ErrAddressNotFound
}

var fakeIDCounter = 0

func (f *fakeAddressRepo) Create(_ context.Context, userID string, input domain.AddressInput) (*domain.Address, error) {
	list := f.addresses[userID]
	isDefault := input.IsDefault
	if len(list) == 0 {
		isDefault = true
	} else if isDefault {
		for i := range list {
			list[i].IsDefault = false
		}
	}

	fakeIDCounter++
	newAddr := domain.Address{
		ID:            "addr-" + time.Now().Format("150405") + "-" + string(rune('0'+fakeIDCounter)),
		UserID:        userID,
		RecipientName: input.RecipientName,
		Phone:         input.Phone,
		ProvinceCode:  input.ProvinceCode,
		ProvinceName:  "Thành phố Hà Nội",
		WardCode:      input.WardCode,
		WardName:      "Phường Ba Đình",
		DetailAddress: input.DetailAddress,
		IsDefault:     isDefault,
		CreatedAt:     time.Now().UTC(),
		UpdatedAt:     time.Now().UTC(),
	}
	list = append(list, newAddr)
	f.addresses[userID] = list
	cp := newAddr
	return &cp, nil
}

func (f *fakeAddressRepo) Update(_ context.Context, userID, id string, input domain.AddressInput) (*domain.Address, error) {
	list := f.addresses[userID]
	idx := -1
	for i, a := range list {
		if a.ID == id {
			idx = i
			break
		}
	}
	if idx == -1 {
		return nil, domain.ErrAddressNotFound
	}

	if input.IsDefault {
		for i := range list {
			list[i].IsDefault = false
		}
	}

	list[idx].RecipientName = input.RecipientName
	list[idx].Phone = input.Phone
	list[idx].ProvinceCode = input.ProvinceCode
	list[idx].ProvinceName = "Thành phố Hà Nội"
	list[idx].WardCode = input.WardCode
	list[idx].WardName = "Phường Ba Đình"
	list[idx].DetailAddress = input.DetailAddress
	list[idx].IsDefault = input.IsDefault
	list[idx].UpdatedAt = time.Now().UTC()

	f.addresses[userID] = list
	cp := list[idx]
	return &cp, nil
}

func (f *fakeAddressRepo) Delete(_ context.Context, userID, id string) error {
	list := f.addresses[userID]
	idx := -1
	for i, a := range list {
		if a.ID == id {
			idx = i
			break
		}
	}
	if idx == -1 {
		return domain.ErrAddressNotFound
	}

	f.addresses[userID] = append(list[:idx], list[idx+1:]...)
	return nil
}

func (f *fakeAddressRepo) SetDefault(_ context.Context, userID, id string) (*domain.Address, error) {
	list := f.addresses[userID]
	idx := -1
	for i, a := range list {
		if a.ID == id {
			idx = i
			break
		}
	}
	if idx == -1 {
		return nil, domain.ErrAddressNotFound
	}

	for i := range list {
		list[i].IsDefault = (i == idx)
	}
	list[idx].UpdatedAt = time.Now().UTC()

	f.addresses[userID] = list
	cp := list[idx]
	return &cp, nil
}

type fakeAreaRepo struct {
	provinces []domain.Province
	wards     map[int][]domain.Ward
}

func (f *fakeAreaRepo) ListProvinces(_ context.Context) ([]domain.Province, error) {
	return f.provinces, nil
}

func (f *fakeAreaRepo) ListWards(_ context.Context, provinceCode int) ([]domain.Ward, error) {
	w, ok := f.wards[provinceCode]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return w, nil
}

func (f *fakeAreaRepo) Resolve(_ context.Context, provinceCode, wardCode int) (domain.Province, domain.Ward, error) {
	var targetP *domain.Province
	for _, p := range f.provinces {
		if p.Code == provinceCode {
			targetP = &p
			break
		}
	}
	if targetP == nil {
		return domain.Province{}, domain.Ward{}, domain.ErrNotFound
	}

	wards, ok := f.wards[provinceCode]
	if !ok {
		return domain.Province{}, domain.Ward{}, domain.ErrNotFound
	}

	for _, w := range wards {
		if w.Code == wardCode {
			return *targetP, w, nil
		}
	}

	return domain.Province{}, domain.Ward{}, domain.ErrNotFound
}

func setupAddressTest() (*address.UseCase, *fakeAddressRepo, *fakeAreaRepo) {
	addrRepo := newFakeAddressRepo()
	areaRepo := &fakeAreaRepo{
		provinces: []domain.Province{
			{Code: 1, Name: "Thành phố Hà Nội"},
			{Code: 79, Name: "Thành phố Hồ Chí Minh"},
		},
		wards: map[int][]domain.Ward{
			1: {
				{Code: 4, ProvinceCode: 1, Name: "Phường Ba Đình"},
				{Code: 6, ProvinceCode: 1, Name: "Phường Hoàn Kiếm"},
			},
			79: {
				{Code: 760, ProvinceCode: 79, Name: "Phường Bến Nghé"},
			},
		},
	}
	uc := address.New(address.Dependencies{
		Address: addrRepo,
		Area:    areaRepo,
	})
	return uc, addrRepo, areaRepo
}

func TestAddressUseCase_Create_Validation(t *testing.T) {
	uc, _, _ := setupAddressTest()
	ctx := context.Background()

	t.Run("missing recipient_name", func(t *testing.T) {
		_, err := uc.Create(ctx, "user-1", domain.AddressInput{
			RecipientName: "   ",
			Phone:         "0987654321",
			ProvinceCode:  1,
			WardCode:      4,
			DetailAddress: "Số 1 Tràng Tiền",
		})
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) {
			t.Fatalf("expected ValidationError, got %v", err)
		}
		if _, ok := valErr.Fields["recipient_name"]; !ok {
			t.Errorf("expected recipient_name field error, got %+v", valErr.Fields)
		}
	})

	t.Run("invalid phone formats", func(t *testing.T) {
		invalidPhones := []string{"", "1234567890", "09876", "098765432100", "098765432a", "+84987654321"}
		for _, phone := range invalidPhones {
			_, err := uc.Create(ctx, "user-1", domain.AddressInput{
				RecipientName: "Nguyen Van A",
				Phone:         phone,
				ProvinceCode:  1,
				WardCode:      4,
				DetailAddress: "Số 1 Tràng Tiền",
			})
			var valErr *domain.ValidationError
			if !errors.As(err, &valErr) {
				t.Fatalf("expected ValidationError for phone %q, got %v", phone, err)
			}
			if _, ok := valErr.Fields["phone"]; !ok {
				t.Errorf("expected phone field error for phone %q, got %+v", phone, valErr.Fields)
			}
		}
	})

	t.Run("valid phone formats (10 and 11 digits starting with 0)", func(t *testing.T) {
		validPhones := []string{"0987654321", "01234567890"}
		for _, phone := range validPhones {
			addr, err := uc.Create(ctx, "user-valid-phone", domain.AddressInput{
				RecipientName: "Nguyen Van A",
				Phone:         phone,
				ProvinceCode:  1,
				WardCode:      4,
				DetailAddress: "Số 1 Tràng Tiền",
			})
			if err != nil {
				t.Fatalf("unexpected error for phone %q: %v", phone, err)
			}
			if addr == nil || addr.Phone != phone {
				t.Errorf("expected phone %s, got %+v", phone, addr)
			}
		}
	})

	t.Run("missing detail_address", func(t *testing.T) {
		_, err := uc.Create(ctx, "user-1", domain.AddressInput{
			RecipientName: "Nguyen Van A",
			Phone:         "0987654321",
			ProvinceCode:  1,
			WardCode:      4,
			DetailAddress: "   ",
		})
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) {
			t.Fatalf("expected ValidationError, got %v", err)
		}
		if _, ok := valErr.Fields["detail_address"]; !ok {
			t.Errorf("expected detail_address field error, got %+v", valErr.Fields)
		}
	})

	t.Run("invalid province_code", func(t *testing.T) {
		_, err := uc.Create(ctx, "user-1", domain.AddressInput{
			RecipientName: "Nguyen Van A",
			Phone:         "0987654321",
			ProvinceCode:  999,
			WardCode:      4,
			DetailAddress: "Số 1 Tràng Tiền",
		})
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) {
			t.Fatalf("expected ValidationError, got %v", err)
		}
		if _, ok := valErr.Fields["province_code"]; !ok {
			t.Errorf("expected province_code field error, got %+v", valErr.Fields)
		}
	})

	t.Run("invalid ward_code under valid province", func(t *testing.T) {
		_, err := uc.Create(ctx, "user-1", domain.AddressInput{
			RecipientName: "Nguyen Van A",
			Phone:         "0987654321",
			ProvinceCode:  1,
			WardCode:      999,
			DetailAddress: "Số 1 Tràng Tiền",
		})
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) {
			t.Fatalf("expected ValidationError, got %v", err)
		}
		if _, ok := valErr.Fields["ward_code"]; !ok {
			t.Errorf("expected ward_code field error, got %+v", valErr.Fields)
		}
	})
}

func TestAddressUseCase_FirstAddress_AutoDefault(t *testing.T) {
	uc, _, _ := setupAddressTest()
	ctx := context.Background()

	// First address created with IsDefault=false should still become default
	addr, err := uc.Create(ctx, "user-first", domain.AddressInput{
		RecipientName: "Nguyen Van A",
		Phone:         "0987654321",
		ProvinceCode:  1,
		WardCode:      4,
		DetailAddress: "Số 1 Tràng Tiền",
		IsDefault:     false,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !addr.IsDefault {
		t.Errorf("expected first address to be auto-default, got isDefault=false")
	}

	// Second address with IsDefault=false should stay false
	addr2, err := uc.Create(ctx, "user-first", domain.AddressInput{
		RecipientName: "Nguyen Van B",
		Phone:         "0987654322",
		ProvinceCode:  1,
		WardCode:      6,
		DetailAddress: "Số 2 Tràng Tiền",
		IsDefault:     false,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if addr2.IsDefault {
		t.Errorf("expected second address to have isDefault=false")
	}

	// Verify list shows only first as default
	list, err := uc.List(ctx, "user-first")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("expected 2 addresses, got %d", len(list))
	}
	defaultCount := 0
	for _, a := range list {
		if a.IsDefault {
			defaultCount++
		}
	}
	if defaultCount != 1 {
		t.Errorf("expected exactly 1 default address, got %d", defaultCount)
	}
}

func TestAddressUseCase_SetDefault_OnlyOneDefault(t *testing.T) {
	uc, _, _ := setupAddressTest()
	ctx := context.Background()

	addr1, err := uc.Create(ctx, "user-multi", domain.AddressInput{
		RecipientName: "Nguyen Van A",
		Phone:         "0987654321",
		ProvinceCode:  1,
		WardCode:      4,
		DetailAddress: "Số 1 Tràng Tiền",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	addr2, err := uc.Create(ctx, "user-multi", domain.AddressInput{
		RecipientName: "Nguyen Van B",
		Phone:         "0987654322",
		ProvinceCode:  1,
		WardCode:      6,
		DetailAddress: "Số 2 Tràng Tiền",
		IsDefault:     true, // setting this one as default
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !addr2.IsDefault {
		t.Errorf("expected addr2 to be default")
	}

	// Verify addr1 is no longer default
	checkAddr1, err := uc.GetByID(ctx, "user-multi", addr1.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if checkAddr1.IsDefault {
		t.Errorf("expected addr1 isDefault to be false after addr2 became default")
	}

	// Explicitly call SetDefault on addr1
	updatedAddr1, err := uc.SetDefault(ctx, "user-multi", addr1.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !updatedAddr1.IsDefault {
		t.Errorf("expected addr1 to be default after SetDefault")
	}

	checkAddr2, err := uc.GetByID(ctx, "user-multi", addr2.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if checkAddr2.IsDefault {
		t.Errorf("expected addr2 isDefault to be false after addr1 became default")
	}
}

func TestAddressUseCase_Delete_DoesNotPromoteDefault(t *testing.T) {
	uc, _, _ := setupAddressTest()
	ctx := context.Background()

	addr1, err := uc.Create(ctx, "user-del", domain.AddressInput{
		RecipientName: "Nguyen Van A",
		Phone:         "0987654321",
		ProvinceCode:  1,
		WardCode:      4,
		DetailAddress: "Số 1 Tràng Tiền",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	addr2, err := uc.Create(ctx, "user-del", domain.AddressInput{
		RecipientName: "Nguyen Van B",
		Phone:         "0987654322",
		ProvinceCode:  1,
		WardCode:      6,
		DetailAddress: "Số 2 Tràng Tiền",
		IsDefault:     false,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Delete the default address addr1
	err = uc.Delete(ctx, "user-del", addr1.ID)
	if err != nil {
		t.Fatalf("unexpected error deleting address: %v", err)
	}

	// Verify addr2 is NOT promoted to default (R2.6)
	checkAddr2, err := uc.GetByID(ctx, "user-del", addr2.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if checkAddr2.IsDefault {
		t.Errorf("expected addr2 to remain non-default after deleting default address")
	}

	list, err := uc.List(ctx, "user-del")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 address, got %d", len(list))
	}
	if list[0].IsDefault {
		t.Errorf("expected 0 default addresses in list after deleting default")
	}
}

func TestAddressUseCase_IsolationBetweenUsers(t *testing.T) {
	uc, _, _ := setupAddressTest()
	ctx := context.Background()

	addr1, err := uc.Create(ctx, "user-A", domain.AddressInput{
		RecipientName: "User A",
		Phone:         "0987654321",
		ProvinceCode:  1,
		WardCode:      4,
		DetailAddress: "Số 1 Tràng Tiền",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// user-B tries to get user-A's address -> 404 ErrAddressNotFound
	_, err = uc.GetByID(ctx, "user-B", addr1.ID)
	if !errors.Is(err, domain.ErrAddressNotFound) {
		t.Errorf("expected ErrAddressNotFound when accessing another user's address, got %v", err)
	}

	// user-B tries to update user-A's address -> ErrAddressNotFound
	_, err = uc.Update(ctx, "user-B", addr1.ID, domain.AddressInput{
		RecipientName: "Hacker",
		Phone:         "0987654321",
		ProvinceCode:  1,
		WardCode:      4,
		DetailAddress: "Số 1 Tràng Tiền",
	})
	if !errors.Is(err, domain.ErrAddressNotFound) {
		t.Errorf("expected ErrAddressNotFound when updating another user's address, got %v", err)
	}

	// user-B tries to delete user-A's address -> ErrAddressNotFound
	err = uc.Delete(ctx, "user-B", addr1.ID)
	if !errors.Is(err, domain.ErrAddressNotFound) {
		t.Errorf("expected ErrAddressNotFound when deleting another user's address, got %v", err)
	}

	// user-B tries to set default user-A's address -> ErrAddressNotFound
	_, err = uc.SetDefault(ctx, "user-B", addr1.ID)
	if !errors.Is(err, domain.ErrAddressNotFound) {
		t.Errorf("expected ErrAddressNotFound when setting default on another user's address, got %v", err)
	}
}

func TestAddressUseCase_Update_Validation(t *testing.T) {
	uc, _, _ := setupAddressTest()
	ctx := context.Background()

	addr, err := uc.Create(ctx, "user-upd", domain.AddressInput{
		RecipientName: "Nguyen Van A",
		Phone:         "0987654321",
		ProvinceCode:  1,
		WardCode:      4,
		DetailAddress: "Số 1 Tràng Tiền",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	t.Run("update with invalid phone", func(t *testing.T) {
		_, err := uc.Update(ctx, "user-upd", addr.ID, domain.AddressInput{
			RecipientName: "Nguyen Van A",
			Phone:         "invalid",
			ProvinceCode:  1,
			WardCode:      4,
			DetailAddress: "Số 1 Tràng Tiền",
		})
		var valErr *domain.ValidationError
		if !errors.As(err, &valErr) {
			t.Fatalf("expected ValidationError, got %v", err)
		}
		if _, ok := valErr.Fields["phone"]; !ok {
			t.Errorf("expected phone field error, got %+v", valErr.Fields)
		}
	})

	t.Run("update non-existent address", func(t *testing.T) {
		_, err := uc.Update(ctx, "user-upd", "non-existent-id", domain.AddressInput{
			RecipientName: "Nguyen Van A",
			Phone:         "0987654321",
			ProvinceCode:  1,
			WardCode:      4,
			DetailAddress: "Số 1 Tràng Tiền",
		})
		if !errors.Is(err, domain.ErrAddressNotFound) {
			t.Errorf("expected ErrAddressNotFound, got %v", err)
		}
	})

	t.Run("successful update", func(t *testing.T) {
		updated, err := uc.Update(ctx, "user-upd", addr.ID, domain.AddressInput{
			RecipientName: "Nguyen Van Updated",
			Phone:         "0912345678",
			ProvinceCode:  79,
			WardCode:      760,
			DetailAddress: "Số 99 Lê Lợi",
			IsDefault:     true,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if updated.RecipientName != "Nguyen Van Updated" || updated.Phone != "0912345678" || updated.DetailAddress != "Số 99 Lê Lợi" {
			t.Errorf("unexpected updated data: %+v", updated)
		}
	})
}
