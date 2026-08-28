# Tài liệu yêu cầu: Phản hồi đánh giá của quản trị viên (Admin Review Reply)

## Giới thiệu

Tính năng "Phản hồi đánh giá của quản trị viên" (Admin Review Reply) cho phép nhân viên quản trị (admin) xem danh sách các đánh giá sản phẩm từ khách hàng, đồng thời có thể viết phản hồi chính thức cho các đánh giá đó. Các phản hồi của admin sẽ được hiển thị công khai trên trang chi tiết sản phẩm, ngay bên dưới đánh giá của khách hàng, giúp cửa hàng tương tác, giải đáp thắc mắc hoặc xử lý khiếu nại công khai.

## Yêu cầu

### Yêu cầu 1: Quản lý danh sách đánh giá (Admin)

**User Story:** Là quản trị viên, tôi muốn xem danh sách các đánh giá của khách hàng trên toàn hệ thống, để tôi có thể nắm bắt phản hồi và quyết định xem đánh giá nào cần trả lời.

#### Tiêu chí chấp nhận

1.1. WHEN admin truy cập trang quản lý đánh giá THEN hệ thống SHALL hiển thị danh sách các đánh giá, sắp xếp theo thời gian tạo mới nhất trước.
1.2. WHEN hiển thị danh sách đánh giá trong admin THEN hệ thống SHALL hiển thị các thông tin: người đánh giá (email), số sao, nội dung nhận xét, thời gian đánh giá, và trạng thái đã có phản hồi từ admin hay chưa.
1.3. WHEN danh sách đánh giá có nhiều dòng THEN hệ thống SHALL hỗ trợ phân trang cho danh sách đánh giá.
1.4. WHEN admin xem danh sách đánh giá THEN hệ thống SHALL cho phép lọc đánh giá theo số sao (1-5) và trạng thái đã phản hồi/chưa phản hồi.
1.5. IF người dùng không có quyền truy cập admin (không phải admin/staff) THEN hệ thống SHALL từ chối quyền truy cập trang danh sách đánh giá.

### Yêu cầu 2: Phản hồi đánh giá (Admin)

**User Story:** Là quản trị viên, tôi muốn viết, chỉnh sửa hoặc xóa câu trả lời của mình cho một đánh giá cụ thể, để tương tác trực tiếp với khách hàng.

#### Tiêu chí chấp nhận

2.1. WHEN admin chọn hành động phản hồi trên một đánh giá THEN hệ thống SHALL hiển thị biểu mẫu để nhập nội dung phản hồi (dạng văn bản, tối đa 1.000 ký tự).
2.2. WHEN admin gửi phản hồi hợp lệ THEN hệ thống SHALL lưu nội dung phản hồi, gắn liền với đánh giá đó, và ghi nhận thời gian phản hồi.
2.3. IF admin gửi nội dung phản hồi trống (chỉ gồm khoảng trắng) hoặc vượt quá 1.000 ký tự THEN hệ thống SHALL từ chối yêu cầu và hiển thị lỗi tương ứng.
2.4. WHEN một đánh giá đã có phản hồi từ admin THEN hệ thống SHALL cho phép admin chỉnh sửa lại nội dung phản hồi đó.
2.5. WHEN admin xóa nội dung phản hồi THEN hệ thống SHALL gỡ bỏ phản hồi khỏi đánh giá (trở về trạng thái chưa phản hồi).
2.6. IF nhiều admin cùng có quyền THEN hệ thống SHALL cho phép bất kỳ admin nào cũng có thể thêm/sửa/xóa phản hồi (không bị khóa bởi admin đã tạo trước đó).
2.7. IF người dùng không có quyền quản trị THEN hệ thống SHALL từ chối yêu cầu API liên quan đến thêm/sửa/xóa phản hồi.

### Yêu cầu 3: Hiển thị phản hồi công khai (Trang sản phẩm)

**User Story:** Là người xem trang sản phẩm, tôi muốn đọc được phản hồi của cửa hàng đối với đánh giá của khách hàng, để thấy được thái độ phục vụ và có thêm thông tin.

#### Tiêu chí chấp nhận

3.1. WHEN hệ thống hiển thị một đánh giá trên trang chi tiết sản phẩm (công khai) và đánh giá đó có phản hồi của admin THEN hệ thống SHALL hiển thị nội dung phản hồi ngay bên dưới đánh giá của khách.
3.2. WHEN hiển thị phản hồi của admin THEN hệ thống SHALL sử dụng định dạng trực quan để phân biệt rõ đây là câu trả lời từ cửa hàng/quản trị viên (ví dụ: nhãn "Quản trị viên" hoặc "Phản hồi từ cửa hàng").
3.3. IF đánh giá không có phản hồi từ admin THEN hệ thống SHALL không hiển thị vùng phản hồi.
3.4. WHEN hiển thị phản hồi công khai THEN hệ thống SHALL không hiển thị thông tin nội bộ của admin (như ID, email cá nhân của nhân viên), chỉ hiển thị định danh chung của cửa hàng.
3.5. WHEN admin cập nhật hoặc xóa phản hồi THEN hệ thống SHALL phản ánh thay đổi đó trên trang sản phẩm ở lần tải dữ liệu kế tiếp của người dùng.
