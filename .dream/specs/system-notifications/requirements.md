# Tài liệu Yêu cầu (Requirements Document)

## Giới thiệu

Hệ thống hiện đã có bảng dữ liệu `notifications` (được thiết kế sẵn cột `category` và `metadata jsonb`) cùng hạ tầng WebSocket Hub (`/api/v1/chat/ws`) đang phục vụ thông báo cho phân hệ Bài viết (`post`). Tính năng **Thông báo Realtime Toàn Hệ Thống (`system-notifications`)** mở rộng hạ tầng này để ghi nhận, lưu trữ và phát sự kiện thông báo theo thời gian thực kèm đường dẫn điều hướng trực tiếp (deep-link) cho hai nhóm người dùng:

- **Khách hàng (Storefront `frontend`):** nhận thông báo khi đơn hàng chuyển trạng thái, yêu cầu trả hàng/hoàn tiền được cập nhật, Quản trị viên phản hồi đánh giá sản phẩm, hoặc khi phiên Livestream mới bắt đầu.
- **Quản trị viên (Admin Portal `frontend-admin`):** nhận thông báo khi khách hàng đặt đơn hàng mới, hủy đơn hàng / gửi yêu cầu hủy đơn, hoặc gửi yêu cầu trả hàng mới.

Thông báo được quản lý qua API thống nhất `/api/v1/notifications` có lọc theo danh mục (`category`), giữ nguyên khả năng tương thích ngược 100% với hợp đồng thông báo Bài viết hiện hành, đồng thời nâng cấp chuông thông báo ở cả Storefront và Admin Portal.

## Quyết định Sản phẩm & Giả định (`PD-*`)

| Mã | Quyết định / Giả định | Lý do & Phạm vi |
|---|---|---|
| **PD-1** | Danh mục thông báo (`category`) hỗ trợ toàn hệ thống gồm đúng 5 giá trị: `post`, `order`, `return`, `review`, `live`. | Bao phủ trọn vẹn phân hệ Bài viết hiện có cùng Đơn hàng, Trả hàng, Đánh giá và Livestream; các bộ lọc ngoài 5 giá trị này (khi không rỗng) bị từ chối rõ ràng với HTTP 400. |
| **PD-2** | Thông báo phía Khách hàng gồm 12 loại: Đơn hàng (`order_confirmed`, `order_preparing`, `order_shipped`, `order_delivered`, `order_cancel_approved`, `order_cancel_declined`), Trả hàng (`return_approved`, `return_rejected`, `return_received`, `return_refunded`), Phản hồi đánh giá (`review_replied`, chỉ phát khi Admin lưu/cập nhật nội dung phản hồi khác rỗng), và Livestream (`livestream_started` khi Admin tạo phiên Live mới đang phát). | Phản ánh đúng vòng đời thực tế của đơn hàng (`AutoConfirmDue` và 5 hành động `AdminTransition`), quy trình trả hàng (`Approve`, `Reject`, `Receive`, `Refund`), phản hồi đánh giá (`UpdateAdminReply` khi `reply != nil`) và mô hình Livestream bắt đầu phát ngay khi tạo phiên. |
| **PD-3** | Thông báo phía Quản trị viên phát cho mọi tài khoản Admin đang hoạt động (`role = 'admin'`, `status = 'active'`) gồm 4 loại: `admin_order_created`, `admin_order_cancel_requested`, `admin_order_cancelled`, `admin_return_created`. | Tự động hủy đơn hay gửi yêu cầu hủy do khách hàng thực hiện được phân biệt rõ ràng để Admin xử lý kịp thời. Tên khách hàng hiển thị ở `actorName` ưu tiên `users.display_name` (đồng bộ với hồ sơ khách hàng) rồi mới fallback về tên đơn hàng/địa chỉ/email. |
| **PD-4** | Thông báo do cửa hàng/Admin gửi cho khách hàng (`order_*`, `return_*`, `review_replied`, `livestream_started`) để `actorId = null`, hiển thị nhãn đại diện `'Cửa hàng'` trên giao diện thay vì lộ danh tính tài khoản Admin cá nhân. | Bảo vệ thông tin nội bộ của nhân viên vận hành và thống nhất trải nghiệm thương hiệu phía khách hàng. |
| **PD-5** | Việc tạo và đẩy thông báo qua WebSocket vận hành theo nguyên tắc best-effort sau khi giao dịch nghiệp vụ chính commit thành công: mọi lỗi ghi DB hoặc phát WS thông báo chỉ được ghi log cảnh báo (`slog.Warn`), không làm thất bại request đặt đơn, duyệt trả hàng, phản hồi đánh giá, mở live hay tiến trình tự động xác nhận đơn. | Đảm bảo độ tin cậy giao dịch thương mại là tối thượng; lỗi thông báo không được chặn dòng tiền hoặc đơn hàng. |
| **PD-6** | Mọi thông báo ngoài phân hệ Bài viết (`order`, `return`, `review`, `live`) sử dụng `group_key = ''` (`actor_count = 1`) để mỗi lần chuyển trạng thái tạo thành một bản ghi mốc thời gian độc lập; cơ chế gộp nhóm theo `group_key` của Bài viết được giữ nguyên hoàn toàn. | Khách hàng và Admin cần theo dõi đầy đủ từng mốc biến động đơn hàng/trả hàng thay vì bị ghi đè. |
| **PD-7** | Chuông thông báo bổ sung thanh lọc theo danh mục: Storefront gồm `Tất cả`, `Đơn hàng` (`order`), `Đổi trả` (`return`), `Đánh giá` (`review`), `Live` (`live`), `Bài viết` (`post`); Admin Portal gồm `Tất cả`, `Đơn hàng` (`order`), `Trả hàng` (`return`), `Bài viết` (`post`). Huy hiệu số chưa đọc (`unreadCount`) luôn biểu thị tổng số thông báo chưa đọc trên mọi danh mục của người nhận. | Giúp phân tách nhanh thông báo vận hành khỏi tương tác mạng xã hội mà vẫn đảm bảo tổng số thông báo chưa đọc chính xác toàn cục. |
| **PD-8** | Dữ liệu điều hướng deep-link và ngữ cảnh nghiệp vụ (mã đơn rút gọn `#XXXXXXXX`, `orderId`, `returnId`, `reviewId`, `productId`, `productName`, `sessionId`, `sessionTitle`, `status`, `rejectReason`, `refundAmountVnd`, `targetPath`) được đặt trong `metadata`, giữ nguyên tập 17 trường cấp cao nhất của `NotificationItem` JSON. | Duy trì tương thích ngược tuyệt đối với hợp đồng API thông báo hiện có. |

