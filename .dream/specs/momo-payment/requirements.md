# Tài liệu Yêu cầu (Requirements Document)

## Giới thiệu

Hệ thống thương mại điện tử hiện chỉ hỗ trợ phương thức thanh toán khi nhận hàng (`cod`) trên toàn bộ luồng đặt hàng, xử lý đơn tự động và giao diện quản trị. Tính năng **Thanh toán trực tuyến qua Ví MoMo (`momo-payment`)** mở rộng hệ thống để hỗ trợ cổng thanh toán **MoMo Payment Gateway v2**, tham chiếu luồng nghiệp vụ và bộ thông số môi trường từ dự án `tuoitho/DacSanSocTrang`:

- **Khách hàng (Storefront `frontend`):** có thể chọn thanh toán bằng `COD` hoặc `Ví MoMo` tại trang Thanh toán (`/checkout`), được chuyển hướng tới cổng thanh toán MoMo, nhận kết quả và cập nhật trạng thái đơn hàng ngay khi quay về trang `/momo-return`, theo dõi thời gian chờ thanh toán còn lại và thực hiện **Thanh toán lại** trên trang Lịch sử đơn hàng (`/orders`) hoặc Chi tiết đơn hàng (`/orders/:id`) nếu phiên thanh toán trước bị hủy hoặc lỗi.
- **Hệ thống Backend (`backend`):** quản lý tập trung cấu hình MoMo qua biến môi trường, ký số và xác thực chữ ký HMAC-SHA256 chuẩn MoMo v2, xử lý đồng nhất kết quả thanh toán từ cả luồng **Redirect Return** (phục vụ môi trường dev chưa có public tunnel cho IPN) lẫn **Webhook IPN** (server-to-server), đảm bảo tính bất biến khi gọi lặp (idempotency), tách biệt tiến trình tự động xác nhận đơn `cod` với tiến trình tự động hủy và hoàn tồn kho đối với đơn `momo` quá hạn chưa thanh toán.
- **Quản trị viên (Admin Portal `frontend-admin`):** nhận biết rõ phương thức thanh toán (`COD` / `Ví MoMo`), trạng thái thanh toán và mã giao dịch MoMo trên danh sách cũng như chi tiết đơn hàng để vận hành chính xác.

## Quyết định Sản phẩm & Giả định (`PD-*`)

