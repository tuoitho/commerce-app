package flashsale

import (
	"context"
	"fmt"
	"math"
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
	Repo  domain.FlashSaleRepository
	Clock func() time.Time
}

type UseCase struct {
	repo  domain.FlashSaleRepository
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
	Status string
	Page   int
	Limit  int
}

type ListResult struct {
	Items []domain.AdminFlashSaleSummary
	Total int64
}

func (uc *UseCase) GetCurrentPublic(ctx context.Context) (*domain.FlashSaleCampaignPublic, error) {
	campaign, err := uc.repo.GetCurrentPublic(ctx)
	if err != nil || campaign == nil {
		return nil, err
	}
	if campaign.Items == nil {
		campaign.Items = []domain.FlashSalePublicItem{}
	}
	for i := range campaign.Items {
		campaign.Items[i].DiscountPercent = domain.ComputeDiscountPercent(
			campaign.Items[i].RegularPriceVND,
			campaign.Items[i].FlashPriceVND,
		)
	}
	return campaign, nil
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
		status != string(domain.FlashSaleStatusScheduled) &&
		status != string(domain.FlashSaleStatusRunning) &&
		status != string(domain.FlashSaleStatusEnded) &&
		status != string(domain.FlashSaleStatusInactive) {
		return ListResult{}, domain.NewFilterValidationError(map[string]string{
			"status": invalidFilterMessage,
		})
	}

	offset := math.MaxInt
	if in.Page-1 <= math.MaxInt/in.Limit {
		offset = (in.Page - 1) * in.Limit
	}

	items, total, err := uc.repo.ListAdmin(ctx, domain.FlashSaleListFilter{
		Status: status,
		Limit:  in.Limit,
		Offset: offset,
	})
	if err != nil {
		return ListResult{}, err
	}
	if items == nil {
		items = []domain.AdminFlashSaleSummary{}
	}
	now := uc.clock().UTC()
	for i := range items {
		items[i].Status = domain.DeriveFlashSaleStatus(items[i].Active, items[i].StartsAt, items[i].EndsAt, now)
	}
	return ListResult{Items: items, Total: total}, nil
}

func (uc *UseCase) GetAdminByID(ctx context.Context, id string) (*domain.AdminFlashSaleDetail, error) {
	if !isCanonicalUUID(id) {
		return nil, domain.ErrFlashSaleNotFound
	}
	detail, err := uc.repo.GetAdminByID(ctx, id)
	if err != nil {
		return nil, err
	}
	uc.applyStatus(detail)
	return detail, nil
}

func (uc *UseCase) Create(ctx context.Context, adminID string, in domain.SaveFlashSaleInput) (*domain.AdminFlashSaleDetail, error) {
	normalized, resolvedProducts, err := uc.validateAndNormalize(ctx, "", in)
	if err != nil {
		return nil, err
	}
	normalized.CreatedBy = adminID
	detail, err := uc.repo.Create(ctx, normalized, resolvedProducts)
	if err != nil {
		return nil, err
	}
	uc.applyStatus(detail)
	return detail, nil
}

func (uc *UseCase) Update(ctx context.Context, id string, in domain.SaveFlashSaleInput) (*domain.AdminFlashSaleDetail, error) {
	if !isCanonicalUUID(id) {
		return nil, domain.ErrFlashSaleNotFound
	}
	normalized, resolvedProducts, err := uc.validateAndNormalize(ctx, id, in)
	if err != nil {
		return nil, err
	}
	detail, err := uc.repo.Update(ctx, id, normalized, resolvedProducts)
	if err != nil {
		return nil, err
	}
	uc.applyStatus(detail)
	return detail, nil
}

func (uc *UseCase) Delete(ctx context.Context, id string) error {
	if !isCanonicalUUID(id) {
		return domain.ErrFlashSaleNotFound
	}
	return uc.repo.Delete(ctx, id)
}

func (uc *UseCase) applyStatus(detail *domain.AdminFlashSaleDetail) {
	if detail == nil {
		return
	}
	detail.Status = domain.DeriveFlashSaleStatus(detail.Active, detail.StartsAt, detail.EndsAt, uc.clock().UTC())
	if detail.Items == nil {
		detail.Items = []domain.AdminFlashSaleItem{}
	}
}

