# Tài liệu yêu cầu

## Giới thiệu

Trang tổng quan (Dashboard) của ứng dụng quản trị AuraPhone (`frontend-admin`, đường dẫn `/`) hiện chỉ hiển thị nội dung giữ chỗ, không có số liệu kinh doanh. Tính năng này thay nội dung giữ chỗ bằng bảng điều khiển số liệu thật, giúp quản trị viên ngay khi đăng nhập nắm được: doanh thu trong kỳ, tình hình đơn hàng, các việc đang chờ xử lý (đơn hàng, đổi trả, đánh giá, tin nhắn), sản phẩm bán chạy và biến thể sắp hết hàng; đồng thời đi thẳng tới trang quản trị tương ứng để xử lý.

Người dùng bị ảnh hưởng: quản trị viên (tài khoản có vai trò `admin`). Khách hàng không bị ảnh hưởng.

Quy ước dùng chung cho toàn bộ tài liệu:

- **Múi giờ báo cáo:** mọi ranh giới ngày đều tính theo giờ Việt Nam (UTC+7). "Hôm nay" bắt đầu lúc 00:00 giờ Việt Nam của ngày hiện tại.
- **Kỳ báo cáo:** một trong ba lựa chọn: "Hôm nay" (từ 00:00 hôm nay đến hiện tại), "7 ngày" (6 ngày trước cộng hôm nay), "30 ngày" (29 ngày trước cộng hôm nay). Mặc định là "7 ngày".
- **Đơn đã giao:** đơn hàng có thời điểm giao hàng (`delivered_at`) và trạng thái hiện tại thuộc `delivered`, `partially_returned` hoặc `returned`.
- **Đơn không bị hủy:** đơn hàng có trạng thái hiện tại khác `cancelled`.
- **Tiền tệ:** mọi số tiền là số nguyên VND, hiển thị theo định dạng tiếng Việt có dấu phân cách hàng nghìn và hậu tố "₫".

## Yêu cầu

### Yêu cầu 1: Truy cập trang tổng quan

**User Story:** Là quản trị viên, tôi muốn trang đầu tiên sau khi đăng nhập là trang tổng quan có số liệu thật, để nắm tình hình cửa hàng ngay lập tức.

#### Tiêu chí chấp nhận

1.1. WHEN quản trị viên đã đăng nhập truy cập `/` trong ứng dụng quản trị THEN hệ thống SHALL hiển thị trang tổng quan gồm các khu vực: bộ chọn kỳ báo cáo, chỉ số doanh thu, biểu đồ doanh thu theo ngày, thống kê đơn hàng, việc cần xử lý, sản phẩm bán chạy và biến thể sắp hết hàng.

1.2. WHEN trang tổng quan hiển thị THEN hệ thống SHALL không còn hiển thị các nội dung giữ chỗ hiện có ("Sẵn sàng", "Online", nút đếm "Làm mới dữ liệu" theo số lần nhấn).

1.3. IF người dùng chưa đăng nhập truy cập `/` THEN hệ thống SHALL giữ hành vi chuyển hướng tới trang đăng nhập quản trị hiện có.

1.4. IF lời gọi API dữ liệu tổng quan không kèm phiên đăng nhập hợp lệ THEN hệ thống SHALL trả về HTTP 401; IF người gọi đã đăng nhập nhưng không có vai trò `admin` THEN hệ thống SHALL trả về HTTP 403. Cả hai trường hợp đều không trả về bất kỳ số liệu nào.

### Yêu cầu 2: Chọn kỳ báo cáo và làm mới dữ liệu

**User Story:** Là quản trị viên, tôi muốn chọn khoảng thời gian thống kê và làm mới số liệu, để so sánh tình hình theo ngày, tuần, tháng.

#### Tiêu chí chấp nhận

2.1. WHEN trang tổng quan tải lần đầu THEN hệ thống SHALL chọn kỳ "7 ngày" và hiển thị số liệu của kỳ đó.

2.2. WHEN quản trị viên chọn một kỳ báo cáo khác ("Hôm nay", "7 ngày", "30 ngày") THEN hệ thống SHALL cập nhật mọi số liệu phụ thuộc kỳ (Yêu cầu 3, 4, 5.1 và 7) theo kỳ mới mà không tải lại toàn bộ trang; các số liệu không phụ thuộc kỳ (Yêu cầu 5.2, 6 và 8) giữ nguyên ý nghĩa.

