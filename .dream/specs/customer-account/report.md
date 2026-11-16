# Báo cáo Kiểm thử Chức năng — Trung tâm Tài khoản Khách hàng (`customer-account`)

- **Chế độ kiểm thử E2E:** `Mode 2: Shape-Locked Mock E2E` (Playwright chạy trên Vite `:15173`, mọi API thuộc phạm vi tính năng được kiểm tra hình dạng dựa trên tệp snapshot `.dream/specs/customer-account/contract-snapshots.json` xuất từ backend handler tests; endpoint nhị phân `/media/avatars/**` ngoài `/api/v1` phục vụ ảnh PNG mẫu; không có request `/api/v1` nào chưa khai báo).

## Tóm tắt kết quả thực thi
| Suite | Phạm vi | Lệnh thực thi | Kết quả |
|---|---|---|---|
| Backend unit + handler + snapshots | `domain`, `repository`, `usecase/account`, `delivery/http` (`account`, `auth`, `address`), `cmd/server` | `go test -count=1 ./...` & `go vet ./...` (`backend/`) | **PASS** (toàn bộ package `ok`, không sai lệch snapshot) |
| Backend integration DB | PostgreSQL schema `000022`, ràng buộc CHECK, `AccountRepository`, `COALESCE` tên hiển thị (`posts`, `chat`, `live`) | `go test -tags=integration ./internal/repository -run "TestUserProfile\|TestAccountRepository" -count=1` (`backend/`) | **PASS** |
| Frontend lint + component + build | `accountApi`, `AvatarDisplay`, `AuthContext`, `Header`, `AccountPage`, `CheckoutPage`, `AddressFormDialog` | `npm run lint && npm test && npm run build` (`frontend/`) | **PASS** (`59/59` files, `422/422` tests) |
| Browser E2E (Mode 2) | Redirect chưa đăng nhập, giữ `?tab=` qua reload, đồng bộ Header tức thì, upload/xóa avatar, đổi mật khẩu giữ phiên, đồng bộ Sổ địa chỉ sang `/checkout` | `npx playwright test e2e/customer-account.spec.ts` (`frontend/`) | **PASS** (`4/4` tests, `19.4s`) |

## Bảng truy vết kiểm chứng E2E & Trực quan
| Yêu cầu | Tiêu chí kiểm chứng | Trạng thái |
|---|---|---|
| `1.1`, `2.3` | `Header` hiển thị `displayName` + avatar trực tiếp từ `AuthContext` mà không gọi thêm `/api/v1/account/profile` khi tải `/`; cập nhật ngay sau khi lưu hồ sơ | **PASS** |
| `1.2` | Truy cập `/account?tab=addresses` khi chưa đăng nhập chuyển về `/login?redirect=%2Faccount%3Ftab%3Daddresses` và đưa về đúng tab sau đăng nhập | **PASS** |
| `1.4` | Đồng bộ `?tab=profile\|password\|addresses` trên URL và khôi phục đúng tab sau khi reload | **PASS** |
| `3.1`, `3.3` | Tải ảnh đại diện mới hiển thị ngay trên `/account` và `Header`, xóa ảnh khôi phục avatar chữ cái đầu | **PASS** |
| `4.2` | Đổi mật khẩu thành công áp dụng token phiên mới, xóa trắng biểu mẫu và vẫn giữ trạng thái đăng nhập sau khi reload | **PASS** |
| `5.4` | Tạo, sửa, đặt mặc định, xóa địa chỉ tại `/account?tab=addresses` và thấy ngay địa chỉ mặc định mới trên `/checkout` | **PASS** |
| `7.1` | Kiểm tra responsive desktop (`1440x900`) và mobile (`375x812`) trên cả 3 tab với `scrollWidth <= clientWidth` | **PASS** |

## Bằng chứng trực quan (`imgs/`)
- [Hồ sơ cá nhân — Desktop (1440x900)](./imgs/account-profile-desktop.png)
- [Hồ sơ cá nhân — Mobile (375x812)](./imgs/account-profile-mobile.png)
- [Đổi mật khẩu — Desktop (1440x900)](./imgs/account-password-desktop.png)
- [Đổi mật khẩu — Mobile (375x812)](./imgs/account-password-mobile.png)
- [Sổ địa chỉ — Desktop (1440x900)](./imgs/account-addresses-desktop.png)
- [Sổ địa chỉ — Mobile (375x812)](./imgs/account-addresses-mobile.png)
