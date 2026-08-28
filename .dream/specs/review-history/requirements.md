# Tài liệu yêu cầu

## Giới thiệu

Tính năng xem lịch sử đánh giá ("Đánh giá của tôi" / "Lịch sử đánh giá") cho phép khách hàng đã đăng nhập xem lại toàn bộ các đánh giá sản phẩm mà mình đã gửi trên hệ thống AuraPhone. Khách hàng có thể theo dõi chi tiết từng đánh giá (số sao, nhận xét, ảnh/video, thông tin sản phẩm và đơn hàng liên quan), lọc theo số sao, phân trang và thực hiện chỉnh sửa đánh giá (nếu chưa từng chỉnh sửa).

Tính năng này giúp tăng cường trải nghiệm người dùng, cho phép khách hàng quản lý nội dung đóng góp của mình một cách thuận tiện và minh bạch từ tài khoản cá nhân.

## Yêu cầu

### Yêu cầu 1: Truy cập và hiển thị danh sách lịch sử đánh giá của khách hàng

**User Story:** Là khách hàng đã đăng nhập, tôi muốn xem lại toàn bộ các đánh giá sản phẩm mà tôi đã gửi, để tiện theo dõi ý kiến và hình ảnh tôi đã đóng góp.

#### Tiêu chí chấp nhận

1.1. IF người dùng chưa đăng nhập truy cập vào trang lịch sử đánh giá (`/reviews`) THEN hệ thống SHALL chuyển hướng người dùng đến trang đăng nhập (`/login?redirect=/reviews`).

1.2. WHEN khách hàng đã đăng nhập truy cập trang lịch sử đánh giá THEN hệ thống SHALL hiển thị danh sách các đánh giá do chính khách hàng đó tạo, sắp xếp mặc định theo thời gian đánh giá mới nhất trước.

1.3. WHEN hiển thị từng mục đánh giá trong danh sách THEN hệ thống SHALL hiển thị đầy đủ: thông tin sản phẩm (tên sản phẩm, ảnh đại diện sản phẩm, thương hiệu, model và các tùy chọn phân loại đã mua nếu có), mã đơn hàng và ngày đặt mua, số sao đã chấm (1 đến 5 sao), nội dung nhận xét (nếu có), danh sách ảnh và video đính kèm (nếu có), ngày đánh giá, ngày cập nhật và nhãn biểu thị đã chỉnh sửa nếu đánh giá đã từng được cập nhật.

1.4. WHEN khách hàng nhấn vào tên hoặc ảnh sản phẩm trong mục đánh giá THEN hệ thống SHALL chuyển hướng đến trang chi tiết của sản phẩm đó (`/products/:productId`).

1.5. WHEN khách hàng nhấn vào mã đơn hàng trong mục đánh giá THEN hệ thống SHALL chuyển hướng đến trang chi tiết đơn hàng tương ứng (`/orders/:orderId`).

1.6. IF khách hàng chưa từng gửi bất kỳ đánh giá nào THEN hệ thống SHALL hiển thị trạng thái trống (empty state) thông báo chưa có đánh giá nào, cùng nút điều hướng dẫn đến danh sách đơn hàng chờ đánh giá (`/orders?status=reviewable`) hoặc khám phá sản phẩm (`/products`).

### Yêu cầu 2: Bộ lọc và phân trang danh sách đánh giá

**User Story:** Là khách hàng có nhiều đánh giá, tôi muốn lọc theo số sao và duyệt theo từng trang, để nhanh chóng tìm thấy đánh giá cụ thể.

#### Tiêu chí chấp nhận

2.1. WHEN khách hàng xem trang lịch sử đánh giá THEN hệ thống SHALL cung cấp thanh bộ lọc theo số sao gồm: "Tất cả", "5 sao", "4 sao", "3 sao", "2 sao", "1 sao".

2.2. WHEN khách hàng chọn một bộ lọc số sao cụ thể THEN hệ thống SHALL chỉ hiển thị các đánh giá có số sao tương ứng và đặt lại số trang về trang đầu tiên (trang 1).

2.3. WHEN danh sách đánh giá theo điều kiện lọc có nhiều hơn 10 mục THEN hệ thống SHALL phân trang với tối đa 10 đánh giá mỗi trang, cung cấp các nút điều hướng chuyển trang (Trang trước, Trang sau, số trang hiện tại và tổng số trang).

2.4. WHEN khách hàng chuyển sang một trang khác THEN hệ thống SHALL tải và hiển thị danh sách đánh giá của trang đó.

2.5. IF bộ lọc được chọn không có đánh giá nào phù hợp THEN hệ thống SHALL hiển thị thông báo không có đánh giá nào khớp với bộ lọc đã chọn và cung cấp tùy chọn đặt lại bộ lọc về "Tất cả".

### Yêu cầu 3: Chỉnh sửa đánh giá từ trang lịch sử

**User Story:** Là khách hàng đã đánh giá, tôi muốn có thể chỉnh sửa đánh giá trực tiếp từ trang lịch sử đánh giá nếu đánh giá đó chưa từng chỉnh sửa, để cập nhật lại nhận xét hoặc hình ảnh của mình.

