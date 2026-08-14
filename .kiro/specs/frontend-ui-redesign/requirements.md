# Requirements Document

## Introduction

Giao diện frontend hiện tại cần được tái thiết kế để tạo cảm nhận chuyên nghiệp, nhất quán và dễ sử dụng hơn, mà không thay đổi các khả năng nghiệp vụ đang được cung cấp. Đợt thay đổi này áp dụng cho toàn bộ trang và trạng thái giao diện hiện có mà người dùng có thể truy cập.

Phạm vi đối tượng áp dụng: các route hiện có `/`, `/products`, `/products/:id`, `/cart`, `/login`, `/register` và 404. Các luồng hiện chưa tồn tại trong codebase (checkout/order creation, wishlist, account/order history, rating/review, discount/original price, sorting, pagination) **không** được thêm mới; requirement chỉ mô tả hành vi có thể quan sát được của giao diện dựa trên dữ liệu và chức năng hiện có.

## Requirements

### Requirement 1

**User Story:** Là một khách hàng, tôi muốn giao diện có nhận diện trực quan nhất quán và chuyên nghiệp, để tôi có thể tin tưởng và sử dụng cửa hàng dễ dàng.

#### Acceptance Criteria

1.1. WHEN người dùng truy cập bất kỳ trang giao diện hiện có nào THEN hệ thống SHALL hiển thị hệ thống màu sắc, kiểu chữ, khoảng cách, viền, trạng thái tương tác và thành phần điều hướng nhất quán trên toàn bộ trang.
1.2. WHEN người dùng xem các thành phần có cùng vai trò, bao gồm nút, trường nhập liệu, thẻ nội dung, thông báo và tiêu đề THEN hệ thống SHALL thể hiện chúng theo cùng một quy tắc trực quan trong mọi ngữ cảnh.
1.3. WHEN người dùng tương tác với điều khiển có thể thao tác THEN hệ thống SHALL cung cấp phản hồi trực quan cho các trạng thái hover, focus, disabled và loading khi các trạng thái đó áp dụng.

### Requirement 2

**User Story:** Là một khách hàng, tôi muốn thực hiện các tác vụ mua sắm hiện có trong giao diện rõ ràng, để hoàn thành mục tiêu mà không bị nhầm lẫn.

#### Acceptance Criteria

2.1. WHEN người dùng truy cập các luồng hiện có như điều hướng, xác thực, duyệt và lọc sản phẩm, xem chi tiết, quản lý giỏ hàng và hành động thanh toán hiện có THEN hệ thống SHALL tiếp tục cung cấp tất cả thao tác và kết quả nghiệp vụ hiện có, trong đó hành động thanh toán giữ nguyên vai trò placeholder hiện tại (thông báo ngoài phạm vi) và KHÔNG thêm luồng thanh toán/đặt hàng mới.
2.2. WHEN một trang chứa hành động chính THEN hệ thống SHALL làm hành động đó nổi bật hơn các hành động phụ bằng hệ thống phân cấp trực quan nhất quán.
2.3. WHEN trang đang tải dữ liệu, không có dữ liệu hoặc không thể tải dữ liệu THEN hệ thống SHALL hiển thị trạng thái phù hợp, dễ hiểu và không làm mất các điều khiển có liên quan.

### Requirement 3

**User Story:** Là một khách hàng sử dụng thiết bị khác nhau, tôi muốn giao diện dễ sử dụng trên màn hình nhỏ và lớn, để có thể mua sắm thuận tiện ở bất kỳ thiết bị nào.

#### Acceptance Criteria

3.1. WHEN người dùng mở giao diện ở độ rộng từ 320 px đến 1439 px THEN hệ thống SHALL hiển thị nội dung không cần cuộn ngang ở mức trang, trừ nội dung vốn cần cuộn ngang.
3.2. WHEN người dùng mở giao diện ở độ rộng từ 1440 px trở lên THEN hệ thống SHALL sử dụng không gian màn hình để duy trì bố cục dễ đọc và không kéo giãn nội dung văn bản thành các dòng quá dài.
3.3. WHEN người dùng thay đổi độ rộng màn hình THEN hệ thống SHALL điều chỉnh điều hướng, lưới nội dung, biểu mẫu và các nhóm hành động để các điều khiển vẫn đọc được và có thể thao tác.

### Requirement 4

