# Requirements Document

## Introduction

Nâng cấp hệ thống voucher để bổ sung hai năng lực cốt lõi:
1. **Ví voucher cá nhân & luồng lưu (claim) voucher:** Khách hàng khám phá các voucher công khai đang phát hành, lưu (claim) vào ví voucher cá nhân, quản lý trạng thái voucher trong ví, và sử dụng voucher đã lưu trong ví khi báo giá checkout (`quote`) cũng như khi tạo đơn hàng (`create order`).
2. **Phạm vi áp dụng voucher theo sản phẩm hoặc danh mục:** Quản trị viên cấu hình voucher áp dụng cho toàn bộ cửa hàng (`all`), chỉ một số danh mục nhất định (`categories`), hoặc chỉ một số sản phẩm nhất định (`products`). Cả cơ chế báo giá checkout và tạo đơn hàng đều kiểm tra phạm vi hợp lệ và tính mức giảm nhất quán trên phần sản phẩm thuộc phạm vi.

## Requirements

### Requirement 1: Cấu hình phạm vi áp dụng voucher (Admin)
**User Story:** Là quản trị viên, tôi muốn cấu hình phạm vi áp dụng của voucher (toàn sàn, theo danh mục, hoặc theo sản phẩm) khi tạo/sửa voucher, để chạy khuyến mãi đúng nhóm hàng mục tiêu.

#### Acceptance Criteria
1.1. WHEN quản trị viên tạo hoặc cập nhật voucher THEN hệ thống SHALL hỗ trợ trường `scopeType` nhận một trong ba giá trị tách biệt: `all` (mặc định khi bỏ trống), `categories`, hoặc `products`.
1.2. IF `scopeType` là `categories` THEN hệ thống SHALL yêu cầu `categoryIds` chứa ít nhất 1 ID hợp lệ, không trùng lặp, mọi danh mục phải tồn tại trong hệ thống, và `productIds` phải rỗng; nếu vi phạm thì hệ thống SHALL trả về lỗi validation `400` (`validation_error`).
1.3. IF `scopeType` là `products` THEN hệ thống SHALL yêu cầu `productIds` chứa ít nhất 1 ID hợp lệ, không trùng lặp, mọi sản phẩm phải tồn tại trong hệ thống, và `categoryIds` phải rỗng; nếu vi phạm thì hệ thống SHALL trả về lỗi validation `400` (`validation_error`).
1.4. IF `scopeType` là `all` THEN hệ thống SHALL yêu cầu cả `categoryIds` và `productIds` rỗng (hoặc không gửi) và lưu voucher không gắn giới hạn danh mục/sản phẩm.
1.5. WHEN quản trị viên mở biểu mẫu tạo/sửa voucher trên giao diện quản trị THEN hệ thống SHALL tải danh sách danh mục và sản phẩm từ API catalog quản trị hiện có để chọn mục tiêu áp dụng theo tên (không yêu cầu nhập tay UUID).
1.6. WHEN quản trị viên xem danh sách hoặc chi tiết voucher THEN hệ thống SHALL trả về đầy đủ `scopeType`, danh sách `scopeCategories` (`id`, `name`) và `scopeProducts` (`id`, `name`).
1.7. IF voucher đã tồn tại trước khi nâng cấp không có cấu hình phạm vi THEN hệ thống SHALL giữ nguyên hành vi tương thích ngược với `scopeType = all`.

### Requirement 2: Khám phá và lưu (Claim) voucher vào ví cá nhân
**User Story:** Là khách hàng đã đăng nhập, tôi muốn xem các voucher đang phát hành và lưu (claim) vào ví cá nhân, để sưu tầm và sử dụng khi thanh toán.