2.3. WHEN quản trị viên tải lại trình duyệt hoặc chia sẻ đường dẫn sau khi chọn kỳ THEN hệ thống SHALL khôi phục đúng kỳ đã chọn từ địa chỉ trang.

2.4. IF địa chỉ trang hoặc lời gọi API chứa giá trị kỳ báo cáo không thuộc ba giá trị hợp lệ THEN giao diện SHALL dùng kỳ mặc định "7 ngày", và API SHALL trả về HTTP 400 với `error.code` = `invalid_filter` và `error.fields` chỉ ra tham số kỳ không hợp lệ.

2.5. WHEN trang tổng quan hiển thị số liệu THEN hệ thống SHALL hiển thị thời điểm số liệu được tính (giờ Việt Nam, định dạng `HH:mm dd/MM/yyyy`) và một nút "Làm mới"; WHEN quản trị viên nhấn "Làm mới" THEN hệ thống SHALL tải lại toàn bộ số liệu của kỳ đang chọn và cập nhật thời điểm tính.

2.6. Số liệu SHALL không tự cập nhật theo thời gian thực; số liệu chỉ thay đổi khi tải trang, đổi kỳ hoặc nhấn "Làm mới".

### Yêu cầu 3: Chỉ số doanh thu

**User Story:** Là quản trị viên, tôi muốn biết doanh thu thực nhận trong kỳ sau khi trừ hoàn tiền, để đánh giá hiệu quả bán hàng.

#### Tiêu chí chấp nhận

3.1. WHEN trang tổng quan hiển thị một kỳ THEN hệ thống SHALL hiển thị "Doanh thu đã giao" bằng tổng `total_vnd` (bao gồm phí vận chuyển) của các đơn đã giao có `delivered_at` nằm trong kỳ.

3.2. WHEN trang tổng quan hiển thị một kỳ THEN hệ thống SHALL hiển thị "Đã hoàn tiền" bằng tổng số tiền hoàn thực tế của các yêu cầu đổi trả ở trạng thái `refunded` có thời điểm hoàn tiền nằm trong kỳ.

3.3. WHEN trang tổng quan hiển thị một kỳ THEN hệ thống SHALL hiển thị "Doanh thu thuần" bằng "Doanh thu đã giao" trừ "Đã hoàn tiền" của cùng kỳ; giá trị này có thể âm và SHALL được hiển thị kèm dấu trừ khi âm.

3.4. WHEN trang tổng quan hiển thị một kỳ THEN hệ thống SHALL hiển thị "Số đơn đã giao" (số đơn đã giao có `delivered_at` trong kỳ) và "Giá trị đơn trung bình" bằng "Doanh thu đã giao" chia "Số đơn đã giao", làm tròn xuống tới đồng; IF "Số đơn đã giao" bằng 0 THEN "Giá trị đơn trung bình" SHALL hiển thị là 0 ₫.

3.5. IF đơn hàng ở trạng thái `pending_confirmation`, `confirmed`, `preparing`, `shipped`, `cancel_requested` hoặc `cancelled` THEN đơn đó SHALL không được tính vào bất kỳ chỉ số nào của Yêu cầu 3.

### Yêu cầu 4: Biểu đồ doanh thu theo ngày

**User Story:** Là quản trị viên, tôi muốn xem doanh thu thuần theo từng ngày trong kỳ, để nhận ra ngày bán tốt hoặc bất thường.

#### Tiêu chí chấp nhận

4.1. WHEN kỳ đang chọn là "7 ngày" hoặc "30 ngày" THEN hệ thống SHALL hiển thị biểu đồ có đúng 7 hoặc 30 điểm theo thứ tự ngày tăng dần, mỗi điểm là một ngày giờ Việt Nam, gồm doanh thu đã giao, số tiền đã hoàn và doanh thu thuần của ngày đó theo cùng định nghĩa của Yêu cầu 3.

4.2. IF một ngày trong kỳ không phát sinh doanh thu và hoàn tiền THEN biểu đồ SHALL vẫn có điểm của ngày đó với giá trị 0.

