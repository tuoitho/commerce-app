# Design Document

## Overview
The `admin-product-variants` feature implements administrative capabilities for defining multi-attribute option groups (e.g. Color, Storage) and managing the product variant matrix (price, inventory, active status per variant combination). It extends backend administrative product APIs (`POST /api/v1/admin/products`, `PUT /api/v1/admin/products/:id`, `GET /api/v1/admin/products/:id`) and enhances the admin frontend form (`ProductFormPage`) with an intuitive Option Group builder and Variant Matrix editor.

Addresses requirements: **Req 1 (1.1-1.4), Req 2 (2.1-2.5), Req 3 (3.1-3.4), Req 4 (4.1-4.3), Req 5 (5.1-5.4)**.

## Architecture

### Affected Boundaries and Data Flow
```
+-------------------------------------------------------------+
|                 frontend-admin (React 19)                   |
|  - ProductFormPage: Simple vs Multi-Variant Mode Toggle     |
|  - OptionGroupBuilder: Dynamic Groups & Values Inputs       |
|  - VariantMatrixTable: Cartesian Product Grid (Price/Stock) |
+-------------------------------------------------------------+
                              |
                              | HTTP JSON /api/v1/admin/products
                              v
+-------------------------------------------------------------+
|                 backend (Go + Gin Delivery)                 |
|  - AdminCatalogHandler: Request DTO parsing & validation    |
|  - CatalogUseCase: Business validation & range calculation  |
|  - CatalogRepository: Atomic Transactional Persistence       |
+-------------------------------------------------------------+
                              |
                              | SQL / pgxpool
                              v
+-------------------------------------------------------------+
|                  PostgreSQL Database Layer                  |
|  - products (id, name, model, brand, category_id, etc.)     |
|  - product_images (product_id, url, position)               |
|  - product_option_groups (id, product_id, label, position)  |
|  - product_option_values (id, product_id, group_id, label)  |
|  - product_variants (id, product_id, price_vnd, stock, ...) |
|  - variant_option_values (variant_id, group_id, value_id)   |
+-------------------------------------------------------------+
```

## Components And Interfaces

### 1. Administrative API Wire Contracts

#### `SaveProductRequest` (Admin Create / Update payload)
When creating new option groups and values, the frontend generates standard client-side UUIDs (`crypto.randomUUID()`) for `id` fields (or preserves existing database UUIDs when editing). The backend accepts and persists these UUIDs directly, ensuring `VariantInput.optionValueIds` deterministically maps `groupId -> optionValueId`.

```typescript
interface OptionValueInput {
  id: string;                             // Client-generated UUID for new values, or existing UUID
  label: string;
  position?: number;
}

interface OptionGroupInput {
  id: string;                             // Client-generated UUID for new groups, or existing UUID
  label: string;
  position?: number;
  values: OptionValueInput[];
}

interface VariantInput {
  id?: string;                            // Client-generated UUID or existing UUID
  optionValueIds: Record<string, string>; // group_id -> option_value_id
  priceVND: string;                       // VND integer string, e.g. "4990000"
  stockQuantity: number;                  // non-negative integer
  active: boolean;
}

interface SaveProductRequest {
  name: string;
  model: string;
  brand: string;
  description: string;
  categoryId: string;
  price: string;                          // Base price (or minPrice when hasVariants)
  currency: string;                       // "VND"
  stockQuantity: number;                  // Total stock (or sum of active variant stock when hasVariants)
  featured: boolean;
  imageUrls: string[];
  hasVariants?: boolean;
  optionGroups?: OptionGroupInput[];
  variants?: VariantInput[];
}
```

#### `ProductDetailResponse` (Admin and Storefront detail payload)
Returns existing domain `ProductDetail` enriched with `optionGroups` and `variants`:
```typescript
interface ProductDetail {
  id: string;
  name: string;
  model: string;
  brand: string;
  description: string;
  category: { id: string; name: string };
  featured: boolean;
  active: boolean;
  minPriceVND: string;
  maxPriceVND: string;
  price: string;
  currency: string;
  stockQuantity: number;
  imageUrls: string[];
  optionGroups: {
    id: string;
    label: string;
    position: number;
    values: { id: string; label: string }[];
  }[];
  variants: {
    id: string;
    optionValueIds: Record<string, string>;
    priceVND: string;
    stockQuantity: number;
    active: boolean;
  }[];
}
```

### 2. Frontend Admin Components (`frontend-admin`)
- **`ProductFormPage.tsx`**: Adds a toggle switch between "Sản phẩm đơn giản" and "Sản phẩm có biến thể".
  - When Simple: Displays base `price` and `stockQuantity` fields.
  - When Multi-Variant: Displays `OptionGroupBuilder` and `VariantMatrixTable`. Base price is auto-populated from min variant price, and total stock is computed as the sum of variant stock.
