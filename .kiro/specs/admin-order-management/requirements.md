# Requirements Document

## Introduction

Feature "Quản lý đơn hàng phía admin" (`admin-order-management`): cho phép quản trị viên xem toàn bộ đơn hàng của mọi khách hàng, xem chi tiết đơn, và thực hiện các chuyển tiếp trạng thái mà feature `order-placement` (đã duyệt) để dành cho phía bán hàng: xác nhận chuẩn bị hàng, bàn giao đơn vị vận chuyển, đánh dấu đã giao, duyệt yêu cầu hủy (hoàn tồn kho), từ chối yêu cầu hủy.

Người dùng: quản trị viên (frontend-admin). Feature này không thay đổi enum trạng thái đơn, không thay đổi luồng phía khách hàng (đặt hàng/hủy/yêu cầu hủy đã định nghĩa ở `order-placement`); chỉ bổ sung khả năng admin làm các chuyển tiếp còn thiếu để đơn hàng hoàn tất vòng đời.

## Requirements

### Requirement 1 — Phân quyền truy cập

**User Story:** As a quản trị viên, tôi muốn mọi thao tác quản lý đơn hàng chỉ dành cho admin, so that khách hàng không thể truy cập.

#### Acceptance Criteria

1.1. KHI người dùng chưa đăng nhập gọi một endpoint quản lý đơn hàng, THÌ hệ thống TRẢ lỗi 401.

1.2. KHI người dùng có vai trò "customer" gọi một endpoint quản lý đơn hàng, THÌ hệ thống TRẢ lỗi 403 với thông báo tiếng Việt.

1.3. KHI người dùng có vai trò "admin" gọi một endpoint quản lý đơn hàng, THÌ hệ thống CHO PHÉP thao tác.

### Requirement 2 — Danh sách đơn hàng (admin)

**User Story:** As a quản trị viên, tôi muốn xem danh sách tất cả đơn hàng của mọi khách hàng và lọc theo trạng thái, so that tôi nắm được tình trạng đơn hàng.

#### Acceptance Criteria

2.1. KHI admin mở danh sách đơn hàng, THÌ hệ thống HIỂN THỊ tất cả đơn hàng của mọi khách hàng theo thứ tự mới nhất trước.

2.2. VỚI mỗi đơn hàng trong danh sách, THÌ hệ thống HIỂN THỊ: mã đơn, trạng thái, email tài khoản người mua, tên người nhận, số điện thoại, địa chỉ giao hàng (tỉnh/phường-xã/địa chỉ chi tiết), tổng thanh toán, tổng số dòng sản phẩm, thời gian tạo.

2.3. KHI admin lọc theo một trạng thái cụ thể, THÌ hệ thống CHỈ HIỂN THỊ các đơn thuộc đúng trạng thái đó.

2.4. KHI admin chọn bộ lọc "Tất cả", THÌ hệ thống HIỂN THỊ đơn hàng ở mọi trạng thái.

2.5. KHI không có đơn hàng nào thỏa bộ lọc, THÌ hệ thống HIỂN THỊ trạng thái rỗng.

2.6. KHI admin nhấn chọn một đơn hàng trong danh sách, THÌ hệ thống CHUYỂN đến trang chi tiết đơn hàng đó.

2.7. KHI danh sách có nhiều đơn hơn kích thước một trang, THÌ hệ thống PHÂN TRANG với kích thước cố định và CHO PHÉP admin chuyển trang.

2.8. KHI admin chuyển trang hoặc đổi bộ lọc trạng thái, THÌ hệ thống TẢI LẠI danh sách theo điều kiện mới.

### Requirement 3 — Chi tiết đơn hàng (admin)

**User Story:** As a quản trị viên, tôi muốn xem đầy đủ thông tin một đơn hàng, so that tôi có đủ dữ liệu để xử lý.

#### Acceptance Criteria

3.1. KHI admin mở chi tiết một đơn hàng tồn tại, THÌ hệ thống HIỂN THỊ: trạng thái, phương thức thanh toán, email tài khoản người mua, thông tin giao hàng (tên người nhận, số điện thoại, tỉnh, phường/xã, địa chỉ chi tiết), các dòng sản phẩm (tên sản phẩm, hình ảnh, tùy chọn, giá đơn vị, số lượng, thành tiền), tạm tính, phí vận chuyển, tổng thanh toán, thời gian tạo, thời gian cập nhật và (nếu có) thời gian xác nhận, thời gian hủy.

3.2. KHI admin mở chi tiết một đơn hàng không tồn tại, THÌ hệ thống TRẢ lỗi 404 với thông báo tiếng Việt.

### Requirement 4 — Xác nhận chuẩn bị hàng

**User Story:** As a quản trị viên, tôi muốn đánh dấu đơn "đã xác nhận" sang "đang chuẩn bị hàng", so that đơn được đưa vào xử lý trong kho.

#### Acceptance Criteria

4.1. KHI admin thực hiện hành động "xác nhận chuẩn bị hàng" trên đơn ở trạng thái "đã xác nhận", THÌ hệ thống CHUYỂN đơn sang trạng thái "đang chuẩn bị hàng" và TRẢ đơn đã cập nhật.

4.2. KHI admin thực hiện hành động "xác nhận chuẩn bị hàng" trên đơn KHÔNG ở trạng thái "đã xác nhận", THÌ hệ thống KHÔNG chuyển trạng thái và TRẢ lỗi kinh doanh với thông báo tiếng Việt.

### Requirement 5 — Bàn giao đơn vị vận chuyển