#### Acceptance Criteria
2.1. WHEN khách hàng đã đăng nhập truy cập trang khám phá voucher (Voucher Hub) THEN hệ thống SHALL hiển thị các voucher đang hoạt động (`active = true`), trong thời gian hiệu lực (`startsAt <= now <= endsAt`), còn lượt tổng (`usageLimit IS NULL OR usedCount < usageLimit`), kèm thông tin phạm vi áp dụng (`scopeType`, `scopeCategories`, `scopeProducts`), số lượt còn lại của cá nhân (`userRemainingUses`), và trạng thái đã lưu vào ví (`claimed`, `claimedAt`).
2.2. WHEN khách hàng gửi yêu cầu lưu (claim) một voucher hợp lệ chưa có trong ví THEN hệ thống SHALL tạo bản ghi sở hữu trong ví cá nhân của khách hàng và trả về thông tin voucher trong ví cùng mã trạng thái `200`/`201`.
2.3. IF khách hàng gửi yêu cầu claim trùng một voucher đã có trong ví (kể cả khi gửi nhiều yêu cầu đồng thời) THEN hệ thống SHALL bảo toàn bất biến tối đa một bản ghi ví cho mỗi cặp `(userId, voucherId)` và trả về thành công idempotent (hoặc không tạo bản ghi trùng lặp).
2.4. IF voucher không tồn tại THEN hệ thống SHALL từ chối yêu cầu claim với `404` (`voucher_not_found`); IF voucher đã tắt (`active = false`), chưa đến thời gian bắt đầu, đã hết hạn, hoặc đã hết lượt tổng THEN hệ thống SHALL từ chối yêu cầu claim với `409` và mã lỗi nghiệp vụ tương ứng (`voucher_inactive`, `voucher_not_started`, `voucher_expired`, `voucher_exhausted`) bằng tiếng Việt.
2.5. WHEN khách hàng claim voucher THEN hệ thống SHALL không tăng `used_count` toàn cục của voucher; `used_count` chỉ tăng khi đơn hàng áp dụng voucher được tạo thành công.
2.6. IF người dùng chưa đăng nhập gọi API khám phá voucher, xem ví voucher, hoặc claim voucher THEN hệ thống SHALL trả về `401 Unauthorized`.

### Requirement 3: Quản lý ví voucher cá nhân (Customer Wallet)
**User Story:** Là khách hàng, tôi muốn xem ví voucher đã lưu theo trạng thái, để biết mã nào còn dùng được và áp dụng cho mặt hàng nào.

#### Acceptance Criteria
3.1. WHEN khách hàng mở Ví Voucher THEN hệ thống SHALL trả về toàn bộ voucher khách hàng đã lưu kèm `claimedAt`, `userRemainingUses`, điều kiện đơn tối thiểu, thời hạn, phạm vi áp dụng (`scopeType`, `scopeCategories`, `scopeProducts`), và trạng thái ví (`walletStatus`: `available`, `used_up`, `expired`, `exhausted`, `inactive`, `scheduled`).
3.2. WHEN khách hàng lọc ví theo nhóm trạng thái (Khả dụng / Đã dùng hết lượt / Hết hạn & không khả dụng) trên giao diện THEN hệ thống SHALL phân loại nhất quán theo `walletStatus`.
3.3. WHEN khách hàng điều hướng trên storefront THEN hệ thống SHALL cung cấp lối vào rõ ràng tới trang Voucher (Khám phá & Ví của tôi) từ thanh điều hướng / tài khoản và từ trang Checkout.

### Requirement 4: Kiểm tra ví (Claim) và phạm vi áp dụng tại Checkout Quote & Tạo đơn
**User Story:** Là khách hàng, tôi muốn màn hình thanh toán chỉ áp dụng voucher tôi đã lưu vào ví, cho biết rõ voucher nào phù hợp với sản phẩm đang chọn trong giỏ, và hiển thị số tiền giảm ở preview giống hệt lúc đặt đơn.