4.3. WHEN kỳ đang chọn là "Hôm nay" THEN hệ thống SHALL hiển thị biểu đồ một điểm duy nhất cho ngày hôm nay.

4.4. WHEN quản trị viên trỏ chuột, chạm hoặc focus bàn phím vào một điểm của biểu đồ THEN hệ thống SHALL hiển thị ngày (`dd/MM`), doanh thu đã giao, đã hoàn tiền và doanh thu thuần của điểm đó.

4.5. Tổng doanh thu thuần của mọi điểm trong biểu đồ SHALL bằng "Doanh thu thuần" của Yêu cầu 3.3 cho cùng kỳ.

### Yêu cầu 5: Thống kê đơn hàng

**User Story:** Là quản trị viên, tôi muốn biết số đơn mới trong kỳ và phân bố đơn theo trạng thái hiện tại, để biết khối lượng công việc vận hành.

#### Tiêu chí chấp nhận

5.1. WHEN trang tổng quan hiển thị một kỳ THEN hệ thống SHALL hiển thị "Đơn mới" bằng số đơn hàng có thời điểm tạo nằm trong kỳ (mọi trạng thái), và "Đơn bị hủy" bằng số đơn trong nhóm đó hiện có trạng thái `cancelled`.

5.2. WHEN trang tổng quan hiển thị THEN hệ thống SHALL hiển thị số lượng đơn hàng theo từng trạng thái hiện tại trên toàn bộ dữ liệu (không phụ thuộc kỳ) cho đủ 9 trạng thái: `pending_confirmation`, `confirmed`, `preparing`, `shipped`, `delivered`, `cancel_requested`, `cancelled`, `partially_returned`, `returned`, dùng nhãn tiếng Việt giống trang quản lý đơn hàng hiện có; trạng thái có 0 đơn vẫn được hiển thị.

5.3. WHEN quản trị viên nhấn vào một trạng thái trong thống kê 5.2 THEN hệ thống SHALL chuyển tới trang quản lý đơn hàng đã lọc sẵn theo trạng thái đó (`/orders?status=<trạng thái>`).

### Yêu cầu 6: Việc cần xử lý

**User Story:** Là quản trị viên, tôi muốn thấy ngay số việc đang chờ mình xử lý và đi thẳng tới danh sách tương ứng, để không bỏ sót khách hàng.

#### Tiêu chí chấp nhận

6.1. WHEN trang tổng quan hiển thị THEN hệ thống SHALL hiển thị các mục việc cần xử lý sau, mỗi mục là số lượng hiện tại trên toàn bộ dữ liệu (không phụ thuộc kỳ):

| Mục | Định nghĩa | Đích điều hướng |
|---|---|---|
| Đơn chờ xác nhận | Đơn hàng trạng thái `pending_confirmation` | `/orders?status=pending_confirmation` |
| Yêu cầu hủy đơn | Đơn hàng trạng thái `cancel_requested` | `/orders?status=cancel_requested` |
| Đổi trả chờ duyệt | Yêu cầu đổi trả trạng thái `pending_approval` | `/returns?status=pending_approval` |
| Đổi trả chờ hoàn tiền | Yêu cầu đổi trả trạng thái `received` | `/returns?status=received` |
| Đánh giá chưa phản hồi | Đánh giá sản phẩm chưa có phản hồi của quản trị viên | `/reviews?has_reply=no` |
| Hội thoại chưa đọc | Hội thoại hỗ trợ có tin nhắn khách hàng mà quản trị viên chưa đọc | `/chat?filter=unread` |

6.2. WHEN quản trị viên nhấn một mục việc cần xử lý THEN hệ thống SHALL điều hướng tới đích tương ứng ở bảng 6.1 và danh sách tại trang đích SHALL hiển thị đúng bộ lọc đó ngay khi mở.

6.3. Định nghĩa "Đánh giá chưa phản hồi" và "Hội thoại chưa đọc" SHALL trùng với bộ lọc "chưa phản hồi" của trang quản lý đánh giá và bộ lọc "Chưa đọc" của trang hỗ trợ chat hiện có, để con số trên trang tổng quan khớp với số mục ở trang đích.