**User Story:** As a quản trị viên, tôi muốn đánh dấu đơn "đang chuẩn bị hàng" sang "đã giao cho đơn vị vận chuyển", so that đơn được giao đến khách.

#### Acceptance Criteria

5.1. KHI admin thực hiện hành động "bàn giao vận chuyển" trên đơn ở trạng thái "đang chuẩn bị hàng", THÌ hệ thống CHUYỂN đơn sang trạng thái "đã giao cho đơn vị vận chuyển" và TRẢ đơn đã cập nhật.

5.2. KHI admin thực hiện hành động "bàn giao vận chuyển" trên đơn KHÔNG ở trạng thái "đang chuẩn bị hàng", THÌ hệ thống KHÔNG chuyển trạng thái và TRẢ lỗi kinh doanh với thông báo tiếng Việt.

### Requirement 6 — Đánh dấu đã giao

**User Story:** As a quản trị viên, tôi muốn đánh dấu đơn "đã giao cho đơn vị vận chuyển" sang "đã giao", so that đơn được xác nhận hoàn tất giao hàng.

#### Acceptance Criteria

6.1. KHI admin thực hiện hành động "đánh dấu đã giao" trên đơn ở trạng thái "đã giao cho đơn vị vận chuyển", THÌ hệ thống CHUYỂN đơn sang trạng thái "đã giao" và TRẢ đơn đã cập nhật.

6.2. KHI admin thực hiện hành động "đánh dấu đã giao" trên đơn KHÔNG ở trạng thái "đã giao cho đơn vị vận chuyển", THÌ hệ thống KHÔNG chuyển trạng thái và TRẢ lỗi kinh doanh với thông báo tiếng Việt.

### Requirement 7 — Duyệt yêu cầu hủy

**User Story:** As a quản trị viên, tôi muốn đồng ý yêu cầu hủy của khách, so that đơn được hủy và tồn kho được khôi phục.

#### Acceptance Criteria

7.1. KHI admin duyệt yêu cầu hủy trên đơn ở trạng thái "chờ duyệt hủy", THÌ hệ thống CHUYỂN đơn sang trạng thái "đã hủy", ghi thời gian hủy, KHÔI PHỤC tồn kho cho từng dòng sản phẩm và TRẢ đơn đã cập nhật.

7.2. KHI admin duyệt yêu cầu hủy trên đơn KHÔNG ở trạng thái "chờ duyệt hủy", THÌ hệ thống KHÔNG chuyển trạng thái và TRẢ lỗi kinh doanh với thông báo tiếng Việt.

7.3. KHI đơn hàng ở trạng thái "đã hủy", THÌ hệ thống KHÔNG cho phép thực hiện bất kỳ chuyển trạng thái nào nữa trên đơn.

### Requirement 8 — Từ chối yêu cầu hủy

**User Story:** As a quản trị viên, tôi muốn từ chối yêu cầu hủy của khách, so that đơn tiếp tục được xử lý.

#### Acceptance Criteria

8.1. KHI admin từ chối yêu cầu hủy trên đơn ở trạng thái "chờ duyệt hủy", THÌ hệ thống CHUYỂN đơn trở lại trạng thái "đang chuẩn bị hàng" và TRẢ đơn đã cập nhật.

8.2. KHI admin từ chối yêu cầu hủy trên đơn KHÔNG ở trạng thái "chờ duyệt hủy", THÌ hệ thống KHÔNG chuyển trạng thái và TRẢ lỗi kinh doanh với thông báo tiếng Việt.

### Requirement 9 — Giao diện quản trị

**User Story:** As a quản trị viên, tôi muốn giao diện quản trị có trang danh sách và chi tiết đơn hàng với các nút hành động theo trạng thái, so that tôi xử lý đơn hàng thuận tiện.

#### Acceptance Criteria

9.1. KHI admin đăng nhập vào frontend-admin, THÌ hệ thống HIỂN THỊ mục "Đơn hàng" trong menu điều hướng.

9.2. KHI admin mở trang "Đơn hàng", THÌ hệ thống HIỂN THỊ danh sách đơn hàng và bộ lọc trạng thái gồm "Tất cả" và từng trạng thái.

9.3. KHI admin mở chi tiết một đơn, THÌ hệ thống HIỂN THỊ đầy đủ thông tin (theo 3.1) và các nút hành động phù hợp với trạng thái hiện tại: trạng thái "đã xác nhận" → nút "Xác nhận chuẩn bị hàng"; "đang chuẩn bị hàng" → nút "Bàn giao vận chuyển"; "đã giao cho đơn vị vận chuyển" → nút "Đánh dấu đã giao"; "chờ duyệt hủy" → nút "Duyệt hủy" và "Từ chối hủy"; các trạng thái khác → KHÔNG hiển thị nút hành động.

9.4. KHI admin nhấn "Duyệt hủy", THÌ hệ thống YÊU CẦU xác nhận trước khi thực hiện, trong đó nêu rõ hành động sẽ hủy đơn và khôi phục tồn kho.

9.5. KHI thao tác chuyển trạng thái thành công, THÌ hệ thống CẬP NHẬT giao diện theo đơn mới và HIỂN THỊ thông báo thành công tiếng Việt; KHI thao tác trả về lỗi kinh doanh, THÌ hệ thống HIỂN THỊ thông báo lỗi tiếng Việt từ server.

9.6. KHI danh sách hoặc chi tiết đơn đang tải, THÌ hệ thống HIỂN THỊ trạng thái loading; KHI tải lỗi, THÌ hệ thống HIỂN THỊ thông báo lỗi.