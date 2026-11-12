# CCR-001: Layout quản trị responsive để đạt Req 10.1 trên màn hình hẹp

Status: APPLIED
Trigger: review finding (Task 2.2 review r0, ⚠️ 1) + user decision

## Change

Req 10.1 yêu cầu trang tổng quan không cuộn ngang và không cắt số liệu trên màn hình rộng từ 320 CSS pixel trở lên. Layout dùng chung `frontend-admin/src/components/layout/AdminLayout.tsx` hiện có:
- sidebar cố định `w-64` (256px, `:63`);
- `main` với `p-8` (`:268`);
- header `px-8` chứa tiêu đề dài và badge (`:243-252`).

Vì vậy ở viewport 320–375px, vùng nội dung chỉ còn khoảng 0–55px. Không trang nào đạt được 10.1, dù trang tự responsive đến đâu.

Người dùng chọn làm `AdminLayout` responsive:
- **Dưới 1024px:**
  - sidebar ẩn, header có nút menu để mở ngăn điều hướng (drawer) chứa đủ các mục hiện có;
  - padding của `main` và header thu nhỏ;
  - nội dung header không tràn ngang.
- **Từ 1024px trở lên:** giữ nguyên giao diện hiện tại.

Thay đổi này áp dụng cho mọi trang admin vì `AdminLayout` là layout chung.

## Contracts

| Contract | Revision | Compatibility | Change |
|---|---|---|---|
| none | — | — | Không đổi contract API/DB nào. Chỉ thay đổi hành vi giao diện của layout dùng chung. |

## Artifact Updates

- **requirements.md:** thêm tiêu chí 10.4. 10.1 giữ nguyên.
- **design.md:**
  - thêm mục "Layout quản trị responsive (10.1, 10.4)" trong Frontend-admin;
  - thêm dòng 10.4 vào bảng truy vết;
  - bổ sung `AdminLayout` vào "Tích hợp hệ thống hiện có";
  - bổ sung test layout vào Testing Strategy và mục visual E2E.
- **tasks.md:**
  - thêm leaf task mới 2.4 (Layout quản trị responsive);
  - task 3.1 (chưa xong) bổ sung 10.4 vào `_Requirements_` và thêm ảnh chụp drawer mở ở `375x812`.

## Impact

| Task | Role | Reference | Action |
|---|---|---|---|
| 1.1 | — | không tham chiếu | giữ nguyên (complete) |
| 1.2 | — | không tham chiếu | giữ nguyên (complete) |
| 2.1 | — | không tham chiếu | giữ nguyên (complete) |
| 2.2 | — | 10.1 (nội dung trang) | giữ nguyên. Phần layout chung chuyển sang 2.4, 2.2 chỉ chịu trách nhiệm nội dung trang co giãn theo vùng nội dung |
| 2.3 | — | không đổi | giữ nguyên |
| 2.4 (new) | — | Req 10.1, 10.4 | new task: `AdminLayout` responsive |
| 3.1 | verifier | Req 10.1, 10.2 | bổ sung 10.4 vào `_Requirements_` (task chưa xong) |

Direct consumers: `AdminLayout` được dùng duy nhất ở `frontend-admin/src/App.tsx:37`, làm layout cho mọi route admin. Hai test hiện có `CategoriesPage.test.tsx` và `OrdersPage.test.tsx` có render `AdminLayout`. Task 2.4 phải giữ hai test này pass.

## Evidence Refresh

| Evidence | Item | Owner Task | Action |
|---|---|---|---|
| snapshot | none: CCR không đổi contract API | — | — |
| screenshot | `imgs/` chưa có ảnh nào cho feature này | 3.1 | add: ảnh `1440x900`, `375x812` và ảnh drawer mở ở `375x812` |
| report | `report.md` chưa tồn tại | 3.1 | add: các mục cho 10.1, 10.2, 10.4 |

## Migration And Release Notes

None. Chỉ là thay đổi frontend-admin, không có migration.
