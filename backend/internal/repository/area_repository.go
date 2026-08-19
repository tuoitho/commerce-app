package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"commerce-backend/internal/area"
	"commerce-backend/internal/domain"
)

var _ domain.AreaRepository = (*AreaRepository)(nil)

type rawWard struct {
	Code int    `json:"code"`
	Name string `json:"name"`
}

type rawProvince struct {
	Code  int       `json:"code"`
	Name  string    `json:"name"`
	Wards []rawWard `json:"wards"`
}

type AreaRepository struct {
	provinces       []domain.Province
	wardsByProvince map[int][]domain.Ward
	wardLookup      map[int]map[int]domain.Ward
	provinceLookup  map[int]domain.Province
}

func NewAreaRepository() (*AreaRepository, error) {
	return NewAreaRepositoryFromData(area.AdminDivisionsJSON)
}

func NewAreaRepositoryFromData(data []byte) (*AreaRepository, error) {
	var rawProvinces []rawProvince
	if err := json.Unmarshal(data, &rawProvinces); err != nil {
		return nil, fmt.Errorf("unmarshal admin divisions: %w", err)
	}

	provinces := make([]domain.Province, 0, len(rawProvinces))
	wardsByProvince := make(map[int][]domain.Ward, len(rawProvinces))
	wardLookup := make(map[int]map[int]domain.Ward, len(rawProvinces))
	provinceLookup := make(map[int]domain.Province, len(rawProvinces))

	for _, rp := range rawProvinces {
		p := domain.Province{
			Code: rp.Code,
			Name: rp.Name,
		}
		provinces = append(provinces, p)
		provinceLookup[rp.Code] = p

		wards := make([]domain.Ward, 0, len(rp.Wards))
		wMap := make(map[int]domain.Ward, len(rp.Wards))
		for _, rw := range rp.Wards {
			w := domain.Ward{
				Code:         rw.Code,
				ProvinceCode: rp.Code,
				Name:         rw.Name,
			}
			wards = append(wards, w)
			wMap[rw.Code] = w
		}
		wardsByProvince[rp.Code] = wards
		wardLookup[rp.Code] = wMap
	}

	return &AreaRepository{
		provinces:       provinces,
		wardsByProvince: wardsByProvince,
		wardLookup:      wardLookup,
		provinceLookup:  provinceLookup,
	}, nil
}

func (r *AreaRepository) ListProvinces(_ context.Context) ([]domain.Province, error) {
	result := make([]domain.Province, len(r.provinces))
	copy(result, r.provinces)
	return result, nil
}

func (r *AreaRepository) ListWards(_ context.Context, provinceCode int) ([]domain.Ward, error) {
	if _, ok := r.provinceLookup[provinceCode]; !ok {
		return nil, domain.ErrNotFound
	}
	wards, ok := r.wardsByProvince[provinceCode]
	if !ok {
		return []domain.Ward{}, nil
	}
	result := make([]domain.Ward, len(wards))
	copy(result, wards)
	return result, nil
}

func (r *AreaRepository) Resolve(_ context.Context, provinceCode, wardCode int) (domain.Province, domain.Ward, error) {
	p, ok := r.provinceLookup[provinceCode]
	if !ok {
		return domain.Province{}, domain.Ward{}, domain.ErrNotFound
	}

	wMap, ok := r.wardLookup[provinceCode]
	if !ok {
		return domain.Province{}, domain.Ward{}, domain.ErrNotFound
	}

	w, ok := wMap[wardCode]
	if !ok {
		return domain.Province{}, domain.Ward{}, domain.ErrNotFound
	}

	return p, w, nil
}
