package voucher

import (
	"context"
	"math"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"

	"commerce-backend/internal/domain"
)

const (
	maxLimit             = 100
	invalidFilterMessage = "Giá trị lọc không hợp lệ"
)

type Dependencies struct {
	Repo  domain.VoucherRepository
	Clock func() time.Time
}

type UseCase struct {
	repo  domain.VoucherRepository
	clock func() time.Time
}

func New(deps Dependencies) *UseCase {
	clock := deps.Clock
	if clock == nil {
		clock = func() time.Time { return time.Now().UTC() }
	}
	return &UseCase{
		repo:  deps.Repo,
		clock: clock,
	}
}

type ListInput struct {
	Query  string
	Status string
	Page   int
	Limit  int
}

type ListResult struct {
	Items []domain.Voucher
	Total int64
}

func (uc *UseCase) ListAdmin(ctx context.Context, in ListInput) (ListResult, error) {
	fields := map[string]string{}
	if in.Page < 1 {
		fields["page"] = "must be a positive integer"
	}
	if in.Limit < 1 || in.Limit > maxLimit {
		fields["limit"] = "must be a positive integer between 1 and 100"
	}
	if len(fields) > 0 {
		return ListResult{}, domain.NewValidationError(fields)
	}

	status := strings.TrimSpace(in.Status)
	if status != "" &&
		status != string(domain.VoucherStatusScheduled) &&
		status != string(domain.VoucherStatusActive) &&
		status != string(domain.VoucherStatusExhausted) &&
		status != string(domain.VoucherStatusExpired) &&
		status != string(domain.VoucherStatusInactive) {
		return ListResult{}, domain.NewFilterValidationError(map[string]string{
			"status": invalidFilterMessage,
		})
	}

	offset := math.MaxInt
	if in.Page-1 <= math.MaxInt/in.Limit {
		offset = (in.Page - 1) * in.Limit
	}

	items, total, err := uc.repo.ListAdmin(ctx, domain.VoucherListFilter{
		Query:  strings.TrimSpace(in.Query),
		Status: status,
		Limit:  in.Limit,
		Offset: offset,
	})
	if err != nil {
		return ListResult{}, err
	}
	if items == nil {
		items = []domain.Voucher{}
	}
	now := uc.clock().UTC()
	for i := range items {
		items[i].EffectiveStatus = domain.DeriveVoucherEffectiveStatus(
			items[i].Active,
			items[i].StartsAt,
			items[i].EndsAt,
			now,
			items[i].UsageLimit,
			items[i].UsedCount,
		)
	}
	return ListResult{Items: items, Total: total}, nil
}

func (uc *UseCase) GetAdminByID(ctx context.Context, id string) (*domain.Voucher, error) {
	if !isCanonicalUUID(id) {
		return nil, domain.ErrVoucherNotFound
	}
	v, err := uc.repo.GetAdminByID(ctx, id)
	if err != nil {
		return nil, err
	}
	uc.applyEffectiveStatus(v)
	return v, nil
}

func (uc *UseCase) Create(ctx context.Context, in domain.SaveVoucherInput) (*domain.Voucher, error) {
	normalized, err := validateAndNormalize(in)
	if err != nil {
		return nil, err
	}
	v, err := uc.repo.Create(ctx, normalized)
	if err != nil {
		return nil, err
	}
	uc.applyEffectiveStatus(v)
	return v, nil
}

func (uc *UseCase) Update(ctx context.Context, id string, in domain.SaveVoucherInput) (*domain.Voucher, error) {
	if !isCanonicalUUID(id) {
		return nil, domain.ErrVoucherNotFound
	}
	normalized, err := validateAndNormalize(in)
	if err != nil {
		return nil, err
	}
	v, err := uc.repo.Update(ctx, id, normalized)
	if err != nil {
		return nil, err
	}
	uc.applyEffectiveStatus(v)
	return v, nil
}

func (uc *UseCase) Delete(ctx context.Context, id string) error {
	if !isCanonicalUUID(id) {
		return domain.ErrVoucherNotFound
	}
	return uc.repo.Delete(ctx, id)
}

func (uc *UseCase) ListAvailable(ctx context.Context, userID string) ([]domain.AvailableVoucher, error) {
	if !isCanonicalUUID(userID) {
		return nil, domain.ErrInvalidToken
	}
	items, err := uc.repo.ListAvailableForUser(ctx, userID, uc.clock().UTC())
	if err != nil {
		return nil, err
	}
	if items == nil {
		items = []domain.AvailableVoucher{}
	}
	return items, nil
}

func (uc *UseCase) applyEffectiveStatus(v *domain.Voucher) {
	if v == nil {
		return
	}
	v.EffectiveStatus = domain.DeriveVoucherEffectiveStatus(
		v.Active,
		v.StartsAt,
		v.EndsAt,
		uc.clock().UTC(),
		v.UsageLimit,
		v.UsedCount,
	)
}