## Yêu cầu Chi tiết

### Yêu cầu 1: Thông báo Trạng thái Đơn hàng cho Khách hàng

**User Story:** Là một khách hàng, tôi muốn nhận thông báo realtime kèm liên kết mở thẳng đơn hàng mỗi khi trạng thái đơn hàng thay đổi, để tôi nắm bắt tiến trình xử lý và giao nhận kịp thời.

#### Tiêu chí Chấp nhận (Acceptance Criteria)

1. WHEN tiến trình xác nhận tự động (chạy định kỳ hoặc kích hoạt đúng hạn) chuyển các đơn hàng từ `pending_confirmation` sang `confirmed` THEN hệ thống SHALL tạo thông báo danh mục `order`, loại `order_confirmed` cho chủ sở hữu từng đơn hàng với `metadata.orderId`, `metadata.orderShortCode`, `metadata.status = "confirmed"` và `metadata.targetPath = "/orders/<orderId>"`.
2. WHEN quản trị viên chuyển đơn hàng sang `preparing` (`confirm_preparing`), `shipped` (`ship`) hoặc `delivered` (`deliver`) THEN hệ thống SHALL tạo thông báo danh mục `order` với loại tương ứng (`order_preparing`, `order_shipped`, `order_delivered`) cho chủ sở hữu đơn hàng và `metadata.targetPath = "/orders/<orderId>"`.
3. WHEN quản trị viên phê duyệt yêu cầu hủy đơn (`approve_cancel`, sang `cancelled`) hoặc từ chối yêu cầu hủy đơn (`decline_cancel`, quay lại `preparing`) THEN hệ thống SHALL tạo thông báo danh mục `order` với loại `order_cancel_approved` hoặc `order_cancel_declined` gửi tới khách hàng cùng liên kết tới `/orders/<orderId>`.
4. WHEN bất kỳ thông báo đơn hàng nào tại 1.1–1.3 được tạo thành công THEN hệ thống SHALL phát sự kiện WebSocket `notification:new` tới các kết nối đang mở của khách hàng sở hữu đơn hàng đó và đặt `actorId = null`.