#### Acceptance Criteria
4.1. WHEN khách hàng mở màn hình Checkout THEN hệ thống SHALL tải danh sách voucher khả dụng từ ví cá nhân của khách hàng và đánh dấu rõ voucher nào áp dụng được hay không áp dụng được cho các sản phẩm đang chọn (`selected`) trong giỏ hàng (kèm lý do: chưa đạt đơn tối thiểu hoặc không có sản phẩm thuộc phạm vi áp dụng).
4.2. WHEN khách hàng gọi `POST /api/v1/checkout/quote` hoặc `POST /api/v1/orders` kèm `voucherCode` THEN hệ thống SHALL xác minh voucher đã tồn tại trong ví của khách hàng; nếu chưa lưu thì hệ thống SHALL từ chối với `409` và mã lỗi `voucher_not_claimed` kèm thông báo tiếng Việt.
4.3. IF voucher có `scopeType = categories` THEN tập sản phẩm hợp lệ (`eligible items`) là các sản phẩm trong đơn có `category_id` thuộc danh sách danh mục của voucher.
4.4. IF voucher có `scopeType = products` THEN tập sản phẩm hợp lệ (`eligible items`) là các sản phẩm trong đơn có `product_id` thuộc danh sách sản phẩm của voucher.
4.5. IF voucher có `scopeType = all` THEN toàn bộ sản phẩm hợp lệ trong đơn đều thuộc phạm vi áp dụng (`eligibleSubtotalVnd = subtotalVnd`).
4.6. IF voucher có `scopeType` là `categories` hoặc `products` nhưng không có sản phẩm nào trong đơn thuộc phạm vi áp dụng THEN cả `POST /api/v1/checkout/quote` và `POST /api/v1/orders` SHALL từ chối với `409` và mã lỗi `voucher_scope_mismatch` kèm thông báo tiếng Việt.
4.7. WHEN kiểm tra điều kiện đơn tối thiểu (`minOrderVnd`) và tính số tiền giảm (`discountVnd`) THEN cả `POST /api/v1/checkout/quote` và `POST /api/v1/orders` SHALL áp dụng cùng một công thức:
    - `eligibleSubtotalVnd` là tổng `lineTotalVnd` của các sản phẩm thuộc phạm vi áp dụng (sử dụng đơn giá hiệu lực đã bao gồm giá Live / Flash Sale).
    - Điều kiện `eligibleSubtotalVnd >= minOrderVnd` phải thỏa mãn (nếu không, trả về `409` `voucher_min_order_not_met`).
    - Với `percent`: `discountVnd = min(trunc(eligibleSubtotalVnd * discountValue / 100), maxDiscountVnd, eligibleSubtotalVnd)`.
    - Với `fixed_amount`: `discountVnd = min(discountValue, eligibleSubtotalVnd)`.
    - Với `freeship`: `discountVnd = min(shippingFeeVnd, maxDiscountVnd)` (áp dụng khi có ít nhất 1 sản phẩm hợp lệ và `eligibleSubtotalVnd >= minOrderVnd`).
    - `POST /api/v1/checkout/quote` SHALL trả thêm trường `eligibleSubtotalVnd` và đảm bảo `subtotalVnd`, `shippingFeeVnd`, `discountVnd`, `totalVnd` khớp hoàn toàn với kết quả tạo đơn trên cùng tập sản phẩm.
4.8. WHEN khách hàng tạo đơn hàng áp dụng voucher THEN hệ thống SHALL thực hiện khóa hàng (`FOR UPDATE`) trên dòng `vouchers` trong transaction, kiểm tra lại quyền sở hữu trong ví, phạm vi, `usage_limit`, và `per_user_limit`, đảm bảo không vượt quá hạn mức khi có nhiều yêu cầu đặt đơn đồng thời.
4.9. WHEN đơn hàng áp dụng voucher bị hủy THEN hệ thống SHALL hoàn trả lượt sử dụng (`used_count` giảm 1 và `voucher_usages.status = 'restored'`) và giữ nguyên bản ghi sở hữu trong ví (`user_vouchers`) để khách hàng có thể dùng lại nếu voucher còn hiệu lực.
4.10. WHEN hệ thống tính tiền hoàn trả dự kiến cho yêu cầu trả hàng (`return_requests`) của đơn hàng có áp dụng voucher THEN hệ thống SHALL giữ nguyên tương thích với cơ chế tính toán theo `discountVnd` đã lưu trên đơn hàng.