func validateAndNormalize(in domain.SaveVoucherInput) (domain.SaveVoucherInput, error) {
	fields := map[string]string{}

	code := domain.NormalizeVoucherCode(in.Code)
	if !domain.IsValidVoucherCode(code) {
		fields["code"] = "Mã giảm giá phải gồm 3–32 ký tự chữ hoa, số, dấu gạch dưới hoặc gạch ngang"
	}

	title := strings.TrimSpace(in.Title)
	if n := utf8.RuneCountInString(title); n < 1 || n > 120 {
		fields["title"] = "Tiêu đề phải từ 1 đến 120 ký tự"
	}

	description := strings.TrimSpace(in.Description)
	if utf8.RuneCountInString(description) > 500 {
		fields["description"] = "Mô tả không được vượt quá 500 ký tự"
	}

	voucherType := domain.VoucherType(strings.TrimSpace(string(in.VoucherType)))
	if !voucherType.IsValid() {
		fields["voucherType"] = "Loại giảm giá phải là percent, fixed_amount hoặc freeship"
	}

	discountVal := domain.MoneyVND(strings.TrimSpace(string(in.DiscountValue)))
	switch voucherType {
	case domain.VoucherTypePercent:
		if !discountVal.IsCanonical() {
			fields["discountValue"] = "Phần trăm giảm phải là số nguyên từ 1 đến 100"
		} else if pct, err := strconv.Atoi(string(discountVal)); err != nil || pct < 1 || pct > 100 {
			fields["discountValue"] = "Phần trăm giảm phải là số nguyên từ 1 đến 100"
		}
	case domain.VoucherTypeFixedAmount:
		if !discountVal.IsCanonical() || discountVal == "0" {
			fields["discountValue"] = "Số tiền giảm phải là số nguyên dương"
		}
	case domain.VoucherTypeFreeship:
		if discountVal != "0" {
			fields["discountValue"] = "Mã miễn phí vận chuyển phải có giá trị giảm bằng 0"
		}
	default:
		if !discountVal.IsCanonical() || discountVal == "0" {
			fields["discountValue"] = "Giá trị giảm không hợp lệ"
		}
	}

	var maxDiscount *domain.MoneyVND
	if voucherType == domain.VoucherTypeFixedAmount {
		if in.MaxDiscountVND != nil {
			fields["maxDiscountVnd"] = "Mã giảm tiền mặt không được đặt mức giảm tối đa"
		}
	} else if in.MaxDiscountVND != nil {
		trimmed := domain.MoneyVND(strings.TrimSpace(string(*in.MaxDiscountVND)))
		if !trimmed.IsCanonical() || trimmed == "0" {
			fields["maxDiscountVnd"] = "Mức giảm tối đa phải là số nguyên dương"
		} else {
			maxDiscount = &trimmed
		}
	}

	minOrder := domain.MoneyVND(strings.TrimSpace(string(in.MinOrderVND)))
	if !minOrder.IsCanonical() {
		fields["minOrderVnd"] = "Giá trị đơn tối thiểu không hợp lệ"
	}

	var usageLimit *int
	if in.UsageLimit != nil {
		if *in.UsageLimit < 1 {
			fields["usageLimit"] = "Giới hạn tổng lượt dùng phải từ 1 trở lên"
		} else {
			v := *in.UsageLimit
			usageLimit = &v
		}
	}

	if in.PerUserLimit < 1 {
		fields["perUserLimit"] = "Giới hạn lượt dùng mỗi khách phải từ 1 trở lên"
	}

	if in.StartsAt.IsZero() {
		fields["startsAt"] = "Thời gian bắt đầu không hợp lệ"
	}
	if in.EndsAt.IsZero() {
		fields["endsAt"] = "Thời gian kết thúc không hợp lệ"
	} else if !in.StartsAt.IsZero() && !in.EndsAt.After(in.StartsAt) {
		fields["endsAt"] = "Thời gian kết thúc phải sau thời gian bắt đầu"
	}

	if len(fields) > 0 {
		return domain.SaveVoucherInput{}, domain.NewValidationError(fields)
	}

	return domain.SaveVoucherInput{
		Code:           code,
		Title:          title,
		Description:    description,
		VoucherType:    voucherType,
		DiscountValue:  discountVal,
		MaxDiscountVND: maxDiscount,
		MinOrderVND:    minOrder,
		UsageLimit:     usageLimit,
		PerUserLimit:   in.PerUserLimit,
		StartsAt:       in.StartsAt.UTC(),
		EndsAt:         in.EndsAt.UTC(),
		Active:         in.Active,
	}, nil
}

func isCanonicalUUID(id string) bool {
	if len(id) != 36 {
		return false
	}
	_, err := uuid.Parse(id)
	return err == nil
}