6.4. WHEN trang quản lý đánh giá được mở với tham số `has_reply` trên địa chỉ trang, hoặc trang hỗ trợ chat được mở với tham số `filter=unread` THEN hệ thống SHALL áp dụng bộ lọc tương ứng; WHEN quản trị viên đổi bộ lọc trên các trang này THEN địa chỉ trang SHALL được cập nhật theo; IF không có tham số THEN các trang này SHALL giữ bộ lọc mặc định như hiện tại.

6.5. IF một mục việc cần xử lý có giá trị 0 THEN hệ thống SHALL vẫn hiển thị mục đó với số 0 và trạng thái thị giác trung tính; IF giá trị lớn hơn 0 THEN mục đó SHALL được làm nổi bật để phân biệt với mục bằng 0.

### Yêu cầu 7: Sản phẩm bán chạy

**User Story:** Là quản trị viên, tôi muốn biết sản phẩm nào bán chạy nhất trong kỳ, để ưu tiên nhập hàng và quảng bá.

#### Tiêu chí chấp nhận

7.1. WHEN trang tổng quan hiển thị một kỳ THEN hệ thống SHALL hiển thị tối đa 5 sản phẩm có tổng số lượng bán cao nhất, trong đó số lượng bán của một sản phẩm là tổng số lượng các dòng hàng thuộc sản phẩm đó (cộng mọi biến thể) trong các đơn không bị hủy có thời điểm tạo nằm trong kỳ.

7.2. WHEN hiển thị từng sản phẩm bán chạy THEN hệ thống SHALL hiển thị thứ hạng, ảnh, tên sản phẩm, thương hiệu, tổng số lượng bán và tổng thành tiền các dòng hàng tương ứng.

7.3. WHEN hai sản phẩm có cùng tổng số lượng bán THEN hệ thống SHALL xếp sản phẩm có tổng thành tiền cao hơn lên trước; nếu vẫn bằng nhau thì xếp theo tên sản phẩm tăng dần.

7.4. WHEN quản trị viên nhấn vào một sản phẩm bán chạy đang bán THEN hệ thống SHALL chuyển tới trang chỉnh sửa sản phẩm đó trong ứng dụng quản trị (`/products/:id`).

7.6. IF một sản phẩm bán chạy đã ngừng bán (đã bị quản trị viên xóa) THEN hệ thống SHALL vẫn xếp hạng sản phẩm đó theo 7.1 và 7.3, hiển thị nhãn "Đã ngừng bán", và SHALL không cho nhấn hay điều hướng tới trang chỉnh sửa sản phẩm.

7.5. IF kỳ đang chọn không có dòng hàng nào thỏa 7.1 THEN hệ thống SHALL hiển thị thông báo trống "Chưa có sản phẩm nào được bán trong kỳ này".

### Yêu cầu 8: Biến thể sắp hết hàng

**User Story:** Là quản trị viên, tôi muốn thấy các biến thể đang bán mà tồn kho thấp, để kịp bổ sung hàng trước khi khách không mua được.

#### Tiêu chí chấp nhận

8.1. WHEN trang tổng quan hiển thị THEN hệ thống SHALL hiển thị tổng số biến thể đang bán (biến thể đang hoạt động) có tồn kho nhỏ hơn hoặc bằng 5, và danh sách tối đa 10 biến thể trong số đó, sắp xếp theo tồn kho tăng dần rồi theo tên sản phẩm tăng dần; số liệu này không phụ thuộc kỳ.

8.2. WHEN hiển thị từng biến thể sắp hết hàng THEN hệ thống SHALL hiển thị tên sản phẩm, các tùy chọn phân loại của biến thể (ví dụ "256GB / Titan Đen") và số lượng tồn kho; biến thể có tồn kho 0 SHALL được đánh dấu "Hết hàng".

8.3. WHEN quản trị viên nhấn vào một biến thể sắp hết hàng THEN hệ thống SHALL chuyển tới trang chỉnh sửa sản phẩm chứa biến thể đó (`/products/:id`).

8.4. IF biến thể đã ngừng hoạt động THEN biến thể đó SHALL không xuất hiện trong danh sách và không được tính vào tổng số ở 8.1.

8.5. IF không có biến thể nào thỏa 8.1 THEN hệ thống SHALL hiển thị thông báo trống "Không có biến thể nào sắp hết hàng".