- **`OptionGroupBuilder.tsx`**: Allows adding up to 3 option groups (e.g. "Dung lượng", "Màu sắc"), with chip-style tag inputs for values (e.g. "128GB", "256GB"). Generates UUIDs for each group and value.
- **`VariantMatrixTable.tsx`**: Computes the Cartesian product of all option values using their UUIDs. Renders a responsive table allowing inline editing of `priceVND`, `stockQuantity`, and an `active` checkbox per combination. Includes a "Áp dụng giá/kho hàng loạt" (Bulk Apply) utility.

## Data Models and Persistence

### Atomic Save / Update Transaction
When `r.SaveProductWithVariants(ctx, id, input)` is invoked:
1. **Product Row**: Upsert or update `products` row (`name`, `model`, `brand`, `description`, `category_id`, `featured`, `active`, `price`, `stock_quantity`).
2. **Product Images**: Replace entries in `product_images`.
3. **If `hasVariants == false` or `len(optionGroups) == 0`**:
   - Delete all associated `variant_option_values`, `product_variants`, `product_option_values`, `product_option_groups` for that product.
   - Maintain `products.price = input.Price` and `products.stock_quantity = input.StockQuantity`.
4. **If `hasVariants == true`**:
   - Persist each `product_option_groups` and `product_option_values` with their provided UUIDs.
   - Reconcile `product_variants`: for existing variants (matching UUID or combination), update `price_vnd`, `stock_quantity`, `active`. For new combinations, insert. For deleted combinations, delete (or cascade).
   - Insert `variant_option_values` links for each variant.
   - Calculate min/max price from active variants and sum total stock from active variants, updating `products.price` and `products.stock_quantity`. (If all variants are inactive, `minPriceVND` and `maxPriceVND` fallback to the minimum price of all defined variants, and total stock is set to 0).

## Error Handling

| Scenario | HTTP Status | Code | Message (Vietnamese) |
|---|---|---|---|
| Empty option group label | `400 Bad Request` | `validation_error` | "Tên nhóm thuộc tính không được để trống" |
| Option group without values | `400 Bad Request` | `validation_error` | "Nhóm thuộc tính phải có ít nhất một giá trị" |
| Negative variant price / stock | `400 Bad Request` | `validation_error` | "Giá biến thể phải là số không âm" / "Số lượng tồn kho không được âm" |
| Incomplete variant matrix links | `400 Bad Request` | `validation_error` | "Mỗi biến thể phải chọn đầy đủ giá trị cho từng nhóm thuộc tính" |
| Non-admin access to admin variant APIs | `403 Forbidden` | `forbidden` | "Bạn không có quyền thực hiện thao tác này" |
| Product not found | `404 Not Found` | `product_not_found` | "Không tìm thấy sản phẩm" |

## Testing Strategy

### 1. Backend (`backend/`)
- **Domain & Validation Tests**: Test validation rules for option groups (empty label, duplicate values, invalid prices/stock in variants).
- **Repository Integration Tests**: Verify atomic persistence of option groups, option values, variants, and variant links in PostgreSQL.
- **HTTP Admin Handler Tests**: Test `POST /api/v1/admin/products` and `PUT /api/v1/admin/products/:id` with variant matrix payloads, verifying Full Status Envelope and error status codes.

### 2. Frontend Admin (`frontend-admin/`)
- **Cartesian Product Helper Tests**: Unit test for generating matrix combinations from N option groups.
- **`OptionGroupBuilder` Component Tests**: Test adding/removing groups and option values with validation feedback.
- **`VariantMatrixTable` Component Tests**: Test table rendering, price/stock inputs, bulk apply actions, and validation errors.
- **`ProductFormPage` Integration Tests**: Test toggling modes, filling variant matrix, and form submission to `createAdminProduct` / `updateAdminProduct`.

## Requirement Traceability

| Requirement ID | Design Element | Verification |
|---|---|---|
| 1.1 - 1.4 | `OptionGroupBuilder.tsx`, `OptionGroupInput`, validation | Frontend unit tests + Backend validation tests |
| 2.1 - 2.5 | `VariantMatrixTable.tsx`, Cartesian product, price/stock sync | Matrix helper tests + Repo integration tests |
| 3.1 - 3.4 | `ProductFormPage.tsx` mode toggle & detail loader | Form page tests & Mock API tests |
| 4.1 - 4.3 | `AdminCatalogHandler`, `CatalogRepository.SaveProductWithVariants` | Handler tests + Integration DB tests |
| 5.1 - 5.4 | Storefront `ProductDetailPage`, Cart flow, `InStock()` | Customer frontend vitest suite |
