package address

import (
	"context"
	"regexp"
	"strings"

	"commerce-backend/internal/domain"
)

var phoneRegex = regexp.MustCompile(`^0\d{9,10}$`)

type Dependencies struct {
	Address domain.AddressRepository
	Area    domain.AreaRepository
}

type UseCase struct {
	address domain.AddressRepository
	area    domain.AreaRepository
}

func New(deps Dependencies) *UseCase {
	return &UseCase{
		address: deps.Address,
		area:    deps.Area,
	}
}

func (uc *UseCase) List(ctx context.Context, userID string) ([]domain.Address, error) {
	return uc.address.ListByUser(ctx, userID)
}

func (uc *UseCase) GetByID(ctx context.Context, userID, id string) (*domain.Address, error) {
	if strings.TrimSpace(id) == "" {
		return nil, domain.ErrAddressNotFound
	}
	return uc.address.GetByID(ctx, userID, id)
}

func (uc *UseCase) Create(ctx context.Context, userID string, input domain.AddressInput) (*domain.Address, error) {
	input.RecipientName = strings.TrimSpace(input.RecipientName)
	input.Phone = strings.TrimSpace(input.Phone)
	input.DetailAddress = strings.TrimSpace(input.DetailAddress)

	if err := uc.validateInput(ctx, input); err != nil {
		return nil, err
	}

	return uc.address.Create(ctx, userID, input)
}

func (uc *UseCase) Update(ctx context.Context, userID, id string, input domain.AddressInput) (*domain.Address, error) {
	if strings.TrimSpace(id) == "" {
		return nil, domain.ErrAddressNotFound
	}

	input.RecipientName = strings.TrimSpace(input.RecipientName)
	input.Phone = strings.TrimSpace(input.Phone)
	input.DetailAddress = strings.TrimSpace(input.DetailAddress)

	if err := uc.validateInput(ctx, input); err != nil {
		return nil, err
	}

	return uc.address.Update(ctx, userID, id, input)
}

func (uc *UseCase) Delete(ctx context.Context, userID, id string) error {
	if strings.TrimSpace(id) == "" {
		return domain.ErrAddressNotFound
	}
	return uc.address.Delete(ctx, userID, id)
}

func (uc *UseCase) SetDefault(ctx context.Context, userID, id string) (*domain.Address, error) {
	if strings.TrimSpace(id) == "" {
		return nil, domain.ErrAddressNotFound
	}
	return uc.address.SetDefault(ctx, userID, id)
}

func (uc *UseCase) validateInput(ctx context.Context, input domain.AddressInput) error {
	fields := make(map[string]string)

	if input.RecipientName == "" {
		fields["recipient_name"] = "Tên người nhận không được để trống"
	}

	if !phoneRegex.MatchString(input.Phone) {
		fields["phone"] = "Số điện thoại không hợp lệ"
	}

	if input.DetailAddress == "" {
		fields["detail_address"] = "Địa chỉ chi tiết không được để trống"
	}

	if input.ProvinceCode <= 0 {
		fields["province_code"] = "Tỉnh/thành phố không hợp lệ"
	}

	if input.WardCode <= 0 {
		fields["ward_code"] = "Phường/xã không hợp lệ"
	}

	if input.ProvinceCode > 0 && input.WardCode > 0 && uc.area != nil {
		if _, _, err := uc.area.Resolve(ctx, input.ProvinceCode, input.WardCode); err != nil {
			if _, pErr := uc.area.ListWards(ctx, input.ProvinceCode); pErr != nil {
				fields["province_code"] = "Tỉnh/thành phố không hợp lệ"
			} else {
				fields["ward_code"] = "Phường/xã không hợp lệ"
			}
		}
	}

	if len(fields) > 0 {
		return domain.NewValidationError(fields)
	}

	return nil
}
