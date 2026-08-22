# Requirements Document

## Introduction

Xây dựng tính năng **trả hàng và hoàn tiền** cho cửa hàng. Sau khi đơn hàng được giao thành công, khách hàng có thể tạo **yêu cầu trả hàng theo từng mặt hàng** (kèm số lượng cụ thể) trong vòng **7 ngày** kể từ thời điểm giao. Yêu cầu trả hàng có vòng đời riêng, tách biệt khỏi trạng thái đơn hàng; người bán (admin) xử lý qua các bước: duyệt/từ chối → xác nhận đã nhận lại hàng (hoàn kho) → ghi nhận hoàn tiền.

Vì hệ thống hiện chỉ hỗ trợ thanh toán COD và chưa có bảng thanh toán, "hoàn tiền" trong phạm vi này là **ghi nhận hoàn tiền thủ công**: admin tự chuyển khoản cho khách ngoài hệ thống và cập nhật kết quả (số tiền, thời gian, người ghi nhận) vào yêu cầu trả hàng.

Phạm vi: backend API, storefront (khách hàng) và frontend-admin (người bán). Không bao gồm tích hợp cổng thanh toán, vận đơn ngược (tracking gửi hàng trả về), hay hoàn tiền qua ví/điểm thưởng.

## Quyết định sản phẩm (đã được chủ sở hữu sản phẩm phê duyệt)

- **Trả theo từng mặt hàng:** mỗi yêu cầu trả hàng liệt kê các dòng hàng của đơn kèm số lượng muốn trả (≤ số lượng đã mua); không bắt buộc trả toàn bộ đơn.
- **Cửa sổ 7 ngày:** chỉ được tạo yêu cầu trả hàng trong 7 ngày kể từ thời điểm đơn chuyển sang trạng thái "đã giao". Cần bổ sung cột mốc thời gian giao hàng cho bảng `orders` (chi tiết kỹ thuật ở giai đoạn thiết kế).
- **Yêu cầu trả hàng là thực thể riêng:** vòng đời của yêu cầu (`chờ duyệt → đã duyệt → đã nhận hàng → đã hoàn tiền`, nhánh `bị từ chối` / `khách rút yêu cầu`) độc lập với `orders.status`. Đơn hàng chỉ chuyển sang `returned` khi có hoàn tiền đầu tiên được ghi nhận.
- **Hoàn kho khi nhận hàng:** khi admin xác nhận đã nhận lại hàng, tồn kho của các biến thể tương ứng được cộng lại đúng số lượng.
- **Hoàn phí vận chuyển:** tiền hoàn bao gồm giá trị mặt hàng trả cộng phí vận chuyển ban đầu của đơn; phí vận chuyển chỉ được hoàn đúng MỘT lần cho mỗi đơn, gắn với lần hoàn tiền đầu tiên được ghi nhận thành công.
- **Hoàn tiền thủ công:** admin nhập số tiền hoàn thực tế (hệ thống gợi ý số tiền tính tự động), hệ thống lưu số tiền, thời điểm và người ghi nhận. Không tích hợp cổng thanh toán.
- **Lý do trả hàng cố định:** khách chọn một lý do từ danh sách định sẵn (hàng lỗi, không đúng mô tả, giao thiếu/sai, đổi ý), kèm mô tả bổ sung tùy chọn.
- **Chuyển `returned` sớm nhất:** ngay khi lần hoàn tiền ĐẦU TIÊN của đơn được ghi nhận, đơn chuyển sang `returned` (dù mới trả một phần). Các yêu cầu trả hàng tiếp theo cho các mặt hàng còn lại vẫn được tạo bình thường trong cửa sổ 7 ngày.
- **Rút yêu cầu:** khách có thể tự hủy yêu cầu khi còn ở bước "chờ duyệt"; sau khi admin duyệt thì không rút được nữa.
- **Một yêu cầu mở mỗi đơn:** tại mỗi thời điểm chỉ có tối đa MỘT yêu cầu trả hàng đang mở (`chờ duyệt` / `đã duyệt`) cho mỗi đơn; muốn trả thêm mặt hàng khác phải đợi yêu cầu hiện tại kết thúc.