**User Story:** Là một người dùng bao gồm người dùng dùng bàn phím hoặc công nghệ hỗ trợ, tôi muốn giao diện có thể nhận biết và thao tác được, để hoàn thành các tác vụ mua sắm độc lập.

#### Acceptance Criteria

4.1. WHEN người dùng điều hướng chỉ bằng bàn phím THEN hệ thống SHALL cho phép đến mọi điều khiển tương tác hiện có theo thứ tự hợp lý và hiển thị chỉ báo focus rõ ràng.
4.2. WHEN thông tin hoặc trạng thái được truyền đạt bằng màu sắc THEN hệ thống SHALL đồng thời truyền đạt trạng thái đó bằng văn bản, biểu tượng hoặc dấu hiệu trực quan không phụ thuộc riêng vào màu sắc.
4.3. WHEN văn bản được hiển thị trên nền THEN hệ thống SHALL duy trì tỷ lệ tương phản tối thiểu 4.5:1 cho văn bản thông thường và 3:1 cho văn bản lớn.
4.4. WHEN người dùng xem trang ở mức phóng đại trình duyệt 200% THEN hệ thống SHALL giữ nội dung và điều khiển chính có thể đọc và thao tác mà không bị che khuất hoặc chồng lấp.

### Requirement 5

**User Story:** Là một khách hàng quay lại, tôi muốn chức năng và dữ liệu quen thuộc vẫn hoạt động sau khi giao diện được nâng cấp, để không bị gián đoạn trải nghiệm mua sắm.

#### Acceptance Criteria

5.1. WHEN giao diện được nâng cấp THEN hệ thống SHALL giữ nguyên các đường dẫn trang, hợp đồng API phía client và quy tắc xác thực hiện có.
5.2. WHEN người dùng mở một liên kết trang hiện có hoặc làm mới trang hiện có THEN hệ thống SHALL tiếp tục hiển thị đúng trang và bảo toàn hành vi hiện có của trang đó.
5.3. WHEN người dùng sử dụng các bộ lọc danh mục hiện có THEN hệ thống SHALL tiếp tục phản ánh trạng thái bộ lọc trong URL và khôi phục trạng thái đó khi tải lại trang.

### Requirement 6

**User Story:** Là một khách hàng, tôi muốn thanh điều hướng trên cùng cho tôi thấy thương hiệu, đường điều hướng, tài khoản và trạng thái giỏ hàng, để định hướng trong cửa hàng.

#### Acceptance Criteria

6.1. WHEN người dùng xem thanh điều hướng THEN hệ thống SHALL hiển thị thương hiệu trỏ về trang chủ, điều hướng chính (trang chủ, danh mục), nhóm tác vụ tài khoản (đăng nhập/đăng ký hoặc email người dùng và đăng xuất) và liên kết giỏ hàng kèm số lượng mục hiện có.
6.2. WHEN người dùng mở giao diện ở độ rộng 600 px trở xuống THEN hệ thống SHALL hiển thị điều hướng không bị che khuất hoặc gây cuộn ngang ở mức trang, ví dụ bằng cách bọc sang hàng riêng.
6.3. WHEN người dùng đang ở trang tương ứng với một mục điều hướng THEN hệ thống SHALL biểu thị trạng thái đang hoạt động bằng dấu hiệu không chỉ dựa vào màu sắc.
6.4. IF một thanh tìm kiếm xuất hiện trên thanh điều hướng THEN hệ thống SHALL dùng thanh tìm kiếm đó để điều hướng tới trang danh mục với từ khóa `q` tương ứng, không làm thay đổi hợp đồng lọc hiện có.

### Requirement 7

**User Story:** Là một khách hàng, tôi muốn cuối trang có các thông tin nhận diện và điều hướng hữu ích, để tìm được đường quay lại hoặc xác nhận đây là một cửa hàng đáng tin cậy.

#### Acceptance Criteria

7.1. WHEN người dùng cuộn tới cuối trang THEN hệ thống SHALL hiển thị footer có thương hiệu, các đường điều hướng hiện có và thông tin bản quyền.
7.2. WHEN nội dung phụ trợ chưa tồn tại trong codebase (như hỗ trợ khách hàng hoặc chính sách) THEN hệ thống SHALL KHÔNG tự tạo ra nội dung nghiệp vụ giả cho các khu vực đó.
7.3. WHEN người dùng mở giao diện ở mọi độ rộng THEN footer SHALL không che khuất hoặc chồng lấn nội dung chính.

### Requirement 8