| Mã | Quyết định / Giả định | Lý do & Phạm vi |
|---|---|---|
| **PD-1** | Bộ tham số kết nối MoMo (`MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`, `MOMO_ENDPOINT`, `MOMO_REDIRECT_URL`, `MOMO_IPN_URL`, `MOMO_REQUEST_TYPE`, `MOMO_PARTNER_NAME`, `MOMO_STORE_ID`) được nạp qua cấu hình trung tâm và khai báo sẵn giá trị Sandbox từ `DacSanSocTrang` trong `.env` / `.env.example` (điều chỉnh URL về cổng dev hiện tại `:15173` và `:18080`). | Đáp ứng yêu cầu lấy các giá trị env từ `DacSanSocTrang`, tuân thủ ranh giới cấu hình của hệ thống và không ghi lộ khóa bí mật trong nhật ký. |
| **PD-2** | Trường `paymentMethod` hỗ trợ 2 giá trị `'cod'` và `'momo'` (mặc định `'cod'` khi không truyền để tương thích ngược 100% với các client hiện hữu). Bổ sung `paymentStatus` thuộc tập `{'pending', 'paid', 'failed', 'refunded'}`, `paymentTransactionId` và `paidAt` trên thông tin đơn hàng. | Mô hình hóa rõ ràng trạng thái dòng tiền độc lập với trạng thái vận chuyển của đơn hàng. |
| **PD-3** | Kiểm tra hạn mức giao dịch MoMo (`1.000 ₫ <= totalVnd <= 50.000.000 ₫`) trước khi tạo đơn (nếu ngoài hạn mức thì từ chối, giữ nguyên giỏ hàng). Nếu đơn hợp lệ nhưng quá trình gọi cổng MoMo lấy `payUrl` ngay lúc đặt hàng gặp lỗi mạng/từ chối thì đơn hàng vẫn được lưu ở trạng thái `pending_confirmation` kèm `paymentStatus = 'failed'` và khách hàng được chuyển tới trang Chi tiết đơn hàng (`/orders/:id`) để bấm **Thanh toán lại** trong thời hạn 30 phút. | Tránh giữ khóa cơ sở dữ liệu qua lời gọi mạng ra ngoài, giữ được đơn hàng và đồng nhất với luồng Thanh toán lại của `DacSanSocTrang`. |
| **PD-4** | Luồng Redirect Return (`/momo-return` gọi API xác nhận kết quả) và luồng Webhook IPN (`/api/v1/payments/momo/ipn`) dùng chung cơ chế xác thực chữ ký HMAC-SHA256 của MoMo v2 và đối khớp `amount == totalVnd`. | Trong môi trường dev (`localhost`), máy chủ MoMo không gọi trực tiếp được IPN nội bộ nên Redirect URL đóng vai trò như callback IPN; việc kiểm tra chữ ký HMAC-SHA256 từ các tham số MoMo gắn trên URL đảm bảo chống giả mạo kết quả thanh toán ngay cả trên luồng Redirect. |
| **PD-5** | Khi thanh toán MoMo thành công (`resultCode = 0`), đơn hàng lập tức chuyển `paymentStatus = 'paid'`, lưu `transId` và chuyển `status` từ `'pending_confirmation'` sang `'confirmed'` kèm thông báo cho khách hàng. Khi `resultCode != 0` và đơn chưa thanh toán, `paymentStatus` chuyển sang `'failed'`, đơn giữ nguyên `'pending_confirmation'` để khách có thể bấm **Thanh toán lại** (sinh mã yêu cầu `<orderId>_<timestamp>` mới) hoặc chủ động hủy đơn trong thời hạn `ORDER_CONFIRM_TIMEOUT` (mặc định 30 phút). | Đồng bộ với trải nghiệm thanh toán và thanh toán lại của `DacSanSocTrang`. |
| **PD-6** | Tiến trình nền chạy định kỳ theo ngưỡng `ORDER_CONFIRM_TIMEOUT` (mặc định 30 phút) chỉ tự động xác nhận (`confirmed`) các đơn `'cod'`, và tự động hủy (`cancelled`, `paymentStatus = 'failed'`) các đơn `'momo'` quá hạn chưa thanh toán (`paymentStatus` thuộc `{'pending', 'failed'}`), đồng thời hoàn trả tồn kho biến thể, hoàn trả hạn mức giá Livestream (nếu có) và gửi thông báo cho khách hàng. | Ngăn chặn rủi ro đơn MoMo chưa thu tiền bị tự động xác nhận giao hàng và giải phóng tồn kho bị giữ bởi các phiên thanh toán bỏ dở. |
| **PD-7** | Khi một đơn hàng đã thanh toán (`paymentStatus = 'paid'`) bị hủy hợp lệ (khách tự hủy ở `'confirmed'` hoặc Quản trị viên duyệt yêu cầu hủy từ `'cancel_requested'`) hoặc hoàn tất hoàn tiền trả hàng toàn bộ (`'returned'`), hệ thống cập nhật trạng thái thanh toán nội bộ sang `paymentStatus = 'refunded'` (không gọi API hoàn tiền tự động sang MoMo). | Phản ánh nhất quán trạng thái tiền đã hoàn cho mọi đơn đã thu tiền (`momo` bị hủy/trả hàng hoặc `cod` đã giao rồi trả hàng toàn phần), đồng thời giữ phạm vi gọn không gọi API hoàn tiền tự động ngoài hệ thống. |

---

## Yêu cầu Chi tiết

### Yêu cầu 1: Quản lý Cấu hình Môi trường Cổng Thanh toán MoMo

**User Story:** Là một nhà phát triển vận hành hệ thống, tôi muốn toàn bộ thông số kết nối cổng MoMo được cấu hình qua biến môi trường tập trung kèm giá trị Sandbox mặc định chuẩn xác cho môi trường phát triển, để hệ thống kết nối MoMo an toàn mà không hardcode khóa bí mật trong mã nguồn xử lý nghiệp vụ.

#### Tiêu chí Chấp nhận (Acceptance Criteria)

