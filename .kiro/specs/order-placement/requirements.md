# Requirements Document

## Introduction

Xây dựng tính năng **đặt hàng (checkout/order placement)** cho người dùng đã đăng nhập trên cửa hàng (storefront). Người dùng chọn các sản phẩm từ giỏ hàng (kèm số lượng), đi đến trang xem trước đơn hàng để chọn địa chỉ giao hàng và xem tổng tiền cùng các khoản phí, sau đó đặt hàng với phương thức thanh toán **COD** (chỉ duy nhất một phương thức). Sau khi tạo, đơn hàng ở trạng thái chờ xác nhận và có thể bị hủy trong **30 phút đầu**; hết 30 phút đơn hàng **tự động được xác nhận** để người bán chuẩn bị hàng.

Trang xem trước đơn hàng đóng vai trò là "bản xem trước" của đơn hàng sắp tạo. Hệ thống phải đảm bảo đơn hàng được tạo **khớp hoàn toàn** với nội dung người dùng đã xem trước; nếu sản phẩm thay đổi (đổi tên, đổi giá) giữa lúc xem trước và lúc đặt hàng, hệ thống sẽ thông báo để người dùng tải lại dữ liệu mới.

Phạm vi: phía khách hàng (storefront) và backend API. Không bao gồm quản lý đơn hàng phía người bán (admin) — xử lý riêng trong một feature sau.

## Quyết định sản phẩm (đã được chủ sở hữu sản phẩm phê duyệt)

- **Sổ địa chỉ:** người dùng có thể tạo/sửa/xóa nhiều địa chỉ giao hàng, đặt một địa chỉ mặc định, và chọn địa chỉ khi đặt hàng. Việc quản lý địa chỉ được tích hợp ngay tại khu vực địa chỉ của trang xem trước đơn hàng.
- **Dữ liệu đơn vị hành chính:** bộ dữ liệu tỉnh/phường-xã của Việt Nam sau sáp nhập năm 2025 (**2 cấp**: tỉnh/thành phố → phường/xã) được nhúng vào backend và cung cấp qua endpoint để phục vụ dropdown. Nguồn dữ liệu: `https://provinces.open-api.vn/api/v2` (schema 2 cấp).
- **Phí vận chuyển:** phí cố định, được cấu hình tại backend; hiển thị như một dòng phí trong phần tổng tiền của giỏ hàng, trang xem trước và đơn hàng (thay thế dòng "Phí vận chuyển: Miễn phí" hiện có).
- **Xử lý tồn kho:** giảm tồn kho ngay khi tạo đơn hàng (đặt chỗ); khôi phục tồn kho khi đơn chuyển sang trạng thái "đã hủy" (hủy ngay). Trạng thái "chờ duyệt hủy" KHÔNG khôi phục tồn kho.
- **Hủy đơn:**
  - Trạng thái "chờ xác nhận" (trong 30 phút đầu): hủy **ngay**.
  - Trạng thái "đã xác nhận" mà **chưa chuẩn bị hàng**: hủy **ngay**.
  - Trạng thái "đang chuẩn bị hàng": người dùng bấm **"Yêu cầu hủy"**, đơn chuyển sang "chờ duyệt hủy" và chờ người bán (admin) đồng ý; **KHÔNG hoàn kho** ở bước này.
  - Trạng thái "chờ duyệt hủy": người dùng có thể **hoàn tác yêu cầu hủy**, đơn trở lại trạng thái "đang chuẩn bị hàng".
  - Trạng thái "đã giao cho đơn vị vận chuyển" hoặc "đã hủy": không thể hủy.
  - Việc đánh dấu "đang chuẩn bị hàng", duyệt/từ chối yêu cầu hủy và chuyển sang "đã giao vận chuyển" (phía admin/người bán) **ngoài phạm vi** feature này — feature admin tương lai.