**User Story:** Là một khách hàng, tôi muốn trang chủ cho tôi thấy ngay cửa hàng bán gì và bắt đầu mua từ đâu, để có bước vào trang rõ ràng.

#### Acceptance Criteria

8.1. WHEN người dùng mở trang chủ THEN hệ thống SHALL hiển thị khu vực hero có tiêu đề, đoạn giới thiệu và một hành động chính đi tới danh mục sản phẩm.
8.2. WHEN khu vực hero được hiển thị THEN hệ thống SHALL KHÔNG để hero chiếm gần như toàn bộ khung nhìn, trừ khi đó là hành vi hiện có được phê duyệt.
8.3. WHEN người dùng xem phần sản phẩm nổi bật THEN hệ thống SHALL hiển thị tiêu đề phần và lưới sản phẩm với các trạng thái tải/trống/lỗi theo yêu cầu 2.3.

### Requirement 9

**User Story:** Là một khách hàng, tôi muốn thẻ sản phẩm hiển thị thông tin chính và giúp tôi so sánh nhanh giữa các sản phẩm, để quyết định mua nhanh hơn.

#### Acceptance Criteria

9.1. WHEN người dùng xem thẻ sản phẩm THEN hệ thống SHALL hiển thị ảnh sản phẩm, nhãn kỹ thuật (thương hiệu/mẫu), tên sản phẩm liên kết tới trang chi tiết, giá và trạng thái còn hàng hoặc hết hàng.
9.2. WHEN ảnh sản phẩm được hiển thị THEN hệ thống SHALL áp dụng tỷ lệ khung hình nhất quán và đối tượng lấp đầy hợp lý trong mọi thẻ.
9.3. WHEN tên sản phẩm dài THEN hệ thống SHALL cắt ngắn hoặc giới hạn dòng mà không phá vỡ bố cục; các thẻ trong cùng một lưới SHALL có chiều cao và căn chỉnh hành động nhất quán.
9.4. WHEN người dùng di chuột qua thẻ sản phẩm THEN hệ thống SHALL tạo phản hồi nhẹ (thay đổi viền/bóng hoặc phóng ảnh rất nhẹ) và KHÔNG dùng hiệu ứng gây mất tập trung.

### Requirement 10

**User Story:** Là một khách hàng, tôi muốn lưới sản phẩm và trang danh mục hiển thị đúng số lượng kết quả, bộ lọc và trạng thái lọc đang dùng, để tìm đúng sản phẩm mình cần.

#### Acceptance Criteria

10.1. WHEN người dùng xem trang danh mục THEN hệ thống SHALL hiển thị ô tìm kiếm, nhóm bộ lọc thương hiệu, trường giá tối thiểu/tối đa, nhóm trạng thái tồn kho và hành động đặt lại bộ lọc, tất cả liên kết với các tham số URL hiện có `q`, `category_id`, `min_price`, `max_price`, `in_stock`.
10.2. WHEN có bộ lọc đang hoạt động THEN hệ thống SHALL hiển thị số lượng kết quả tương ứng và cho phép người dùng đặt lại toàn bộ bằng một hành động; hành động đặt lại SHALL bị vô hiệu khi chưa có bộ lọc nào.
10.3. WHEN lưới sản phẩm được hiển thị THEN hệ thống SHALL điều chỉnh số cột theo độ rộng màn hình (1–2 cột trên mobile, 2–3 trên tablet, 3 trở lên trên desktop) với khoảng cách đồng nhất và không gây cuộn ngang.

### Requirement 11

**User Story:** Là một khách hàng, tôi muốn trang chi tiết sản phẩm nhóm rõ giá, tồn kho, lựa chọn biến thể và hành động mua hàng, để đưa ra quyết định mua ở một nơi.

#### Acceptance Criteria

