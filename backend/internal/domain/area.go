package domain

import "context"

type Province struct {
	Code int
	Name string
}

type Ward struct {
	Code         int
	ProvinceCode int
	Name         string
}

type AreaRepository interface {
	ListProvinces(ctx context.Context) ([]Province, error)
	ListWards(ctx context.Context, provinceCode int) ([]Ward, error)
	Resolve(ctx context.Context, provinceCode, wardCode int) (Province, Ward, error)
}