1. WHEN hệ thống khởi động THEN bộ nạp cấu hình trung tâm SHALL đọc các biến môi trường `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`, `MOMO_ENDPOINT`, `MOMO_REDIRECT_URL`, `MOMO_IPN_URL`, `MOMO_REQUEST_TYPE`, `MOMO_PARTNER_NAME` và `MOMO_STORE_ID` từ biến môi trường tiến trình (ưu tiên cao hơn) hoặc tệp `.env`.
2. IF `MOMO_ENDPOINT`, `MOMO_REDIRECT_URL` hoặc `MOMO_IPN_URL` được cung cấp nhưng không phải URL `http`/`https` tuyệt đối hợp lệ THEN hệ thống SHALL từ chối khởi động với thông báo lỗi cấu hình rõ ràng.
3. WHEN ghi nhật ký hệ thống ở bất kỳ mức độ log nào (`debug`, `info`, `warn`, `error`) THEN hệ thống SHALL NOT ghi giá trị của `MOMO_SECRET_KEY` vào log.

---

### Yêu cầu 2: Đặt hàng với Phương thức Thanh toán MoMo hoặc COD

**User Story:** Là một khách hàng đang thanh toán giỏ hàng, tôi muốn chọn giữa thanh toán khi nhận hàng (`COD`) và thanh toán trực tuyến qua `Ví MoMo`, để tôi có thể thanh toán nhanh qua ví điện tử và được chuyển tới cổng MoMo ngay sau khi xác nhận đặt đơn.

#### Tiêu chí Chấp nhận (Acceptance Criteria)

1. WHEN khách hàng gửi yêu cầu tạo đơn `POST /api/v1/orders` không kèm trường `paymentMethod` hoặc có `paymentMethod = "cod"` THEN hệ thống SHALL tạo đơn hàng với `paymentMethod = "cod"`, `paymentStatus = "pending"`, `status = "pending_confirmation"`, trừ tồn kho, xóa các dòng giỏ hàng đã chọn và trả về HTTP `201` mà không sinh `payUrl`.
2. WHEN khách hàng gửi yêu cầu tạo đơn `POST /api/v1/orders` với `paymentMethod = "momo"` và tổng thanh toán `totalVnd` nằm trong khoảng từ `1000` đến `50000000` VNĐ THEN hệ thống SHALL kiểm tra địa chỉ, tồn kho, giá sản phẩm/suất giá Livestream, lưu đơn hàng với `paymentMethod = "momo"`, `paymentStatus = "pending"`, `status = "pending_confirmation"`, trừ tồn kho, xóa các sản phẩm đã chọn khỏi giỏ hàng, sau đó khởi tạo yêu cầu thanh toán tới cổng MoMo v2 với chữ ký HMAC-SHA256 hợp lệ (`requestType = "payWithMethod"`, `orderId` định dạng `<orderUUID>_<timestamp>`) và trả về HTTP `201` kèm đường dẫn `payUrl` của MoMo trong dữ liệu đơn hàng phản hồi.
3. IF khách hàng truyền `paymentMethod` khác `"cod"` và khác `"momo"` THEN hệ thống SHALL trả về HTTP `400` với `error.code = "validation_error"` và `error.fields.paymentMethod` mô tả lỗi hợp lệ.
4. IF khách hàng chọn `paymentMethod = "momo"` nhưng tổng thanh toán `totalVnd` nhỏ hơn `1000` VNĐ hoặc lớn hơn `50000000` VNĐ THEN hệ thống SHALL trả về HTTP `409` với mã lỗi nghiệp vụ và thông báo tiếng Việt nêu rõ hạn mức giao dịch MoMo (`1.000 ₫ – 50.000.000 ₫`), đồng thời giữ nguyên tồn kho và giỏ hàng của khách.
5. IF cổng thanh toán MoMo trả về lỗi hoặc không thể kết nối ngay sau khi đơn hàng mới đã được tạo tại `POST /api/v1/orders` với `paymentMethod = "momo"` THEN hệ thống SHALL cập nhật đơn hàng vừa tạo sang `paymentStatus = "failed"` và vẫn trả về HTTP `201` gồm thông tin đơn hàng (`paymentStatus = "failed"`, không có `payUrl`) để khách hàng có thể thực hiện thanh toán lại trong thời hạn hiệu lực.

---

### Yêu cầu 3: Xử lý Kết quả Thanh toán từ Redirect URL (Dev Callback) và Webhook IPN

