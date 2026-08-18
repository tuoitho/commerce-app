# Design Document

## Overview

Triển khai quản lý danh mục như một phần mở rộng của bounded context catalog, gồm API quản trị bảo vệ bởi middleware hiện có và trang quản trị mới trong `frontend-admin`. Thiết kế đáp ứng Requirements 1–5, giữ nguyên endpoint công khai `GET /api/v1/categories` để khách hàng chỉ thấy các danh mục đang có sản phẩm công khai, đồng thời bổ sung endpoint quản trị trả về toàn bộ danh mục.

Quyết định chính: dùng CRUD giới hạn (không phân trang) vì danh mục là taxonomy nhỏ; xoá vật lý chỉ khi không còn sản phẩm tham chiếu. Cơ sở dữ liệu hiện dùng khóa ngoại `ON DELETE RESTRICT`, vì vậy ràng buộc “không xoá khi đang được dùng” được bảo toàn ngay cả khi có yêu cầu đồng thời.

## Architecture

### Luồng và ranh giới

1. Giao diện `frontend-admin` thêm mục điều hướng và route `/categories`, tải danh sách từ API quản trị qua `apiClient` và React Query.
2. Tạo/đổi tên/xoá từ trang này gọi service API danh mục quản trị. Sau thành công, client làm mới cache danh sách; sau thất bại, cache không bị thay đổi.
3. Router backend đặt các endpoint bên dưới nhóm `/api/v1/admin`, vì thế kế thừa `AuthRequired` và `RequireAdmin`.
4. Handler chuyển DTO HTTP sang input domain, gọi use case catalog, và chỉ dùng `writeSuccess`/`writeError` để duy trì Full Status Envelope.
5. Use case chuẩn hoá tên, kiểm tra quy tắc nghiệp vụ và gọi interface `CatalogRepository`.
6. Repository là chủ sở hữu giao tiếp persistence: các truy vấn sqlc tạo/cập nhật/xoá/tìm danh mục và truy vấn đếm tham chiếu sản phẩm. Migration bổ sung unique index biểu thức trên tên đã trim và lowercase để ràng buộc không trùng được thực thi bền vững.

### Khả năng tương thích và migration

- Không đổi dữ liệu trả về bởi `GET /api/v1/categories` hay các endpoint sản phẩm hiện hữu.
- Thêm endpoint mới, không sửa endpoint quản trị sản phẩm.
- Trước khi tạo unique index, migration phải chuẩn hoá tên hiện có bằng trim; nếu tồn tại các tên xung đột sau chuẩn hoá thì migration phải dừng thay vì tự gộp hoặc xoá dữ liệu.
- Lược đồ dữ liệu không thêm thuộc tính mới cho danh mục. Tên được lưu dưới dạng đã trim để dữ liệu chuẩn hoá nhất quán.

## Components And Interfaces

### Hợp đồng HTTP quản trị

Mọi endpoint yêu cầu bearer token hợp lệ của admin và trả Full Status Envelope khi có body.

| Operation | Method & path | Request | Success | Failures |
|---|---|---|---|---|
| List | `GET /api/v1/admin/categories` | Không có body | `200`, `data: Category[]` theo `name ASC, id ASC` | `401`, `403`, `500` |
| Create | `POST /api/v1/admin/categories` | `{ "name": string }` | `201`, `data: Category` | `400 validation_error` (`fields.name`); `409 category_name_in_use`; `401`, `403`, `500` |
| Rename | `PUT /api/v1/admin/categories/:id` | `{ "name": string }` | `200`, `data: Category` | `400` (UUID/body không hợp lệ); `404 category_not_found`; `409 category_name_in_use`; `401`, `403`, `500` |
| Delete | `DELETE /api/v1/admin/categories/:id` | Không có body | `200`, `data: Category` đã xoá | `400` (UUID không hợp lệ); `404 category_not_found`; `409 category_in_use`; `401`, `403`, `500` |

`Category` có shape `{ "id": string, "name": string }`. Thành công có message tiếng Việt. Lỗi nghiệp vụ có `error.fields` bị lược bỏ và message tiếng Việt; lỗi validation `400` chứa `fields.name` hay `fields.id` tương ứng. Lỗi hệ thống dùng mã `internal` theo chuẩn hệ thống.

### Domain và persistence contract

