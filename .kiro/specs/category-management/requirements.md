# Requirements Document

## Introduction

Chức năng quản lý danh mục cho phép quản trị viên duy trì danh mục dùng để phân loại sản phẩm trong cửa hàng. Phạm vi gồm xem danh sách, tạo mới, đổi tên và xoá danh mục trong giao diện quản trị; danh mục hiện có vẫn được hiển thị cho khách hàng tại các điểm sử dụng danh mục.

## Requirements

### Requirement 1 — Xem danh mục
**User Story:** Là quản trị viên, tôi muốn xem danh sách danh mục hiện có, để biết và quản lý tập phân loại sản phẩm.

#### Acceptance Criteria
1.1. WHEN quản trị viên đã xác thực truy cập khu vực quản lý danh mục THEN hệ thống SHALL hiển thị tất cả danh mục cùng mã định danh và tên danh mục.
1.2. WHEN chưa có danh mục nào THEN hệ thống SHALL hiển thị trạng thái trống và lời hướng dẫn tạo danh mục đầu tiên.
1.3. IF người dùng chưa xác thực hoặc không có quyền quản trị yêu cầu dữ liệu quản lý danh mục THEN hệ thống SHALL từ chối yêu cầu theo cơ chế phân quyền hiện có.

### Requirement 2 — Tạo danh mục
**User Story:** Là quản trị viên, tôi muốn tạo danh mục mới, để phân loại sản phẩm chính xác.

#### Acceptance Criteria
2.1. WHEN quản trị viên gửi tên danh mục hợp lệ THEN hệ thống SHALL tạo danh mục và hiển thị danh mục mới trong danh sách.
2.2. IF tên danh mục bị bỏ trống sau khi bỏ khoảng trắng đầu/cuối THEN hệ thống SHALL không tạo danh mục và hiển thị lỗi xác thực tại trường tên.
2.3. IF tên danh mục trùng với một danh mục hiện có mà không phân biệt chữ hoa/thường và khoảng trắng đầu/cuối THEN hệ thống SHALL không tạo danh mục và thông báo lý do bằng tiếng Việt.
2.4. IF yêu cầu tạo không hợp lệ THEN API SHALL trả lỗi HTTP 400 trong Full Status Envelope, với mã lỗi xác thực và lỗi theo trường tương ứng.

### Requirement 3 — Đổi tên danh mục
**User Story:** Là quản trị viên, tôi muốn đổi tên danh mục, để tên phân loại luôn chính xác và dễ hiểu.

#### Acceptance Criteria
3.1. WHEN quản trị viên gửi tên mới hợp lệ cho một danh mục tồn tại THEN hệ thống SHALL cập nhật tên và hiển thị tên mới trong danh sách cũng như tại các sản phẩm thuộc danh mục đó.
3.2. IF tên mới bị bỏ trống sau khi bỏ khoảng trắng đầu/cuối THEN hệ thống SHALL giữ nguyên danh mục và hiển thị lỗi xác thực tại trường tên.
3.3. IF tên mới trùng với tên của danh mục khác mà không phân biệt chữ hoa/thường và khoảng trắng đầu/cuối THEN hệ thống SHALL giữ nguyên danh mục và thông báo lý do bằng tiếng Việt.
3.4. IF danh mục cần đổi tên không tồn tại THEN hệ thống SHALL thông báo không tìm thấy bằng tiếng Việt và không tạo danh mục thay thế.

### Requirement 4 — Xoá danh mục
**User Story:** Là quản trị viên, tôi muốn xoá danh mục không còn dùng, để danh sách danh mục gọn và chính xác.

#### Acceptance Criteria
4.1. WHEN quản trị viên xác nhận xoá một danh mục không còn được sản phẩm nào sử dụng THEN hệ thống SHALL xoá danh mục và không còn hiển thị danh mục đó trong danh sách.
4.2. IF danh mục cần xoá đang được ít nhất một sản phẩm sử dụng THEN hệ thống SHALL không xoá danh mục và thông báo lý do bằng tiếng Việt.
4.3. IF danh mục cần xoá không tồn tại THEN hệ thống SHALL thông báo không tìm thấy bằng tiếng Việt.
4.4. WHEN quản trị viên bắt đầu thao tác xoá THEN hệ thống SHALL yêu cầu xác nhận rõ ràng trước khi gửi yêu cầu xoá.

### Requirement 5 — Trải nghiệm và hợp đồng tích hợp
**User Story:** Là quản trị viên, tôi muốn nhận phản hồi rõ ràng sau mỗi thao tác, để có thể quản lý danh mục tin cậy.

#### Acceptance Criteria
5.1. WHEN một thao tác tạo, đổi tên hoặc xoá thành công THEN hệ thống SHALL hiển thị phản hồi thành công bằng tiếng Việt và đồng bộ danh sách danh mục với kết quả mới nhất.
5.2. IF thao tác không thành công do lỗi nghiệp vụ hoặc lỗi hệ thống THEN hệ thống SHALL giữ dữ liệu đã hiển thị nhất quán, hiển thị thông báo tiếng Việt, và cho phép quản trị viên thử lại.
5.3. WHEN API quản lý danh mục trả phản hồi có nội dung THEN API SHALL tuân thủ Full Status Envelope hiện có, với dữ liệu chính nằm trực tiếp trong trường `data`.
5.4. WHEN giao diện quản trị hiển thị hoặc nhận thao tác quản lý danh mục THEN hệ thống SHALL hỗ trợ thao tác bằng bàn phím, có nhãn truy cập được cho các điều khiển, và hiển thị trạng thái lỗi bằng văn bản.