**User Story:** Là một khách hàng vừa hoàn tất hoặc hủy giao dịch trên trang MoMo, tôi muốn hệ thống xác thực và cập nhật chính xác trạng thái thanh toán cũng như trạng thái đơn hàng ngay khi MoMo chuyển hướng trình duyệt về `/momo-return` (cũng như khi MoMo gọi IPN server-to-server), để đơn hàng được xác nhận tức thì mà không phụ thuộc vào public webhook trong môi trường phát triển.

#### Tiêu chí Chấp nhận (Acceptance Criteria)

1. WHEN trang `/momo-return` gửi các tham số kết quả do MoMo trả về lên API xác nhận kết quả thanh toán HOẶC khi máy chủ MoMo gửi thông báo tới endpoint Webhook IPN `/api/v1/payments/momo/ipn` THEN hệ thống SHALL tái tạo chuỗi `rawSignature` chuẩn phản hồi MoMo v2 và xác thực chữ ký HMAC-SHA256 bằng hằng thời gian (`constant-time`) với `MOMO_SECRET_KEY`, kiểm tra `partnerCode` khớp cấu hình, tách mã đơn hàng gốc từ `orderId` (`<orderUUID>_<timestamp>`) và đối khớp `amount` bằng đúng `totalVnd` của đơn hàng.
2. IF chữ ký `signature` không hợp lệ, `partnerCode` không khớp, hoặc `amount` không khớp `totalVnd` của đơn hàng THEN hệ thống SHALL từ chối cập nhật trạng thái đơn hàng và trả về HTTP `400`.
3. WHEN callback hợp lệ có `resultCode = 0` cho một đơn hàng `momo` đang có `status = "pending_confirmation"` và `paymentStatus` thuộc `{"pending", "failed"}` THEN hệ thống SHALL cập nhật nguyên tử (atomic, có khóa dòng chống đua tranh) `paymentStatus = "paid"`, `paymentTransactionId = transId`, `paidAt = now()`, chuyển `status = "confirmed"`, `confirmedAt = now()`, và phát thông báo xác nhận đơn hàng (`order_confirmed`) qua cơ sở dữ liệu + WebSocket tới khách hàng sở hữu đơn.
4. WHEN callback hợp lệ có `resultCode != 0` cho một đơn hàng `momo` đang có `status = "pending_confirmation"` và `paymentStatus = "pending"` THEN hệ thống SHALL cập nhật `paymentStatus = "failed"` và giữ nguyên `status = "pending_confirmation"` để khách hàng vẫn có thể thực hiện thanh toán lại trong thời gian hiệu lực.
5. IF callback hợp lệ (từ Redirect hoặc IPN) được gửi lặp lại cho một đơn hàng đã có `paymentStatus = "paid"` hoặc đơn hàng đã kết thúc/đã hủy (`status = "cancelled"`) THEN hệ thống SHALL xử lý an toàn bất biến (idempotent): không ghi đè lùi trạng thái đơn đã thanh toán, không xác nhận lại đơn đã hủy và không phát trùng thông báo; endpoint Redirect trả về HTTP `200` kèm trạng thái hiện tại của đơn hàng, còn endpoint IPN trả về HTTP `204` không có thân phản hồi.
6. WHEN endpoint Webhook IPN `/api/v1/payments/momo/ipn` xử lý thành công một thông báo hợp lệ từ MoMo THEN hệ thống SHALL phản hồi HTTP `204 No Content` để MoMo ghi nhận hoàn tất.

---

### Yêu cầu 4: Thanh toán Lại Đơn hàng MoMo và Quản lý Thời hạn Thanh toán Tự động

**User Story:** Là một khách hàng có đơn hàng MoMo chưa thanh toán thành công, tôi muốn tạo lại liên kết thanh toán MoMo mới trong vòng 30 phút kể từ lúc đặt đơn, và hệ thống tự động hủy đơn hoàn kho nếu quá hạn mà tôi không thanh toán, để việc thanh toán linh hoạt và tồn kho sản phẩm luôn chính xác.

#### Tiêu chí Chấp nhận (Acceptance Criteria)