- Mở rộng `CatalogRepository` với các operation quản trị danh mục: liệt kê toàn bộ, tạo, đổi tên, lấy theo ID, kiểm tra danh mục đang được sản phẩm sử dụng và xoá.
- Input domain cho tạo/đổi tên mang một `Name`; use case là điểm chuẩn hoá bắt buộc và phải trim tên trước validation lẫn persistence. Repository nhận giá trị đã chuẩn hoá từ use case; các repository write không được là đường ghi thay thế để bỏ qua invariant này.
- Repository phân biệt không tìm thấy, trùng tên và danh mục đang dùng thành domain errors xác định để handler ánh xạ thành các status/mã nói trên.
- Xoá phải chạy trong transaction: xác nhận danh mục tồn tại, xác nhận không có product tham chiếu, sau đó xoá. Nếu FK `RESTRICT` phát hiện product được tạo/gán đồng thời, repository phải chuyển xung đột đó thành `category_in_use`.

### Giao diện quản trị

- `CategoriesPage` dùng query key riêng cho danh mục quản trị. Màn hình có danh sách với tên và hành động đổi tên/xoá, form tạo, trạng thái loading/error/rỗng và khu vực thông báo kết quả.
- Form tạo và đổi tên sử dụng cùng quy tắc client-side tối thiểu: trim và không gửi tên rỗng. Phản hồi backend là nguồn quyết định cuối cùng cho lỗi trùng và validation, được bind vào input khi `ApiError.isValidationError()`.
- Hộp thoại xác nhận xoá mô tả tên danh mục và có hành động huỷ/xoá rõ ràng; chỉ mutation sau khi xác nhận.
- Điều khiển tương tác dùng button/input/dialog hiện có, nhãn truy cập được và thông báo trạng thái dưới dạng text để hỗ trợ bàn phím và công nghệ trợ năng.

## Data Models

### Category

| Field | Type | Quy tắc |
|---|---|---|
| `id` | UUID string | Bất biến, do database sinh |
| `name` | text/string | Bắt buộc; giá trị lưu là `trim(name)`; không được rỗng; duy nhất theo `lower(trim(name))` |

Không áp đặt giới hạn chiều dài mới vì yêu cầu đã phê duyệt không quy định và dữ liệu hiện tại là `text`.

### Migration

Migration mới sẽ:

1. trim các tên danh mục hiện hữu;
2. tạo unique index trên `lower(btrim(name))` để so trùng không phân biệt chữ hoa/thường và khoảng trắng đầu/cuối;
3. cung cấp migration down chỉ gỡ index mới, không đảo ngược thao tác trim dữ liệu.

## Error Handling

- Handler không tự tạo JSON response; dùng helper envelope hiện có.
- Input JSON sai, UUID path sai, hoặc tên rỗng sau trim trả `400 validation_error`; field key HTTP là `name` hoặc `id`.
- Tên chuẩn hoá trùng trả `409 category_name_in_use`, message tiếng Việt.
- Danh mục không tồn tại trả `404 category_not_found`, message tiếng Việt.
- Xoá danh mục đang tham chiếu trả `409 category_in_use`, message tiếng Việt.
- Backend ghi lỗi nội bộ thông qua `slog` theo convention hiện có nhưng không ghi secret; client giữ danh sách đang cache, thông báo lỗi tiếng Việt và cho phép mutation lại.

## Testing Strategy

- **Domain/use case:** tên được trim; rỗng bị từ chối; tạo/đổi tên/list; phát hiện trùng không phân biệt hoa/thường; không tồn tại; xoá an toàn; lỗi repository được phân loại chính xác.
- **Repository/integration:** sqlc truy vấn CRUD; sắp xếp; unique index chuẩn hoá; chặn xoá khi có product tham chiếu; phân loại FK race là `category_in_use`.
- **HTTP:** mọi method/path thành công với Full Status Envelope/status đã định; admin/non-admin/anonymous; JSON/UUID/body invalid; tất cả domain errors; message lỗi nghiệp vụ tiếng Việt.
- **Admin frontend:** route và sidebar; loading/error/empty/list; tạo/đổi tên thành công, validation field, business error; dialog xác nhận và xoá; cache danh sách được refresh sau success và không bị sửa sau failure; kiểm tra keyboard/accessibility của control chính.

## Requirement Traceability

| Requirement | Design Elements | Verification |
|---|---|---|
| 1.1–1.3 | API `GET /admin/categories`, route/page, auth guard, list query | HTTP auth/list tests; frontend list/empty tests |
| 2.1–2.4 | Create contract, chuẩn hoá use case, unique index, create form | Use case/repository/HTTP/frontend create tests |
| 3.1–3.4 | Rename contract, domain errors, UI rename flow | Use case/repository/HTTP/frontend rename tests |
| 4.1–4.4 | Delete transaction/FK safety, `category_in_use`, confirmation dialog | Repository/HTTP/frontend confirmation and delete tests |
| 5.1–5.4 | Envelope helpers, React Query invalidation, ApiError UI mapping, accessible controls | HTTP envelope tests; frontend mutation/error/accessibility tests |