---

### Yêu cầu 2: Thông báo Trả hàng, Phản hồi Đánh giá và Livestream cho Khách hàng

**User Story:** Là một khách hàng, tôi muốn nhận thông báo realtime khi yêu cầu trả hàng/hoàn tiền có cập nhật, khi shop phản hồi đánh giá sản phẩm của tôi, hoặc khi có buổi Livestream mới bắt đầu, để tôi không bỏ lỡ quyền lợi và ưu đãi.

#### Tiêu chí Chấp nhận (Acceptance Criteria)

1. WHEN quản trị viên thực hiện duyệt (`approve`), từ chối (`reject`), xác nhận đã nhận hàng (`receive`) hoặc hoàn tiền (`refund`) trên yêu cầu trả hàng THEN hệ thống SHALL tạo thông báo danh mục `return` cho khách hàng sở hữu yêu cầu với loại tương ứng (`return_approved`, `return_rejected`, `return_received`, `return_refunded`), chứa `metadata.returnId`, `metadata.orderId`, `metadata.targetPath = "/orders/<orderId>"`, kèm `metadata.rejectReason` (khi từ chối) hoặc `metadata.refundAmountVnd` (khi hoàn tiền), và phát sự kiện WebSocket `notification:new`.
2. WHEN quản trị viên tạo mới hoặc cập nhật phản hồi đánh giá với nội dung khác rỗng THEN hệ thống SHALL tạo thông báo danh mục `review`, loại `review_replied` cho khách hàng đã viết đánh giá đó với `metadata.reviewId`, `metadata.orderId`, `metadata.productId`, `metadata.productName`, `metadata.targetPath = "/reviews"`, đoạn trích nội dung phản hồi trong `excerpt`, và phát sự kiện WebSocket `notification:new`.
3. IF quản trị viên xóa phản hồi đánh giá (`reply == nil`) THEN hệ thống SHALL NOT tạo thông báo mới.
4. WHEN quản trị viên tạo phiên Livestream mới thành công (trạng thái `live`) THEN hệ thống SHALL tạo bản ghi thông báo danh mục `live`, loại `livestream_started` cho toàn bộ khách hàng đang hoạt động (`role = 'customer'`, `status = 'active'`) với `metadata.sessionId`, `metadata.sessionTitle`, `metadata.targetPath = "/live/<sessionId>"`, và phát sự kiện WebSocket `notification:new` tới những khách hàng đang kết nối trực tuyến.

---

### Yêu cầu 3: Thông báo Đơn hàng & Yêu cầu Trả hàng Mới cho Quản trị viên

**User Story:** Là một quản trị viên, tôi muốn nhận thông báo realtime kèm tên khách hàng và liên kết xử lý khi có đơn hàng mới, khách hàng hủy hoặc gửi yêu cầu hủy đơn, hoặc có yêu cầu trả hàng mới, để tôi phản hồi và vận hành nhanh chóng.

#### Tiêu chí Chấp nhận (Acceptance Criteria)

1. WHEN khách hàng tạo đơn hàng mới thành công THEN hệ thống SHALL tạo thông báo danh mục `order`, loại `admin_order_created` cho mọi quản trị viên đang hoạt động (`role = 'admin'`, `status = 'active'`) với `actorId` là ID khách hàng, `metadata.orderId`, `metadata.orderShortCode`, `metadata.totalVnd`, `metadata.targetPath = "/orders/<orderId>"`, và phát WebSocket `notification:new` tới từng quản trị viên.
2. WHEN khách hàng tự hủy đơn ở trạng thái `pending_confirmation`/`confirmed` (sang `cancelled`) hoặc gửi yêu cầu hủy ở trạng thái `preparing` (sang `cancel_requested`) THEN hệ thống SHALL tạo thông báo danh mục `order` với loại tương ứng `admin_order_cancelled` hoặc `admin_order_cancel_requested` gửi tới mọi quản trị viên đang hoạt động kèm `actorId` và `metadata.targetPath = "/orders/<orderId>"`.
3. WHEN khách hàng tạo yêu cầu trả hàng mới THEN hệ thống SHALL tạo thông báo danh mục `return`, loại `admin_return_created` gửi tới mọi quản trị viên đang hoạt động với `actorId`, `metadata.returnId`, `metadata.orderId`, `metadata.orderShortCode`, `metadata.targetPath = "/returns/<returnId>"`, và phát WebSocket `notification:new`.
4. WHEN truy vấn hoặc đẩy các thông báo 3.1–3.3 THEN hệ thống SHALL giải quyết `actorName` của khách hàng theo chuỗi ưu tiên `display_name` (theo `DB-USER-PROFILE@1`), rồi mới đến tên đơn hàng gần nhất, tên địa chỉ mặc định, phần trước `@` của email hoặc `'Khách hàng'`.