11.1. WHEN người dùng xem trang chi tiết THEN hệ thống SHALL hiển thị khu vực hình ảnh sản phẩm và một bảng mua hàng gồm thương hiệu/mẫu, tên sản phẩm, giá, trạng thái tồn kho, bộ chọn biến thể, thông báo phản hồi và nút thêm vào giỏ hàng.
11.2. WHEN bảng mua hàng được hiển thị THEN hệ thống SHALL làm hành động thêm vào giỏ hàng nổi bật hơn các thông tin phụ bằng phân cấp trực quan.
11.3. WHEN người dùng chọn biến thể THEN hệ thống SHALL biểu thị trạng thái đã chọn và trạng thái không khả dụng bằng sự kết hợp viền/nền và thuộc tính `aria-pressed`, không chỉ bằng màu sắc.
11.4. WHEN người dùng mở trang chi tiết ở độ rộng 600 px trở xuống THEN hệ thống SHALL xếp khu vực hình ảnh trước thông tin mua hàng và không làm các điều khiển bị cắt hoặc gây cuộn ngang.
11.5. WHEN người dùng thực hiện thêm vào giỏ hàng THEN hệ thống SHALL bảo toàn hành vi hiện có về điều hướng đăng nhập, trạng thái hết hàng và thông báo phản hồi.

### Requirement 12

**User Story:** Là một khách hàng, tôi muốn giỏ hàng cho tôi quét nhanh từng mục và thấy tổng cộng, để kiểm soát đơn hàng trước khi thanh toán.

#### Acceptance Criteria

12.1. WHEN người dùng xem giỏ hàng THEN hệ thống SHALL hiển thị từng mục gồm ảnh, thông tin sản phẩm, biến thể đã chọn, đơn giá, số lượng, tổng dòng và hành động xóa, với vùng chạm đủ lớn và trạng thái đang xử lý/vô hiệu rõ ràng.
12.2. WHEN người dùng xem giỏ hàng THEN hệ thống SHALL tách riêng bảng tóm tắt gồm số lượng đã chọn, tổng tiền và hành động chính (tiếp tục thanh toán) với trạng thái vô hiệu khi chưa có mục được chọn hoặc đang xử lý.
12.3. WHEN người dùng mở giỏ hàng ở độ rộng 600 px trở xuống THEN hệ thống SHALL xếp các mục và bảng tóm tắt theo cột không gây cuộn ngang và giữ hành động chính có thể thao tác.
12.4. WHEN người dùng thao tác với giỏ hàng THEN hệ thống SHALL bảo toàn hành vi hiện có về chọn mục, chọn tất cả, cập nhật số lượng, xóa, tải lại, thông báo lỗi và thông báo thanh toán.

### Requirement 13

**User Story:** Là một khách hàng, tôi muốn trang đăng nhập và đăng ký rõ ràng, cân đối và phản hồi lỗi ngay tại trường tương ứng, để vào cửa hàng nhanh chóng.

#### Acceptance Criteria

13.1. WHEN người dùng mở trang đăng nhập hoặc đăng ký THEN hệ thống SHALL hiển thị bề mặt xác thực cân đối gồm tiêu đề, các trường nhập liệu có nhãn, thông báo lỗi toàn cục và nút gửi chính có trạng thái đang xử lý/vô hiệu.
13.2. WHEN có lỗi xác thực trường THEN hệ thống SHALL hiển thị lỗi gần trường tương ứng.
13.3. WHEN người dùng gửi biểu mẫu THEN hệ thống SHALL bảo toàn hành vi hiện có về kiểm tra dữ liệu, xử lý lỗi API, vị trí quay lại sau xác thực và các liên kết qua lại giữa đăng nhập và đăng ký.

### Requirement 14

**User Story:** Là một khách hàng, tôi muốn trạng thái tải, trống, lỗi và phản hồi thao tác rõ ràng, để biết giao diện đang làm gì và hành động tiếp theo là gì.

#### Acceptance Criteria

14.1. WHEN dữ liệu đang được tải trong một khu vực có bố cục rõ ràng THEN hệ thống SHALL hiển thị khung xương (skeleton) khớp với bố cục thực tế thay vì chỉ một spinner hoặc văn bản giữa màn hình, trong khi vẫn giữ ngữ nghĩa trạng thái hiện có.
14.2. WHEN một danh sách trống (giỏ hàng trống, không có kết quả tìm kiếm, không có sản phẩm nổi bật) THEN hệ thống SHALL hiển thị thông điệp rõ ràng kèm hành động phù hợp để tiếp tục.
14.3. WHEN không thể tải dữ liệu THEN hệ thống SHALL hiển thị thông điệp dễ hiểu và hành động phục hồi hiện có (thử lại, quay lại hoặc đi tiếp).
14.4. WHEN người dùng thực hiện thao tác thay đổi trạng thái (thêm vào giỏ, cập nhật số lượng, chọn lưu, xóa) THEN hệ thống SHALL cung cấp phản hồi có thể quan sát được qua cơ chế phản hồi hiện có.