- **Trạng thái đơn hàng:** `chờ xác nhận` (pending_confirmation) → `đã xác nhận` (confirmed) → `đang chuẩn bị hàng` (preparing) → `đã giao cho đơn vị vận chuyển` (shipped) → `đã giao` (delivered); các nhánh `đã hủy` (cancelled), `chờ duyệt hủy` (cancel_requested), `trả hàng` (returned). Các chuyển tiếp thuộc feature này: tạo → `chờ xác nhận`; `chờ xác nhận` → `đã xác nhận` (tự động sau 30 phút); `chờ xác nhận`/`đã xác nhận` → `đã hủy` (hủy ngay); `đang chuẩn bị hàng` → `chờ duyệt hủy` (yêu cầu hủy); `chờ duyệt hủy` → `đang chuẩn bị hàng` (hoàn tác yêu cầu hủy). Các chuyển tiếp còn lại (`đã xác nhận` → `đang chuẩn bị hàng`, `đang chuẩn bị hàng` → `đã giao cho đơn vị vận chuyển`, `đã giao cho đơn vị vận chuyển` → `đã giao`, `chờ duyệt hủy` → `đã hủy` (người bán đồng ý), `đã giao` → `trả hàng`) thuộc feature tương lai (admin/vận chuyển/trả hàng). Các trạng thái `đã giao` và `trả hàng` được mô hình hóa trong enum và giao diện, số đếm của chúng là 0 cho đến khi feature tương lai tạo ra chúng.
- **Quản lý đơn hàng của người bán (admin):** ngoài phạm vi spec này.
- **Theo dõi đơn hàng:** bao gồm trang "Lịch sử mua hàng" (danh sách có tab theo trạng thái + thống kê) và trang chi tiết đơn hàng.

---

## Requirements

### Requirement 1 — Khởi tạo thanh toán từ giỏ hàng

**User Story:** Với vai trò khách hàng đã đăng nhập, tôi muốn chọn các sản phẩm trong giỏ hàng kèm số lượng rồi nhấn nút thanh toán, để chuyển đến trang xem trước đơn hàng.

#### Acceptance Criteria

1.1. KHI người dùng đã đăng nhập và đang ở trang giỏ hàng, VÀ có ít nhất một sản phẩm được chọn (`selected`), THÌ hệ thống HIỂN THỊ nút "Tiến hành mua hàng" ở trạng thái khả dụng.

1.2. KHI người dùng nhấn nút "Tiến hành mua hàng", THÌ hệ thống CHUYỂN đến trang xem trước đơn hàng.

1.3. KHI người dùng chưa đăng nhập và truy cập trang xem trước đơn hàng, THÌ hệ thống CHUYỂN đến trang đăng nhập và QUAY LẠI trang xem trước sau khi đăng nhập thành công (theo mẫu `?redirect=` hiện có).

1.4. KHI người dùng truy cập trang xem trước đơn hàng mà không có sản phẩm nào được chọn trong giỏ hàng, THÌ hệ thống HIỂN THỊ trạng thái rỗng với hướng dẫn quay lại trang giỏ hàng.

### Requirement 2 — Sổ địa chỉ (quản lý địa chỉ giao hàng)

**User Story:** Với vai trò khách hàng, tôi muốn quản lý các địa chỉ giao hàng (tạo, sửa, xóa, đặt mặc định) để chọn nhanh khi đặt hàng.

#### Acceptance Criteria

2.1. KHI người dùng đã đăng nhập mở khu vực địa chỉ tại trang xem trước đơn hàng, THÌ hệ thống CHO PHÉP tạo địa chỉ mới gồm các trường: tên người nhận, số điện thoại, tỉnh/thành phố (chọn từ dropdown), phường/xã (chọn từ dropdown phụ thuộc tỉnh đã chọn), và địa chỉ chi tiết (số nhà, đường, ...).

2.2. KHI dropdown tỉnh/thành phố đổi giá trị, THÌ hệ thống TẢI lại danh sách phường/xã tương ứng với tỉnh vừa chọn và XÓA lựa chọn phường/xã trước đó.

2.3. KHI người dùng tạo địa chỉ với dữ liệu không hợp lệ (thiếu trường bắt buộc, số điện thoại sai định dạng), THÌ hệ thống KHÔNG lưu và HIỂN THỊ lỗi xác thực tại trường tương ứng.

2.4. KHI người dùng tạo địa chỉ đầu tiên, THÌ hệ thống TỰ ĐỘNG đặt địa chỉ này làm địa chỉ mặc định.

2.5. KHI người dùng đặt một địa chỉ làm mặc định, THÌ hệ thống CHỈ GIỮ đúng một địa chỉ mặc định tại một thời điểm (các địa chỉ khác bị bỏ mặc định).

2.6. KHI người dùng xóa địa chỉ mặc định, THÌ hệ thống KHÔNG còn địa chỉ mặc định (không tự động thăng cấp) và người dùng PHẢI chọn địa chỉ khi đặt hàng.