---

## Requirements

### Requirement 1 — Tạo yêu cầu trả hàng theo từng mặt hàng

**User Story:** Với vai trò khách hàng, tôi muốn chọn từng mặt hàng và số lượng cần trả của đơn đã giao, để yêu cầu trả đúng những gì tôi muốn.

#### Acceptance Criteria

1.1. KHI khách mở trang chi tiết đơn của chính mình ở trạng thái "đã giao" hoặc "trả hàng", VÀ còn trong vòng 7 ngày kể từ khi giao, THÌ hệ thống HIỂN THỊ nút "Yêu cầu trả hàng".

1.2. KHI khách mở form tạo yêu cầu trả hàng, THÌ hệ thống HIỂN THỊ các dòng hàng của đơn (tên, ảnh chụp, giá đơn vị) kèm ô chọn số lượng trả tối đa bằng số lượng mua trừ số lượng đã nằm trong các yêu cầu trước.

1.3. KHI khách gửi yêu cầu trả hàng, THÌ yêu cầu BAO GỒM: ít nhất một dòng hàng có số lượng ≥ 1, một lý do từ danh sách cố định, và mô tả bổ sung tùy chọn.

1.4. KHI yêu cầu hợp lệ được tạo, THÌ hệ thống TẠO yêu cầu trả hàng ở trạng thái "chờ duyệt" và HIỂN THỊ thông báo tạo yêu cầu thành công.

1.5. KHI khách chọn số lượng vượt quá mức tối đa của dòng hàng, hoặc không chọn dòng nào, THÌ hệ thống KHÔNG tạo yêu cầu và HIỂN THỊ lỗi xác thực tại trường tương ứng.

### Requirement 2 — Điều kiện đủ điều kiện trả hàng

**User Story:** Với vai trò người bán, tôi muốn hệ thống chỉ chấp nhận yêu cầu trả hàng hợp lệ về thời hạn và số lượng, để tránh bị lạm dụng hoặc hoàn trùng.

#### Acceptance Criteria

2.1. KHI đơn không thuộc về khách đang thao tác, THÌ hệ thống TỪ CHỐI và KHÔNG tiết lộ thông tin đơn hàng (403/404).

2.2. KHI đơn ở trạng thái không thể trả hàng (chưa giao, đã hủy...), THÌ hệ thống TRẢ lỗi kinh doanh với thông báo tiếng Việt.

2.3. KHI đã quá 7 ngày kể từ thời điểm giao, THÌ hệ thống TRẢ lỗi kinh doanh `return_window_expired` với thông báo tiếng Việt.

2.4. KHI đơn đang có một yêu cầu trả hàng đang mở, THÌ hệ thống KHÔNG cho tạo yêu cầu mới và TRẢ lỗi kinh doanh với thông báo tiếng Việt.

2.5. KHI tổng số lượng trả của một dòng (đã yêu cầu trước + yêu cầu mới) vượt quá số lượng đã mua, THÌ hệ thống TỪ CHỐI với lỗi kinh doanh nêu rõ giới hạn còn lại của dòng đó.

2.6. KHI nhiều yêu cầu được gửi đồng thời trên cùng các dòng hàng, THÌ hệ thống ĐẢM BẢO tổng số lượng đã yêu cầu của mỗi dòng không bao giờ vượt quá số lượng đã mua (toàn vẹn giao dịch).

### Requirement 3 — Rút yêu cầu trả hàng

**User Story:** Với vai trò khách hàng, tôi muốn rút lại yêu cầu trả hàng khi còn chờ duyệt, phòng khi tôi đổi ý.

#### Acceptance Criteria

3.1. KHI yêu cầu trả hàng đang ở trạng thái "chờ duyệt", THÌ hệ thống HIỂN THỊ nút "Rút yêu cầu" cho chính khách đã tạo.

3.2. KHI khách rút yêu cầu ở trạng thái "chờ duyệt", THÌ hệ thống CHUYỂN yêu cầu sang trạng thái "khách đã rút" và CHO PHÉP tạo yêu cầu trả hàng mới ngay sau đó.