### Yêu cầu 9: Trạng thái tải, lỗi và hợp đồng API

**User Story:** Là quản trị viên, tôi muốn trang tổng quan phản hồi rõ ràng khi đang tải hoặc gặp lỗi, để biết số liệu có đáng tin hay không.

#### Tiêu chí chấp nhận

9.1. WHILE số liệu đang được tải THEN hệ thống SHALL hiển thị skeleton cho từng khu vực của trang tổng quan; WHEN đổi kỳ hoặc nhấn "Làm mới" THEN hệ thống SHALL giữ số liệu cũ hiển thị cùng chỉ báo đang tải cho đến khi số liệu mới về.

9.2. IF tải số liệu thất bại THEN hệ thống SHALL hiển thị thông báo lỗi tiếng Việt kèm nút "Thử lại", và SHALL không hiển thị số 0 thay cho số liệu không tải được.

9.3. WHEN trả về dữ liệu hoặc lỗi từ API trang tổng quan THEN API SHALL tuân thủ chuẩn Full Status Envelope của `/api/v1`; lỗi hệ thống SHALL trả về HTTP 500 với `error.code` = `internal`; mọi thông báo lỗi nghiệp vụ SHALL bằng tiếng Việt.

9.4. WHEN API trang tổng quan trả dữ liệu THEN mọi số tiền và số lượng SHALL là số nguyên chính xác, không bị làm tròn hay mất độ chính xác ở phía hiển thị.

9.5. WHEN cơ sở dữ liệu chứa tới 50.000 đơn hàng và 200.000 dòng hàng THEN mỗi lần tải số liệu trang tổng quan cho bất kỳ kỳ nào SHALL hoàn tất phía máy chủ trong vòng 1 giây.

### Yêu cầu 10: Trải nghiệm và khả năng truy cập

**User Story:** Là quản trị viên dùng nhiều thiết bị, tôi muốn trang tổng quan dễ đọc trên mọi kích thước màn hình và dùng được bằng bàn phím.

#### Tiêu chí chấp nhận

10.1. WHEN trang tổng quan hiển thị trên màn hình rộng từ 320 CSS pixel trở lên THEN bố cục SHALL tự sắp xếp lại, không cuộn ngang ngoài ý muốn và không cắt mất số liệu.

10.2. WHEN quản trị viên điều hướng bằng bàn phím THEN bộ chọn kỳ, nút "Làm mới", các mục thống kê trạng thái, việc cần xử lý, sản phẩm bán chạy có thể điều hướng (7.4) và biến thể sắp hết hàng SHALL kích hoạt được bằng bàn phím với chỉ báo focus nhìn thấy rõ.

10.3. WHEN biểu đồ doanh thu hiển thị THEN hệ thống SHALL cung cấp cho trình đọc màn hình một bản tóm tắt dạng văn bản hoặc bảng của các điểm dữ liệu; màu sắc SHALL không là kênh duy nhất để phân biệt doanh thu đã giao, đã hoàn tiền và doanh thu thuần.

10.4. WHEN ứng dụng quản trị hiển thị trên màn hình rộng dưới 1024 CSS pixel THEN thanh điều hướng bên SHALL được ẩn và thanh đầu trang SHALL hiển thị nút menu; WHEN quản trị viên nhấn nút menu THEN hệ thống SHALL mở ngăn điều hướng chứa đầy đủ các mục điều hướng hiện có; WHEN quản trị viên chọn một mục, nhấn Escape hoặc nhấn ra ngoài ngăn THEN ngăn SHALL đóng lại và focus SHALL trở về nút menu; WHEN màn hình rộng từ 1024 CSS pixel trở lên THEN thanh điều hướng bên SHALL hiển thị cố định như hiện tại và không có nút menu. Thanh đầu trang và vùng nội dung SHALL không gây cuộn ngang trên màn hình rộng từ 320 CSS pixel trở lên.

## Ngoài phạm vi

- So sánh với kỳ trước, kỳ tùy chọn theo ngày bắt đầu/kết thúc và xuất báo cáo (CSV/Excel).
- Cập nhật số liệu theo thời gian thực.
- Ngưỡng tồn kho thấp do quản trị viên cấu hình.
- Thống kê khách hàng, bài viết và lượt tương tác.
