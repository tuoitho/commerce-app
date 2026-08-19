-- name: ListAddressesByUser :many
SELECT id, user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default, created_at, updated_at
FROM addresses
WHERE user_id = $1
ORDER BY is_default DESC, created_at DESC, id DESC;

-- name: GetAddressByID :one
SELECT id, user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default, created_at, updated_at
FROM addresses
WHERE id = $1 AND user_id = $2;

-- name: CountAddressesByUser :one
SELECT count(*)
FROM addresses
WHERE user_id = $1;

-- name: InsertAddress :one
INSERT INTO addresses (user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id, user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default, created_at, updated_at;

-- name: UpdateAddress :one
UPDATE addresses
SET recipient_name = $3,
    phone = $4,
    province_code = $5,
    province_name = $6,
    ward_code = $7,
    ward_name = $8,
    detail_address = $9,
    is_default = $10,
    updated_at = now()
WHERE id = $1 AND user_id = $2
RETURNING id, user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default, created_at, updated_at;

-- name: DeleteAddress :exec
DELETE FROM addresses
WHERE id = $1 AND user_id = $2;

-- name: ClearDefaultAddresses :exec
UPDATE addresses
SET is_default = false,
    updated_at = now()
WHERE user_id = $1 AND is_default = true;

-- name: SetAddressDefault :one
UPDATE addresses
SET is_default = true,
    updated_at = now()
WHERE id = $1 AND user_id = $2
RETURNING id, user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default, created_at, updated_at;