3.3. KHI yêu cầu không còn ở trạng thái "chờ duyệt", THÌ hệ thống KHÔNG cho rút và TRẢ lỗi kinh doanh với thông báo tiếng Việt.

### Requirement 4 — Khách theo dõi yêu cầu trả hàng

**User Story:** Với vai trò khách hàng, tôi muốn thấy trạng thái yêu cầu trả hàng ngay trên trang chi tiết đơn, để biết yêu cầu đang ở bước nào.

#### Acceptance Criteria

4.1. KHI đơn có yêu cầu trả hàng, THÌ trang chi tiết đơn HIỂN THỊ mục trả hàng gồm: trạng thái hiện tại, danh sách dòng hàng và số lượng trả, lý do, mô tả bổ sung, thời gian tạo và thời điểm cập nhật gần nhất.

4.2. KHI admin thay đổi trạng thái yêu cầu (duyệt, từ chối kèm lý do, đã nhận hàng, đã hoàn tiền), THÌ khách THẤY trạng thái và lý do từ chối (nếu có) khi mở lại trang chi tiết đơn.

4.3. KHI yêu cầu đã hoàn tất hoàn tiền, THÌ khách THẤY số tiền hoàn thực tế đã được ghi nhận.

### Requirement 5 — Admin quản lý danh sách yêu cầu trả hàng

**User Story:** Với vai trò người bán, tôi muốn xem danh sách các yêu cầu trả hàng theo trạng thái, để xử lý kịp thời.

#### Acceptance Criteria

5.1. KHI admin mở trang yêu cầu trả hàng, THÌ hệ thống HIỂN THỊ danh sách yêu cầu (mã yêu cầu, mã đơn, khách hàng, giá trị đề nghị, trạng thái, thời gian tạo) sắp xếp mới nhất trước, có phân trang.

5.2. KHI admin lọc theo trạng thái, THÌ hệ thống CHỈ HIỂN THỊ các yêu cầu thuộc trạng thái đã chọn.

5.3. KHI admin mở chi tiết một yêu cầu, THÌ hệ thống HIỂN THỊ đầy đủ: thông tin đơn và khách, các dòng hàng trả, lý do, mô tả, lịch sử trạng thái.

5.4. KHI người dùng thường gọi các endpoint admin của tính năng này, THÌ hệ thống TỪ CHỐI với lỗi 403.

### Requirement 6 — Admin duyệt hoặc từ chối yêu cầu

**User Story:** Với vai trò người bán, tôi muốn duyệt hoặc từ chối yêu cầu trả hàng kèm lý do từ chối, để kiểm soát việc nhận lại hàng.

#### Acceptance Criteria

6.1. KHI yêu cầu đang "chờ duyệt", THÌ admin THẤY hai thao tác "Duyệt" và "Từ chối".

6.2. KHI admin duyệt, THÌ yêu cầu CHUYỂN sang "đã duyệt" và KHÔNG thay đổi tồn kho ở bước này.

6.3. KHI admin từ chối, THÌ yêu cầu CHUYỂN sang "bị từ chối" VÀ BẮT BUỘC kèm nội dung lý do từ chối hiển thị cho khách; khách có thể tạo yêu cầu mới sau đó.

6.4. KHI admin thao tác trên yêu cầu không còn ở trạng thái "chờ duyệt", THÌ hệ thống TRẢ lỗi kinh doanh với thông báo tiếng Việt.

### Requirement 7 — Admin xác nhận nhận lại hàng (hoàn kho)

**User Story:** Với vai trò người bán, tôi muốn xác nhận đã nhận lại hàng để hệ thống cộng tồn kho đúng lúc hàng thật sự về kho.

#### Acceptance Criteria

7.1. KHI yêu cầu đang ở "đã duyệt", THÌ admin THẤY thao tác "Xác nhận đã nhận hàng".

7.2. KHI admin xác nhận đã nhận hàng, THÌ hệ thống CHUYỂN yêu cầu sang "đã nhận hàng" VÀ CỘNG tồn kho của từng biến thể đúng số lượng trong yêu cầu.