2.7. KHI người dùng xóa một địa chỉ đang được sử dụng trong một đơn hàng đã tạo, THÌ hệ thống KHÔNG làm thay đổi thông tin địa chỉ của đơn hàng đó (đơn hàng lưu ảnh chụp địa chỉ riêng).

### Requirement 3 — Dữ liệu đơn vị hành chính (tỉnh/phường-xã)

**User Story:** Với vai trò khách hàng, tôi muốn chọn tỉnh/thành phố và phường/xã từ danh sách chuẩn để địa chỉ giao hàng chính xác.

#### Acceptance Criteria

3.1. KHI trang xem trước đơn hàng cần hiển thị dropdown tỉnh/thành phố, THÌ hệ thống CUNG CẤP danh sách tỉnh/thành phố (34 đơn vị sau sáp nhập 2025) từ dữ liệu được nhúng trong backend.

3.2. KHI người dùng chọn một tỉnh/thành phố, THÌ hệ thống CUNG CẤP danh sách phường/xã thuộc tỉnh đó.

3.3. KHI dữ liệu đơn vị hành chính chưa tải xong, THÌ hệ thống HIỂN THỊ trạng thái đang tải cho dropdown tương ứng.

3.4. KHI tải danh sách tỉnh hoặc phường/xã thất bại, THÌ hệ thống HIỂN THỊ thông báo lỗi và cho phép thử lại.

### Requirement 4 — Trang xem trước đơn hàng

**User Story:** Với vai trò khách hàng, tôi muốn xem trước đơn hàng của mình (sản phẩm kèm giá, địa chỉ, tổng tiền, các khoản phí) trước khi đặt hàng, để chắc chắn đơn hàng sắp tạo đúng như tôi mong muốn.

#### Acceptance Criteria

4.1. KHI trang xem trước đơn hàng được tải, THÌ hệ thống HIỂN THỊ danh sách các sản phẩm đang được chọn trong giỏ hàng, mỗi sản phẩm gồm: tên sản phẩm, hình ảnh, thông tin tùy chọn (options), giá đơn vị, số lượng, thành tiền, và trạng thái tồn kho.

4.2. KHI trang xem trước đơn hàng được tải, THÌ hệ thống HIỂN THỊ phần tổng tiền gồm: tạm tính (tổng thành tiền của các dòng được chọn), phí vận chuyển (giá trị cấu hình tại backend) và tổng thanh toán.

4.3. KHI trang xem trước đơn hàng được tải, THÌ hệ thống HIỂN THỊ phương thức thanh toán COD như là phương thức duy nhất và được chọn sẵn.

4.4. KHI trang xem trước đơn hàng được tải, THÌ hệ thống HIỂN THỊ danh sách địa chỉ đã lưu của người dùng để chọn; địa chỉ mặc định được chọn sẵn nếu có.

4.5. KHI người dùng chưa chọn địa chỉ giao hàng và nhấn "Đặt hàng", THÌ hệ thống KHÔNG tạo đơn hàng và HIỂN THỊ thông báo yêu cầu chọn địa chỉ.

4.6. KHI dữ liệu giỏ hàng thay đổi trong lúc người dùng đang ở trang xem trước, THÌ hệ thống sử dụng dữ liệu giỏ hàng mới nhất làm nguồn hiển thị tại thời điểm tải trang / tải lại.

### Requirement 5 — Tạo đơn hàng phải khớp với nội dung xem trước

**User Story:** Với vai trò khách hàng, tôi muốn hệ thống đảm bảo đơn hàng được tạo giống hệt nội dung tôi đã xem trước, để không bị bất ngờ về giá/tên sản phẩm khi đơn được tạo.

#### Acceptance Criteria

5.1. KHI người dùng nhấn "Đặt hàng", THÌ yêu cầu tạo đơn hàng BAO GỒM cho mỗi dòng sản phẩm: định danh biến thể, số lượng, tên sản phẩm và giá đơn vị như đã hiển thị ở trang xem trước.

5.2. KHI thông tin sản phẩm trong cơ sở dữ liệu (tên hoặc giá đơn vị) KHÁC với thông tin người dùng đã xem trước ở thời điểm tạo đơn, THÌ hệ thống KHÔNG tạo đơn hàng, TRẢ về lỗi kinh doanh với mã lỗi đặc thù và thông báo tiếng Việt nêu rõ (các) sản phẩm vừa được cập nhật.

