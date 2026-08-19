package area

import (
	"context"

	"commerce-backend/internal/domain"
)

type Dependencies struct {
	Area domain.AreaRepository
}

type UseCase struct {
	area domain.AreaRepository
}

func New(deps Dependencies) *UseCase {
	return &UseCase{
		area: deps.Area,
	}
}

func (uc *UseCase) ListProvinces(ctx context.Context) ([]domain.Province, error) {
	return uc.area.ListProvinces(ctx)
}

func (uc *UseCase) ListWards(ctx context.Context, provinceCode int) ([]domain.Ward, error) {
	return uc.area.ListWards(ctx, provinceCode)
}

func (uc *UseCase) Resolve(ctx context.Context, provinceCode, wardCode int) (domain.Province, domain.Ward, error) {
	return uc.area.Resolve(ctx, provinceCode, wardCode)
}