7.3. KHI biến thể không còn tồn tại hoặc đã bị xóa mềm, THÌ hệ thống VẪN HOÀN TẤT xác nhận nhận hàng và GHI NHẬN hoàn kho an toàn (không làm hỏng dữ liệu tồn kho của biến thể khác).

7.4. KHI thao tác hoàn kho không thể hoàn tất, THÌ hệ thống KHÔNG đổi trạng thái yêu cầu và KHÔNG thay đổi tồn kho (toàn vẹn giao dịch).

### Requirement 8 — Admin ghi nhận hoàn tiền thủ công

**User Story:** Với vai trò người bán, tôi muốn ghi nhận kết quả chuyển khoản hoàn tiền cho khách, để đóng phiên trả hàng và lưu vết.

#### Acceptance Criteria

8.1. KHI yêu cầu đang ở "đã nhận hàng", THÌ hệ thống HIỂN THỊ số tiền đề nghị = giá trị các dòng hàng trả (+ phí vận chuyển ban đầu nếu đây là lần hoàn tiền đầu tiên của đơn).

8.2. KHI admin ghi nhận hoàn tiền, THÌ hệ thống LƯU số tiền thực tế (số nguyên VND > 0), thời điểm ghi nhận và tài khoản admin thực hiện, rồi CHUYỂN yêu cầu sang "đã hoàn tiền".

8.3. KHI đây là lần hoàn tiền đầu tiên được ghi nhận của đơn, THÌ số tiền đề nghị BAO GỒM phí vận chuyển ban đầu; các lần sau CHỈ gồm giá trị mặt hàng trả.

8.4. KHI admin nhập số tiền không hợp lệ (≤ 0, không phải số nguyên), THÌ hệ thống KHÔNG ghi nhận và HIỂN THỊ lỗi xác thực.

8.5. KHI admin ghi nhận hoàn tiền trên yêu cầu không ở trạng thái "đã nhận hàng", THÌ hệ thống TRẢ lỗi kinh doanh với thông báo tiếng Việt.

### Requirement 9 — Cập nhật trạng thái đơn hàng khi hoàn tiền

**User Story:** Với vai trò người bán, tôi muốn đơn chuyển sang "trả hàng" ngay khi có hoàn tiền đầu tiên, để tab "Trả hàng" phản ánh đúng các đơn đã phát sinh trả hàng.

#### Acceptance Criteria

9.1. KHI lần hoàn tiền đầu tiên của đơn được ghi nhận, THÌ hệ thống CHUYỂN đơn sang trạng thái `returned`.

9.2. KHI đơn đã ở `returned` mà có thêm yêu cầu trả hàng khác hoàn tất, THÌ trạng thái đơn GIỮ NGUYÊN là `returned`.

9.3. KHI đơn đã chuyển sang `returned`, THÌ tab "Trả hàng" trong Lịch sử mua hàng HIỂN THỊ đơn này (bucket `returns` hiện có lọc theo `returned` — hành vi giữ nguyên).

---

## Nguyên tắc bổ sung (không phải hành vi người dùng)

- Mọi endpoint `/api/v1` mới phải tuân theo Full Status Envelope hiện có; lỗi kinh doanh dùng mã đặc thù (`return_window_expired`, `return_request_exists`, `return_item_limit_exceeded`, ...) với thông báo tiếng Việt.
- Toàn bộ số tiền dùng VND dạng chuỗi số nguyên (MoneyVND) như giỏ hàng/đơn hàng hiện tại.
- Thay đổi schema phải qua migration đánh số mới (`000010+`) trong `backend/db/migrations/` kèm cặp down; chạy `make db-up` rồi `make gen` (sqlc). Thay đổi Wire providers phải regenerate `wire_gen.go`.
- Hoàn kho tái sử dụng cơ chế khôi phục tồn kho hiện có của luồng hủy đơn; không tự viết logic trừ/cộng kho song song.
- Hành vi hiện có bị ảnh hưởng: không có. Luồng đặt hàng/hủy đơn và bucket lọc hiện tại giữ nguyên; tính năng chỉ đọc thêm dữ liệu trả hàng và chuyển `orders.status` sang `returned` (giá trị đã nằm trong CHECK constraint từ migration 000009).