1. WHEN khách hàng sở hữu đơn hàng gọi API thanh toán lại `POST /api/v1/orders/:id/momo/retry` cho đơn hàng có `paymentMethod = "momo"`, `status = "pending_confirmation"`, `paymentStatus` thuộc `{"pending", "failed"}` và thời điểm hiện tại chưa vượt quá `createdAt + ORDER_CONFIRM_TIMEOUT` THEN hệ thống SHALL gọi cổng MoMo tạo liên kết thanh toán mới với `orderId` định dạng `<orderUUID>_<newTimestamp>`, đặt lại `paymentStatus = "pending"` và trả về HTTP `200` gồm thông tin đơn hàng cùng `payUrl` mới.
2. IF khách hàng gọi `POST /api/v1/orders/:id/momo/retry` cho đơn hàng không thuộc quyền sở hữu THEN hệ thống SHALL trả về HTTP `404` (`order_not_found`).
3. IF khách hàng gọi `POST /api/v1/orders/:id/momo/retry` cho đơn hàng không phải phương thức `"momo"`, đã thanh toán (`paymentStatus = "paid"`), không còn ở trạng thái `"pending_confirmation"`, hoặc đã quá thời hạn `createdAt + ORDER_CONFIRM_TIMEOUT` THEN hệ thống SHALL trả về HTTP `409` với thông báo lỗi tiếng Việt rõ ràng.
4. WHEN tiến trình nền xử lý đơn đến hạn (`AutoConfirmDue`) chạy với mốc `cutoff = now() - ORDER_CONFIRM_TIMEOUT` THEN hệ thống SHALL:
   - Chỉ chuyển từ `"pending_confirmation"` sang `"confirmed"` đối với các đơn hàng có `paymentMethod = "cod"` và `created_at <= cutoff`;
   - Tự động chuyển từ `"pending_confirmation"` sang `"cancelled"` (`cancelled_at = now()`, `paymentStatus = "failed"`) đối với các đơn hàng có `paymentMethod = "momo"`, `paymentStatus` thuộc `{"pending", "failed"}` và `created_at <= cutoff`, đồng thời hoàn lại số lượng tồn kho cho từng biến thể sản phẩm, hoàn trả hạn mức giá phiên Livestream (nếu có) và phát thông báo đơn hàng bị hủy do quá hạn thanh toán tới khách hàng.
5. WHEN một đơn hàng đã thanh toán (`paymentStatus = "paid"`) chuyển sang trạng thái `"cancelled"` (do khách tự hủy ở `"confirmed"` hoặc Quản trị viên chấp thuận yêu cầu hủy ở `"cancel_requested"`) HOẶC chuyển sang `"returned"` sau khi hoàn tiền trả hàng toàn phần THEN hệ thống SHALL cập nhật `paymentStatus = "refunded"`.
6. WHEN Quản trị viên cập nhật đơn hàng `"cod"` sang trạng thái đã giao (`"delivered"`) THEN hệ thống SHALL cập nhật `paymentStatus = "paid"` và `paidAt = now()`.

---

### Yêu cầu 5: Trải nghiệm Thanh toán, Đón Kết quả và Thanh toán Lại trên Storefront (`frontend`)

**User Story:** Là một khách hàng trên Storefront, tôi muốn chọn phương thức thanh toán trực quan ở trang Checkout, nhận phản hồi rõ ràng tại trang `/momo-return` và dễ dàng bấm thanh toán lại kèm đồng hồ đếm ngược trên danh sách/chi tiết đơn hàng.

#### Tiêu chí Chấp nhận (Acceptance Criteria)