---

### Yêu cầu 4: API Thông báo Hợp nhất, Lọc Danh mục và Tương thích Ngược

**User Story:** Là một hệ thống client (Storefront và Admin Portal), tôi muốn tải danh sách thông báo theo từng danh mục qua API thống nhất mà không phá vỡ bất kỳ tính năng thông báo Bài viết nào đang chạy.

#### Tiêu chí Chấp nhận (Acceptance Criteria)

1. WHEN người dùng đã đăng nhập gọi `GET /api/v1/notifications?limit=<n>&offset=<m>` hoặc kèm `&category=<c>` với `category` rỗng hoặc thuộc `{post, order, return, review, live}` THEN hệ thống SHALL trả về HTTP `200` gồm `data.items` đã lọc (nếu có `category`), sắp xếp theo `updated_at DESC, id DESC`, và `data.unreadCount` là tổng số thông báo chưa đọc trên mọi danh mục của người nhận.
2. IF giá trị query `category` khác rỗng và không thuộc `{post, order, return, review, live}` THEN hệ thống SHALL trả về HTTP `400` theo Full Status Envelope với `error.code = "invalid_filter"` và `error.fields.category` mang thông báo tiếng Việt hợp lệ.
3. IF yêu cầu tới `/api/v1/notifications*` không có access token hợp lệ THEN hệ thống SHALL trả về HTTP `401` (`invalid_token`).
4. WHEN trả về bất kỳ phần tử `NotificationItem` nào (từ API Bài viết lẫn thông báo hệ thống) THEN cấu trúc JSON cấp cao nhất SHALL giữ nguyên chính xác 17 trường hiện hành và đảm bảo mọi endpoint Bài viết, `POST /api/v1/notifications/:id/read`, `POST /api/v1/notifications/read-all` tiếp tục hoạt động đúng hợp đồng cũ.

---

### Yêu cầu 5: Đồng bộ WebSocket Hub & Độ tin cậy Bất đồng bộ

**User Story:** Là một người dùng đang mở ứng dụng, tôi muốn nhận thông báo tức thì khi có sự kiện mới mà các nghiệp vụ đặt đơn, duyệt trả hàng, đánh giá hay mở Livestream vẫn luôn ổn định ngay cả khi kênh thông báo gặp lỗi.

#### Tiêu chí Chấp nhận (Acceptance Criteria)

1. WHEN thông báo mới (bao gồm `order`, `return`, `review`, `live`, `post`) được lưu thành công THEN hệ thống SHALL đẩy gói sự kiện `{"type": "notification:new", "payload": <NotificationItem>}` qua WebSocket `/api/v1/chat/ws` tới các kết nối đang hoạt động của đúng `recipientId`.
2. WHEN phát thông báo `livestream_started` tới số lượng lớn khách hàng THEN hệ thống SHALL chèn hàng loạt bản ghi vào cơ sở dữ liệu và chỉ thực hiện đóng gói/gửi WebSocket tới các `recipientId` đang có kết nối trực tuyến trên Hub.
3. IF quá trình lưu bản ghi thông báo hoặc phát qua WebSocket Hub gặp lỗi THEN hệ thống SHALL ghi nhận cảnh báo vào `slog.Warn` (không ghi lộ secret/token) và SHALL NOT trả lỗi hay rollback giao dịch nghiệp vụ chính (đơn hàng, trả hàng, phản hồi đánh giá, phiên livestream).

---

### Yêu cầu 6: Giao diện Chuông Thông báo trên Storefront (`frontend`)