5.3. KHI nhận được lỗi "sản phẩm vừa được cập nhật" từ yêu cầu đặt hàng, THÌ hệ thống HIỂN THỊ thông báo "Sản phẩm X vừa được cập nhật" kèm modal với hai lựa chọn: **Tải lại** (tải lại dữ liệu giỏ hàng/trang xem trước với thông tin mới) hoặc **Thoát** (quay lại trang giỏ hàng).

5.4. KHI người dùng chọn "Tải lại", THÌ hệ thống TẢI LẠI dữ liệu giỏ hàng mới nhất và HIỂN THỊ lại trang xem trước với thông tin đã cập nhật; người dùng phải xem xét và đặt hàng lại.

5.5. KHI người dùng chọn "Thoát", THÌ hệ thống CHUYỂN về trang giỏ hàng.

5.6. KHI một sản phẩm được chọn bị hết hàng (tồn kho không đủ) tại thời điểm tạo đơn, THÌ hệ thống KHÔNG tạo đơn hàng và TRẢ về lỗi kinh doanh `out_of_stock`/`stock_limit` (mã lỗi đã tồn tại) với thông báo tiếng Việt.

### Requirement 6 — Tạo đơn hàng thành công

**User Story:** Với vai trò khách hàng, tôi muốn đặt hàng với COD để người bán chuẩn bị hàng và giao đến địa chỉ của tôi.

#### Acceptance Criteria

6.1. KHI yêu cầu tạo đơn hàng hợp lệ (khớp thông tin sản phẩm, đủ tồn kho, đã chọn địa chỉ), THÌ hệ thống TẠO đơn hàng với trạng thái "chờ xác nhận", phương thức thanh toán COD, và LƯU các dòng đơn hàng (tên sản phẩm, hình ảnh, tùy chọn, giá đơn vị, số lượng, thành tiền) dưới dạng ảnh chụp (snapshot) tại thời điểm tạo.

6.2. KHI tạo đơn hàng thành công, THÌ hệ thống LƯU ảnh chụp thông tin giao hàng kèm đơn: tên người nhận, số điện thoại, tỉnh/thành phố, phường/xã, địa chỉ chi tiết.

6.3. KHI tạo đơn hàng thành công, THÌ hệ thống LƯU phí vận chuyển (giá trị cấu hình tại backend) và tổng thanh toán của đơn hàng.

6.4. KHI tạo đơn hàng thành công, THÌ hệ thống GIẢM tồn kho của từng biến thể tương ứng với số lượng đặt hàng.

6.5. KHI tạo đơn hàng thành công, THÌ hệ thống XÓA các dòng sản phẩm đã đặt khỏi giỏ hàng của người dùng (chỉ các dòng đã chọn); các dòng chưa chọn được giữ nguyên.

6.6. KHI tạo đơn hàng thành công, THÌ hệ thống TRẢ về đơn hàng đã tạo và CHUYỂN người dùng đến trang chi tiết đơn hàng.

6.7. KHI có nhiều yêu cầu đặt hàng đồng thời cho cùng một sản phẩm có tồn kho giới hạn, THÌ hệ thống ĐẢM BẢO tồn kho chỉ được trừ một lần theo thứ tự xử lý và đơn hàng không thể được tạo khi tồn kho đã cạn (không bán quá số tồn kho).

6.8. KHI toàn bộ quá trình tạo đơn hàng (tạo đơn, trừ kho, xóa dòng giỏ hàng) không thể hoàn tất, THÌ hệ thống KHÔNG tạo đơn hàng và KHÔNG thay đổi tồn kho hay giỏ hàng (toàn vẹn giao dịch).

### Requirement 7 — Hủy đơn hàng (hủy ngay hoặc yêu cầu hủy)

**User Story:** Với vai trò khách hàng, tôi muốn hủy ngay đơn hàng khi chưa chuẩn bị hàng, hoặc gửi yêu cầu hủy khi đơn đang được chuẩn bị, để rút lại quyết định mua hàng kịp thời.

#### Acceptance Criteria

7.1. KHI người dùng xem đơn hàng của chính mình ở trạng thái "chờ xác nhận" (trong vòng 30 phút từ lúc tạo), THÌ hệ thống HIỂN THỊ nút "Hủy đơn" khả dụng (hủy ngay).

7.2. KHI người dùng xem đơn hàng của chính mình ở trạng thái "đã xác nhận" VÀ đơn CHƯA bắt đầu chuẩn bị hàng, THÌ hệ thống HIỂN THỊ nút "Hủy đơn" khả dụng (hủy ngay).