func (uc *UseCase) validateAndNormalize(
	ctx context.Context,
	flashSaleID string,
	in domain.SaveFlashSaleInput,
) (domain.SaveFlashSaleInput, map[string]string, error) {
	fields := map[string]string{}
	name := strings.TrimSpace(in.Name)
	if n := utf8.RuneCountInString(name); n < 1 || n > domain.FlashSaleNameMaxLength {
		fields["name"] = "Tên chiến dịch phải từ 1 đến 120 ký tự"
	}
	if in.StartsAt.IsZero() {
		fields["startsAt"] = "Thời gian bắt đầu không hợp lệ"
	}
	if in.EndsAt.IsZero() {
		fields["endsAt"] = "Thời gian kết thúc không hợp lệ"
	} else if !in.StartsAt.IsZero() && !in.EndsAt.After(in.StartsAt) {
		fields["endsAt"] = "Thời gian kết thúc phải sau thời gian bắt đầu"
	}

	itemsOut := make([]domain.FlashSaleItemInput, len(in.Items))
	variantIDs := make([]string, 0, len(in.Items))
	for i, item := range in.Items {
		vid := strings.TrimSpace(item.VariantID)
		price := domain.MoneyVND(strings.TrimSpace(string(item.FlashPriceVND)))
		itemsOut[i] = domain.FlashSaleItemInput{
			VariantID:     vid,
			FlashPriceVND: price,
			Quota:         item.Quota,
		}
		if isCanonicalUUID(vid) {
			variantIDs = append(variantIDs, vid)
		}
	}

	if len(itemsOut) < domain.FlashSaleMinItems || len(itemsOut) > domain.FlashSaleMaxItems {
		fields["items"] = "Chiến dịch phải có từ 1 đến 50 biến thể"
	}

	var data *domain.FlashSaleValidationData
	if len(variantIDs) > 0 || flashSaleID != "" {
		var err error
		data, err = uc.repo.ValidationData(ctx, flashSaleID, variantIDs)
		if err != nil {
			return domain.SaveFlashSaleInput{}, nil, err
		}
	} else {
		data = &domain.FlashSaleValidationData{
			Variants: map[string]domain.FlashSaleValidationVariant{},
			Sold:     map[string]int{},
		}
	}

	resolvedProducts := make(map[string]string, len(itemsOut))
	seenVariants := make(map[string]bool, len(itemsOut))
	for i, item := range itemsOut {
		vKey := fmt.Sprintf("items[%d].variantId", i)
		pKey := fmt.Sprintf("items[%d].flashPriceVnd", i)
		qKey := fmt.Sprintf("items[%d].quota", i)

		variant, exists := data.Variants[item.VariantID]
		activeValid := exists && variant.VariantActive && variant.ProductActive
		switch {
		case !isCanonicalUUID(item.VariantID) || !activeValid:
			fields[vKey] = "Biến thể không tồn tại hoặc đã ngừng kinh doanh"
		case seenVariants[item.VariantID]:
			fields[vKey] = "Biến thể bị trùng"
		default:
			resolvedProducts[item.VariantID] = variant.ProductID
		}
		seenVariants[item.VariantID] = true

		switch {
		case !item.FlashPriceVND.IsCanonical() || item.FlashPriceVND == "0":
			fields[pKey] = "Giá Flash Sale phải là số nguyên dương"
		case exists && domain.CompareMoneyVND(item.FlashPriceVND, variant.RegularPriceVND) >= 0:
			fields[pKey] = "Giá Flash Sale phải nhỏ hơn giá bán thường"
		}

		sold := data.Sold[item.VariantID]
		switch {
		case item.Quota < domain.FlashSaleQuotaMin || item.Quota > domain.FlashSaleQuotaMax:
			fields[qKey] = "Số suất phải từ 1 đến 100000"
		case item.Quota < sold:
			fields[qKey] = fmt.Sprintf("Số suất không được nhỏ hơn số đã bán (%d)", sold)
		}
	}

	if flashSaleID != "" && len(itemsOut) >= domain.FlashSaleMinItems && len(itemsOut) <= domain.FlashSaleMaxItems {
		for vid, sold := range data.Sold {
			if sold > 0 && !seenVariants[vid] {
				fields["items"] = "Không thể xóa biến thể đã phát sinh lượt mua khỏi chiến dịch"
				break
			}
		}
	}

	if len(fields) > 0 {
		return domain.SaveFlashSaleInput{}, nil, domain.NewValidationError(fields)
	}

	return domain.SaveFlashSaleInput{
		Name:     name,
		StartsAt: in.StartsAt.UTC(),
		EndsAt:   in.EndsAt.UTC(),
		Active:   in.Active,
		Items:    itemsOut,
	}, resolvedProducts, nil
}

func isCanonicalUUID(id string) bool {
	if len(id) != 36 {
		return false
	}
	_, err := uuid.Parse(id)
	return err == nil
}