#### Tiêu chí chấp nhận

3.1. WHEN khách hàng xem một đánh giá trong danh sách mà đánh giá đó chưa từng được chỉnh sửa (`edit_count = 0`) THEN hệ thống SHALL hiển thị nút "Sửa đánh giá".

3.2. WHEN khách hàng nhấn nút "Sửa đánh giá" THEN hệ thống SHALL mở biểu mẫu chỉnh sửa với đầy đủ dữ liệu hiện tại của đánh giá (số sao, nhận xét, các tệp ảnh/video đã tải lên).

3.3. WHEN khách hàng gửi dữ liệu chỉnh sửa hợp lệ thành công THEN hệ thống SHALL cập nhật nội dung đánh giá, chuyển trạng thái đánh giá thành đã chỉnh sửa (`edit_count = 1`), ẩn nút "Sửa đánh giá", và hiển thị thông báo cập nhật thành công mà không cần tải lại toàn bộ trang.

3.4. IF đánh giá đã được chỉnh sửa một lần (`edit_count >= 1`) THEN hệ thống SHALL không hiển thị nút "Sửa đánh giá" và SHALL từ chối bất kỳ yêu cầu chỉnh sửa nào tiếp theo bằng lỗi xung đột.

3.5. WHEN khách hàng hoặc người dùng khác yêu cầu xóa đánh giá THEN hệ thống SHALL không cung cấp và không thực hiện hành động xóa.

### Yêu cầu 4: Xem và tương tác với tệp đính kèm (ảnh / video)

**User Story:** Là khách hàng, tôi muốn xem lại các ảnh và video mà tôi đã đính kèm trong đánh giá ở kích thước rõ nét, để kiểm tra lại nội dung đa phương tiện đã đóng góp.

#### Tiêu chí chấp nhận

4.1. WHEN đánh giá có chứa ảnh đính kèm THEN hệ thống SHALL hiển thị hình thu nhỏ của các ảnh và cho phép nhấn vào để xem ảnh phóng to trong modal/lightbox xem trước.

4.2. WHEN đánh giá có chứa video đính kèm THEN hệ thống SHALL hiển thị khung phát video với đầy đủ nút điều khiển (phát/tạm dừng, âm lượng, toàn màn hình) và không tự động phát âm thanh khi tải trang.

4.3. IF một ảnh hoặc video bị lỗi không tải được THEN hệ thống SHALL hiển thị khung giữ chỗ thay thế và không làm gián đoạn việc hiển thị các nội dung khác của đánh giá.

### Yêu cầu 5: Tích hợp điều hướng và tính nhất quán dữ liệu

**User Story:** Là khách hàng, tôi muốn dễ dàng truy cập vào mục lịch sử đánh giá từ thanh điều hướng chính, để thuận tiện quản lý các đóng góp của mình.

#### Tiêu chí chấp nhận

5.1. WHEN khách hàng đã đăng nhập xem thanh điều hướng (Header trên máy tính và Mobile Menu trên thiết bị di động) THEN hệ thống SHALL hiển thị liên kết "Lịch sử đánh giá" dẫn đến `/reviews`.

5.2. WHEN một đánh giá được cập nhật thành công từ trang lịch sử đánh giá THEN hệ thống SHALL đồng bộ dữ liệu để trang chi tiết sản phẩm và trang lịch sử đơn hàng phản ánh nội dung mới nhất trong các lần truy cập tiếp theo.

5.3. WHEN trả về dữ liệu hoặc phản hồi lỗi từ API danh sách lịch sử đánh giá THEN hệ thống SHALL tuân thủ chuẩn Full Status Envelope hiện có; mọi thông báo lỗi nghiệp vụ SHALL bằng tiếng Việt.

### Yêu cầu 6: Trải nghiệm người dùng, khả năng truy cập và bảo mật

**User Story:** Là người dùng trên các thiết bị khác nhau, tôi muốn giao diện hiển thị rõ ràng, mượt mà và bảo vệ quyền riêng tư dữ liệu cá nhân.

#### Tiêu chí chấp nhận

6.1. WHEN người dùng truy cập trang lịch sử đánh giá THEN hệ thống SHALL chỉ trả về và hiển thị các đánh giá thuộc tài khoản của chính người dùng đó, tuyệt đối không trả về dữ liệu riêng tư của người dùng khác.

6.2. WHEN giao diện hiển thị trên màn hình có chiều rộng từ 320 CSS pixel trở lên THEN hệ thống SHALL bố trí bố cục responsive linh hoạt, không bị vỡ giao diện hay cuộn ngang ngoài ý muốn.

6.3. WHEN trang đang tải dữ liệu danh sách đánh giá hoặc đang xử lý cập nhật THEN hệ thống SHALL hiển thị skeleton / loading indicator tương ứng để thông báo trạng thái cho người dùng.

6.4. WHEN người dùng điều hướng bằng bàn phím THEN hệ thống SHALL cho phép kích hoạt các bộ lọc, mở/đóng modal chỉnh sửa và xem ảnh với chỉ báo focus nhìn thấy rõ ràng.