7.3. KHI người dùng nhấn "Hủy đơn" trong các trường hợp 7.1 hoặc 7.2, THÌ hệ thống CHUYỂN đơn hàng sang trạng thái "đã hủy", KHÔI PHỤC tồn kho đã trừ khi tạo đơn, và KHÔNG cho phép hủy lại lần nữa.

7.4. KHI người dùng xem đơn hàng của chính mình ở trạng thái "đang chuẩn bị hàng", THÌ hệ thống HIỂN THỊ nút "Yêu cầu hủy".

7.5. KHI người dùng nhấn "Yêu cầu hủy" ở trạng thái "đang chuẩn bị hàng", THÌ hệ thống CHUYỂN đơn hàng sang trạng thái "chờ duyệt hủy" và HIỂN THỊ thông báo đơn đang chờ người bán xác nhận hủy; KHÔNG khôi phục tồn kho ở bước này.

7.6. KHI đơn hàng ở trạng thái "chờ duyệt hủy", THÌ hệ thống KHÔNG cho phép người dùng hủy lại hoặc gửi yêu cầu hủy lần nữa.

7.7. KHI người dùng xem đơn hàng của chính mình ở trạng thái "chờ duyệt hủy", THÌ hệ thống HIỂN THỊ nút "Hoàn tác yêu cầu hủy".

7.8. KHI người dùng nhấn "Hoàn tác yêu cầu hủy", THÌ hệ thống CHUYỂN đơn hàng trở lại trạng thái "đang chuẩn bị hàng" (yêu cầu hủy bị rút lại; không thay đổi tồn kho).

7.9. KHI người dùng cố hủy đơn hàng ở trạng thái "đã giao cho đơn vị vận chuyển" hoặc "đã hủy", THÌ hệ thống KHÔNG hủy đơn và TRẢ về lỗi kinh doanh với thông báo tiếng Việt.

7.10. KHI người dùng cố hủy đơn hàng không thuộc về mình, THÌ hệ thống TỪ CHỐI thao tác (lỗi 403/404) và KHÔNG tiết lộ thông tin đơn hàng.

### Requirement 8 — Tự động xác nhận đơn hàng sau 30 phút

**User Story:** Với vai trò người bán, tôi muốn đơn hàng được tự động xác nhận sau 30 phút để bắt đầu chuẩn bị hàng mà không cần thao tác thủ công.

#### Acceptance Criteria

8.1. KHI một đơn hàng ở trạng thái "chờ xác nhận" đã tồn tại đủ 30 phút kể từ thời điểm tạo, THÌ hệ thống TỰ ĐỘNG CHUYỂN đơn hàng sang trạng thái "đã xác nhận".

8.2. KHI một đơn hàng ở trạng thái "đã xác nhận" VÀ CHƯA bắt đầu chuẩn bị hàng, THÌ người dùng VẪN được hủy ngay đơn hàng.

8.3. KHI một đơn hàng ở trạng thái "đang chuẩn bị hàng", THÌ việc hủy đơn PHẢI qua người bán đồng ý (người dùng gửi "Yêu cầu hủy" và đơn chuyển sang "chờ duyệt hủy").

8.4. KHI một đơn hàng đã được giao cho đơn vị vận chuyển, THÌ người dùng KHÔNG CÒN được phép hủy đơn.

8.5. KHI một đơn hàng đã bị hủy, THÌ hệ thống KHÔNG xác nhận tự động đơn hàng đó.

### Requirement 9 — Xem chi tiết đơn hàng

**User Story:** Với vai trò khách hàng, tôi muốn xem chi tiết đơn hàng sau khi đặt (sản phẩm, địa chỉ, tổng tiền, trạng thái, thời gian) để theo dõi đơn hàng của mình.

#### Acceptance Criteria

9.1. KHI người dùng mở trang chi tiết đơn hàng của chính mình, THÌ hệ thống HIỂN THỊ: mã đơn hàng, trạng thái, thời gian tạo, phương thức thanh toán COD, thông tin giao hàng, danh sách sản phẩm (tên, tùy chọn, giá đơn vị, số lượng, thành tiền), tạm tính, phí vận chuyển và tổng thanh toán.

9.2. KHI người dùng mở đơn hàng không thuộc về mình, THÌ hệ thống TỪ CHỐI truy cập và KHÔNG tiết lộ nội dung đơn hàng.