**User Story:** Là một khách hàng trên Storefront, tôi muốn xem, lọc theo danh mục, nhận realtime và bấm vào thông báo đơn hàng, trả hàng, phản hồi đánh giá, livestream hoặc bài viết để đi thẳng tới màn hình tương ứng.

#### Tiêu chí Chấp nhận (Acceptance Criteria)

1. WHEN mở panel chuông thông báo trên `Header` Storefront THEN hệ thống SHALL hiển thị thanh lọc gồm 6 tab tiếng Việt (`Tất cả`, `Đơn hàng`, `Đổi trả`, `Đánh giá`, `Live`, `Bài viết`); khi chuyển tab, giao diện SHALL gọi lại danh sách theo danh mục tương ứng, hiển thị trạng thái đang tải và trạng thái rỗng tiếng Việt phù hợp mà không làm mất giá trị huy hiệu tổng `unreadCount` trên nút chuông.
2. WHEN có sự kiện WebSocket `notification:new` gửi đến cho một thông báo chưa đọc mới THEN hệ thống SHALL tăng huy hiệu `unreadCount` tức thì; IF người dùng đang chọn tab `Tất cả` hoặc đúng `category` của thông báo đó THEN hệ thống SHALL đưa thông báo mới lên đầu danh sách hiển thị.
3. WHEN hiển thị từng dòng thông báo (`order_*`, `return_*`, `review_replied`, `livestream_started`, và 4 loại `post`), giao diện SHALL sử dụng biểu tượng và nội dung tiếng Việt phân biệt rõ từng loại, kèm nhãn `'Cửa hàng'` đối với thông báo từ hệ thống.
4. WHEN khách hàng bấm vào một thông báo THEN hệ thống SHALL đánh dấu đã đọc (nếu đang chưa đọc), đóng panel và điều hướng tới đúng đường dẫn: `/orders/<orderId>` (đơn hàng / trả hàng), `/reviews` (phản hồi đánh giá), `/live/<sessionId>` (livestream), hoặc `/posts/<postId>` (bài viết).
5. WHEN hiển thị dropdown chuông thông báo trên màn hình desktop (`1440x900`) và mobile (`375x812`) THEN thanh lọc danh mục và danh sách thông báo SHALL bố cục gọn gàng, cuộn ngang mượt khi cần và không gây tràn ngang (`scrollWidth <= innerWidth`).

---

### Yêu cầu 7: Giao diện Chuông Thông báo trên Admin Portal (`frontend-admin`)

**User Story:** Là một quản trị viên trên Admin Portal, tôi muốn nhận thông báo realtime về đơn hàng mới, hủy đơn, trả hàng mới cùng phản hồi bài viết, lọc nhanh theo nhóm và bấm để mở thẳng chi tiết xử lý.

#### Tiêu chí Chấp nhận (Acceptance Criteria)

1. WHEN mở panel chuông thông báo trên `AdminLayout` THEN hệ thống SHALL hiển thị thanh lọc gồm 4 tab tiếng Việt (`Tất cả`, `Đơn hàng`, `Trả hàng`, `Bài viết`) và giữ nguyên huy hiệu `unreadCount` toàn cục.
2. WHEN nhận sự kiện WebSocket `notification:new` với `admin_order_created`, `admin_order_cancel_requested`, `admin_order_cancelled` hoặc `admin_return_created` THEN `AdminNotificationBell` SHALL cập nhật huy hiệu chưa đọc tức thì, hiển thị tên khách hàng (`actorName`), mã đơn rút gọn (`orderShortCode`) / thông tin tóm tắt bằng tiếng Việt, và cập nhật danh sách đang xem nếu khớp bộ lọc.
3. WHEN quản trị viên bấm vào thông báo THEN hệ thống SHALL đánh dấu đã đọc (nếu chưa đọc), đóng panel và điều hướng tới `/orders/<orderId>` (đơn hàng), `/returns/<returnId>` (yêu cầu trả hàng) hoặc `/posts/<postId>` (bài viết).
4. WHEN hiển thị dropdown chuông thông báo trên màn hình Admin (`1440x900`) THEN thanh tab lọc và nội dung thông báo SHALL hiển thị rõ ràng, không tràn viền hay che khuất thành phần điều khiển khác.
