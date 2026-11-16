# Báo cáo Kiểm thử Chức năng — Thông báo Hệ thống Realtime (`system-notifications`)

- **Chế độ kiểm thử E2E:** `Mode 2: Shape-Locked Mock E2E` (Playwright chạy đồng thời trên Storefront Vite `:15173` và Admin Portal Vite `:15174`, mọi API thuộc phạm vi tính năng được kiểm tra hình dạng dựa trên tệp snapshot [contract-snapshots.json](./contract-snapshots.json) xuất từ backend handler tests; sự kiện WebSocket `notification:new` được đẩy qua `page.routeWebSocket` và kiểm tra cấu trúc payload bằng `assertMatchesContractShape`; không có request `/api/v1` nào chưa khai báo).

## Tóm tắt kết quả thực thi
| Suite | Phạm vi | Kết quả |
|---|---|---|
| Backend unit + integration DB + handler | `domain/notification.go`, migration `000023`, `NotificationRepository`, `AutoConfirmDueReturning`, `notification.Service`, `order`/`returns`/`review`/`live` hooks, Wire DI, `GET /api/v1/notifications?category=` | Đạt (`go test -count=1 ./...`, `sqlc diff`, `go vet ./...`, integration test DB pass trước bước Frontend) |
| Frontend lint + component + build (`frontend/`) | `postsApi`, `NotificationBell` (6 tab lọc, badge toàn cục, WS cross-tab dedup, copy `'Cửa hàng'`, deep-link) | Đạt (`oxlint` 0 lỗi, `vitest run` `59/59` file / `424/424` tests, `NotificationBell.test.tsx` `12/12`, `tsc -b && vite build` exit 0) |
| Admin lint + component + build (`frontend-admin/`) | proxy `/media`, `postsApi`, `AdminNotificationBell` (4 tab lọc, badge toàn cục, WS alerts, deep-link) | Đạt (`oxlint` 0 lỗi, `vitest run` `48/48` file / `374/374` tests, `AdminNotificationBell.test.tsx` `12/12`, `tsc -b && vite build` exit 0) |
| Browser E2E (Mode 2) (`frontend/e2e/system-notifications.spec.ts`) | Storefront Desktop (`1440x900`), Storefront Mobile (`375x812`), Admin Portal Desktop (`1440x900`): nhận WS `notification:new` realtime, lọc tab giữ tổng badge, đánh dấu đã đọc, deep-link và kiểm tra tràn ngang | Đạt (`3/3` tests, `20.3s`, `oxlint` 0 warnings/errors trên 3 file spec/component) |

## Bảng truy vết kiểm chứng E2E & Trực quan
| Yêu cầu | Tiêu chí kiểm chứng | Trạng thái |
|---|---|---|
| `1.4`, `7.1`, `7.2`, `7.3` | Admin Portal nhận WS realtime `admin_order_created`, `admin_return_created`, hiển thị tên khách hàng `Nguyễn Minh Anh` + `#AAAA1111`, lọc 4 tab (`Tất cả`, `Đơn hàng`, `Trả hàng`, `Bài viết`) giữ nguyên `unreadCount` toàn cục, điều hướng `/orders/:id`, `/returns/:id`, `/posts/:id` | **PASS** |
| `6.1`, `6.2`, `6.3`, `6.4` | Storefront nhận WS realtime `return_refunded`, `livestream_started`, lọc 6 tab (`Tất cả`, `Đơn hàng`, `Đổi trả`, `Đánh giá`, `Live`, `Bài viết`) giữ nguyên `unreadCount`, hiển thị nhãn `'Cửa hàng'`, điều hướng `/orders/:id`, `/reviews`, `/live/:sessionId`, `/posts/:id` | **PASS** |
| `6.5`, `7.4` | Kiểm tra responsive Storefront Desktop (`1440x900`), Storefront Mobile (`375x812`, dropdown & thanh tab cuộn ngang không tràn `scrollWidth <= clientWidth`), Admin Desktop (`1440x900`) | **PASS** |

## Bằng chứng trực quan (`imgs/`)
- [Storefront NotificationBell — Desktop (1440x900)](./imgs/storefront-notifications-desktop.png)
- [Storefront NotificationBell — Mobile (375x812)](./imgs/storefront-notifications-mobile.png)
- [Admin Portal AdminNotificationBell — Desktop (1440x900)](./imgs/admin-notifications-desktop.png)