9.3. KHI người dùng truy cập đơn hàng không tồn tại, THÌ hệ thống HIỂN THỊ trạng thái không tìm thấy.

9.4. KHI trạng thái đơn hàng là "chờ xác nhận", THÌ hệ thống HIỂN THỊ thời gian còn lại để có thể hủy đơn (trong cửa sổ 30 phút).

9.5. KHI trạng thái đơn hàng là "đã xác nhận" (chưa chuẩn bị hàng), THÌ hệ thống HIỂN THỊ trạng thái đơn có thể hủy ngay.

9.6. KHI trạng thái đơn hàng là "đang chuẩn bị hàng", THÌ hệ thống HIỂN THỊ trạng thái đơn đang được chuẩn bị và nút "Yêu cầu hủy".

9.7. KHI trạng thái đơn hàng là "chờ duyệt hủy", THÌ hệ thống HIỂN THỊ trạng thái đơn đang chờ người bán xác nhận hủy.

### Requirement 10 — Trang "Lịch sử mua hàng" (Đơn hàng của tôi)

**User Story:** Với vai trò khách hàng, tôi muốn xem danh sách các đơn hàng đã đặt theo trạng thái và thống kê số lượng từng trạng thái, để theo dõi và mở chi tiết khi cần.

#### Acceptance Criteria

10.1. KHI người dùng mở trang "Lịch sử mua hàng", THÌ hệ thống HIỂN THỊ các tab: Tất cả, Chờ xác nhận, Chờ lấy hàng, Chờ giao hàng, Đã giao, Trả hàng, Đã hủy; tab "Tất cả" được chọn mặc định.

10.2. KHI người dùng chọn một tab, THÌ hệ thống HIỂN THỊ danh sách đơn hàng thuộc nhóm trạng thái tương ứng: "Chờ xác nhận" = trạng thái "chờ xác nhận"; "Chờ lấy hàng" = trạng thái "đã xác nhận", "đang chuẩn bị hàng" hoặc "chờ duyệt hủy"; "Chờ giao hàng" = trạng thái "đã giao cho đơn vị vận chuyển"; "Đã giao" = trạng thái "đã giao"; "Trả hàng" = trạng thái "trả hàng"; "Đã hủy" = trạng thái "đã hủy"; "Tất cả" = mọi trạng thái.

10.3. KHI danh sách đơn hàng được hiển thị, THÌ mỗi đơn gồm: mã đơn hàng, thời gian tạo, trạng thái, tổng thanh toán; sắp xếp theo thời gian tạo mới nhất trước.

10.4. KHI người dùng mở trang "Lịch sử mua hàng", THÌ hệ thống HIỂN THỊ thống kê gồm: chờ xác nhận (x), chờ lấy hàng (y), chờ giao hàng (z), chờ đánh giá (t) — lần lượt là số đơn ở trạng thái "chờ xác nhận", số đơn ở trạng thái "đã xác nhận", "đang chuẩn bị hàng" hoặc "chờ duyệt hủy", số đơn ở trạng thái "đã giao cho đơn vị vận chuyển", số đơn ở trạng thái "đã giao".

10.5. KHI người dùng chọn một đơn hàng trong danh sách, THÌ hệ thống CHUYỂN đến trang chi tiết đơn hàng đó.

10.6. KHI người dùng không có đơn hàng nào trong nhóm tab đang xem, THÌ hệ thống HIỂN THỊ trạng thái rỗng với hướng dẫn mua hàng.

> Ghi chú: chỉ số "chờ đánh giá" hiện tại tính bằng số đơn ở trạng thái "đã giao" (chưa có hệ thống đánh giá; khi feature đánh giá ra mắt, số này sẽ loại trừ các đơn đã được đánh giá).

---

## Nguyên tắc bổ sung (không phải hành vi người dùng)

- Mọi lỗi kinh doanh hiển thị cho người dùng PHẢI bằng tiếng Việt (theo chuẩn API hiện có).
- Mọi endpoint `/api/v1` mới phải tuân theo Full Status Envelope hiện có.
- Tất cả đơn vị tiền tệ dùng VND dạng chuỗi số nguyên (MoneyVND) như giỏ hàng hiện tại.
- Hành vi hiện có bị ảnh hưởng: dòng "Phí vận chuyển: Miễn phí" hiển thị cứng trên trang giỏ hàng được thay bằng giá trị phí vận chuyển cấu hình (có thể là 0), hiển thị nhất quán với trang xem trước và đơn hàng.