1. WHEN khách hàng truy cập trang Thanh toán (`/checkout`) THEN hệ thống SHALL hiển thị vùng chọn phương thức thanh toán gồm 2 lựa chọn: **Thanh toán khi nhận hàng (COD)** (mặc định chọn) và **Ví điện tử MoMo**; IF tổng thanh toán đơn hàng ngoài khoảng `1.000 ₫ – 50.000.000 ₫` THEN lựa chọn **Ví điện tử MoMo** SHALL bị vô hiệu hóa kèm chú thích tiếng Việt giải thích hạn mức giao dịch của MoMo.
2. WHEN khách hàng chọn **Ví điện tử MoMo** và bấm nút đặt hàng thành công THEN giao diện SHALL làm mới giỏ hàng: IF phản hồi có `payUrl` khác rỗng THEN trình duyệt SHALL chuyển hướng trực tiếp tới `payUrl` của MoMo; IF phản hồi không có `payUrl` (`paymentStatus = "failed"` do lỗi kết nối cổng MoMo lúc tạo link) THEN giao diện SHALL hiển thị thông báo cảnh báo tiếng Việt và điều hướng khách hàng tới trang Chi tiết đơn hàng (`/orders/<orderId>`) để bấm **Thanh toán lại**; trong lúc chờ phản hồi đặt đơn, nút đặt hàng SHALL bị khóa kèm trạng thái đang xử lý.
3. WHEN MoMo chuyển hướng trình duyệt khách hàng về `/momo-return` kèm các query parameters kết quả giao dịch THEN trang `MomoReturnPage` SHALL hiển thị trạng thái đang xác thực kết quả, chờ phiên đăng nhập khởi tạo xong (nếu đang khôi phục phiên), gọi API xác nhận kết quả thanh toán một lần duy nhất cho lượt truy cập đó, làm mới giỏ hàng và hiển thị màn hình kết quả tiếng Việt tương ứng:
   - Thành công (`resultCode = "0"` và xác thực hợp lệ): hiển thị biểu tượng thành công, mã đơn hàng, số tiền đã thanh toán, mã giao dịch MoMo (`transId`), nút **Xem chi tiết đơn hàng** (`/orders/<orderId>`) và nút **Tiếp tục mua sắm** (`/`);
   - Thất bại hoặc bị hủy (`resultCode != "0"` hoặc xác thực thất bại): hiển thị biểu tượng thất bại, lý do tiếng Việt rõ ràng, nút **Xem đơn & Thanh toán lại** (`/orders/<orderId>`, nếu có mã đơn hợp lệ) và nút **Về trang chủ** (`/`).
4. WHEN khách hàng xem trang Lịch sử đơn hàng (`/orders`) hoặc Chi tiết đơn hàng (`/orders/:id`) THEN hệ thống SHALL hiển thị nhãn phương thức thanh toán (`Thanh toán khi nhận hàng (COD)` hoặc `Ví điện tử MoMo`) và huy hiệu trạng thái thanh toán tiếng Việt (`Chờ thanh toán`, `Đã thanh toán`, `Thanh toán thất bại`, `Đã hoàn tiền`), kèm mã giao dịch MoMo (nếu có).
5. IF đơn hàng trên trang `/orders` hoặc `/orders/:id` có `paymentMethod = "momo"`, `status = "pending_confirmation"` và `paymentStatus` thuộc `{"pending", "failed"}` trong thời hạn thanh toán (`cancellableUntil > now()`) THEN giao diện SHALL hiển thị đồng hồ đếm ngược thời gian thanh toán còn lại và nút **Thanh toán lại qua MoMo**; WHEN khách hàng bấm nút này THEN hệ thống SHALL gọi `POST /api/v1/orders/:id/momo/retry` và chuyển hướng trình duyệt sang `payUrl` mới.
6. WHEN hiển thị các thành phần mới trên `/checkout`, `/momo-return`, `/orders` và `/orders/:id` ở cả kích thước desktop (`1440x900`) và mobile (`375x812`) THEN bố cục SHALL tuân thủ ngôn ngữ thiết kế editorial của Storefront, hỗ trợ thao tác bàn phím đầy đủ và không gây tràn ngang (`scrollWidth <= innerWidth`).

---

### Yêu cầu 6: Hiển thị Thông tin Thanh toán MoMo trên Admin Portal (`frontend-admin`)

**User Story:** Là một quản trị viên trên Admin Portal, tôi muốn xem rõ phương thức thanh toán, trạng thái thanh toán và mã giao dịch MoMo của từng đơn hàng để kiểm soát đối soát và xử lý vận hành chính xác.

#### Tiêu chí Chấp nhận (Acceptance Criteria)

1. WHEN quản trị viên xem danh sách đơn hàng (`/orders`) trên Admin Portal THEN bảng danh sách SHALL hiển thị thông tin phương thức thanh toán (`COD` / `MoMo`) và huy hiệu trạng thái thanh toán tiếng Việt tương ứng cho từng đơn hàng.
2. WHEN quản trị viên mở trang Chi tiết đơn hàng (`/orders/:id`) trên Admin Portal THEN hệ thống SHALL hiển thị tên phương thức thanh toán tiếng Việt (`Thanh toán khi nhận hàng (COD)` hoặc `Ví điện tử MoMo`), trạng thái thanh toán (`Chờ thanh toán`, `Đã thanh toán`, `Thanh toán thất bại`, `Đã hoàn tiền`), thời điểm thanh toán (`paidAt`, nếu có) và mã giao dịch MoMo (`paymentTransactionId`, nếu có).
