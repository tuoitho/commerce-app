# Implementation Plan

- [x] 1. Backend: quản trị danh mục với persistence an toàn

- [x] 1.1 Cung cấp quản lý danh mục admin đầu-cuối và ràng buộc cơ sở dữ liệu
  - **Produces:** Các endpoint `GET/POST/PUT/DELETE /api/v1/admin/categories` đúng hợp đồng đã duyệt, được giới hạn cho admin; migration và persistence đảm bảo tên duy nhất theo `lower(trim(name))`, lưu tên đã trim, và xoá danh mục an toàn.
  - **Scope:** `backend` domain/catalog use case, `CatalogRepository`, migration up/down mới, `backend/db/queries/catalog.sql`, tái sinh `backend/internal/repository/sqlc/`, admin handler/router, mapping errors, fake repository, repository integration tests, và focused unit/HTTP tests. Cập nhật seed chỉ khi migration làm seed không hợp lệ.
  - **Consumes:** Hợp đồng HTTP, domain errors, ordering, authorization, persistence invariants và migration safety được cố định tại `design.md`.
  - **Acceptance:** Migration trim dữ liệu trước khi tạo unique expression index và dừng khi có xung đột; rollback chỉ bỏ index. Admin có thể list/tạo/đổi tên/xoá danh mục không dùng; list có thứ tự `name ASC, id ASC`; create trả 201; rename/delete trả 200; anonymous/non-admin bị từ chối. Validation/không tồn tại/trùng tên/danh mục đang dùng trả đúng mã trạng thái, mã lỗi và envelope đã duyệt; database vẫn chặn duplicate đã chuẩn hoá và xoá có tham chiếu trong trường hợp đồng thời.
  - **Verification:** Test-driven focused tests cho use case và HTTP bao phủ Requirements 1.1–1.3, 2.1–2.4, 3.1–3.4, 4.1–4.3, 5.1–5.3; chạy migration và repository integration tests với PostgreSQL theo cấu hình test cục bộ; chạy `make gen`, kiểm tra generated diff, rồi chạy `make test` và `make vet` từ `backend/`.
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3_

- [x] 2. Frontend admin: quản lý danh mục

- [x] 2.1 Triển khai trang quản lý danh mục trong cổng admin
  - **Produces:** Route `/categories`, mục sidebar, API service/types quản trị danh mục, và `CategoriesPage` cho phép list, tạo, đổi tên, xác nhận xoá, cùng các trạng thái loading/rỗng/lỗi/thành công có thể truy cập được.
  - **Scope:** `frontend-admin/src/api/`, `App.tsx`, `AdminLayout.tsx`, trang/components danh mục, UI shadcn hiện có, React Query mutations/cache invalidation, và focused Vitest/Testing Library tests.
  - **Consumes:** Hợp đồng API quản trị đã cố định tại `design.md` và implementation endpoint từ Task 1.1; `ApiError` và quy ước UI admin hiện có.
  - **Acceptance:** Danh sách được tải từ endpoint admin; form trim/chặn rỗng phía client và bind field errors từ API; mutation thành công hiển thị tiếng Việt và refresh danh sách; failure giữ danh sách nhất quán và cho retry. Requirement 4.4 được sở hữu tại task này: delete chỉ gửi sau dialog xác nhận; controls dùng được bằng bàn phím, có label và báo lỗi bằng text.
  - **Verification:** Focused frontend tests bao phủ route/navigation, loading/empty/error/list, create/rename success & failure, validation field, confirmation/delete, cache behavior, và accessibility của controls; chạy `npm test`, `npm run lint`, `npm run build` từ `frontend-admin/`.
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.4_
