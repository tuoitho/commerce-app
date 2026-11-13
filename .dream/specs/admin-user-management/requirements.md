# Tài liệu yêu cầu

## Giới thiệu

Ứng dụng quản trị AuraPhone (`frontend-admin`) đang có mục điều hướng "Người dùng" bị vô hiệu với nhãn "Sắp ra mắt". Quản trị viên chưa có cách nào xem danh sách tài khoản, tra cứu một khách hàng hay ngăn một tài khoản vi phạm đăng nhập. Tính năng này kích hoạt mục "Người dùng", cung cấp trang danh sách có tìm kiếm và bộ lọc, trang chi tiết tài khoản kèm tóm tắt mua hàng, và thao tác khóa / mở khóa tài khoản khách hàng.

Người dùng bị ảnh hưởng:

- **Quản trị viên** (vai trò `admin`): sử dụng trang quản lý người dùng.
- **Khách hàng** (vai trò `customer`): tài khoản bị khóa không đăng nhập hoặc gia hạn phiên được nữa. Khách hàng có tài khoản đang hoạt động không thấy thay đổi nào.

Quy ước dùng chung cho toàn bộ tài liệu:

- **Trạng thái tài khoản:** `active` (hiển thị "Hoạt động") hoặc `locked` (hiển thị "Đã khóa").
- **Vai trò:** `customer` (hiển thị "Khách hàng") hoặc `admin` (hiển thị "Quản trị viên").
- **Đơn đã giao:** đơn hàng có trạng thái hiện tại thuộc `delivered`, `partially_returned` hoặc `returned` (cùng định nghĩa với trang tổng quan quản trị).
- **Múi giờ hiển thị:** giờ Việt Nam (UTC+7).
- **Tiền tệ:** số nguyên VND, hiển thị theo định dạng tiếng Việt có dấu phân cách hàng nghìn và hậu tố "₫".
- **Thời hạn access token:** cấu hình `ACCESS_TOKEN_TTL`, mặc định 15 phút.

## Quyết định sản phẩm

Các quyết định dưới đây xác định phạm vi và hành vi của tính năng. Mỗi quyết định kèm lý do và phương án đã loại.

| ID | Quyết định | Lý do | Phương án đã loại |
|---|---|---|---|
| PD-1 | Phạm vi gồm: xem danh sách, tìm kiếm / lọc, xem chi tiết, khóa và mở khóa tài khoản. | Đây là nhu cầu quản trị tối thiểu còn thiếu: tra cứu khách hàng và chặn tài khoản vi phạm. | Thêm tạo / sửa / xóa người dùng, đặt lại mật khẩu: khách hàng tự đăng ký, chưa có kênh gửi email để đặt lại mật khẩu, xóa tài khoản ảnh hưởng tới đơn hàng và đánh giá. |
| PD-2 | Không hỗ trợ đổi vai trò (thăng / giáng quyền quản trị). Tài khoản quản trị vẫn được tạo bằng cơ chế bootstrap hiện có. | Vai trò nằm trong access token. Giáng quyền một quản trị viên vẫn để lại quyền quản trị tới khi token hết hạn, cần cơ chế thu hồi tức thời nằm ngoài phạm vi này. | Cho phép đổi vai trò kèm thu hồi phiên: rủi ro bảo mật khi token cũ còn hiệu lực. |
| PD-3 | Chỉ tài khoản `customer` có thể bị khóa. Tài khoản `admin` (kể cả chính người thao tác) không thể bị khóa qua tính năng này. | Ngăn quản trị viên tự khóa mình hoặc khóa lẫn nhau, bảo đảm luôn còn ít nhất một quản trị viên hoạt động. | Cho khóa quản trị viên khác trừ chính mình: cần thêm quy tắc "quản trị viên cuối cùng" và xử lý tranh chấp giữa các quản trị viên. |
| PD-4 | Khóa tài khoản chặn đăng nhập và gia hạn phiên ngay lập tức, thu hồi mọi phiên gia hạn hiện có. Access token đã cấp vẫn dùng được tới khi hết hạn (tối đa `ACCESS_TOKEN_TTL`). | Giữ xác thực không trạng thái hiện có, không thêm truy vấn cơ sở dữ liệu cho mỗi request. Độ trễ tối đa 15 phút là chấp nhận được cho thao tác chặn khách hàng. | Kiểm tra trạng thái tài khoản ở mọi request có xác thực: thêm một truy vấn cơ sở dữ liệu cho mọi API cần đăng nhập. |
| PD-5 | Khi đăng nhập sai mật khẩu vào tài khoản bị khóa, hệ thống trả lỗi sai thông tin đăng nhập như hiện tại. Chỉ khi mật khẩu đúng mới báo tài khoản bị khóa. | Không tiết lộ trạng thái khóa của một email cho người không biết mật khẩu. | Luôn báo "bị khóa": cho phép dò trạng thái tài khoản theo email. |
| PD-6 | Khi khóa, quản trị viên có thể nhập lý do (không bắt buộc, tối đa 500 ký tự). Lý do chỉ hiển thị trong ứng dụng quản trị, không hiển thị cho khách hàng. | Giúp quản trị viên khác hiểu vì sao tài khoản bị khóa. Lý do là ghi chú nội bộ. | Lý do bắt buộc: làm chậm thao tác khẩn cấp. Hiển thị lý do cho khách hàng: lộ ghi chú nội bộ. |
| PD-7 | Khóa / mở khóa một tài khoản đã ở trạng thái đích trả lỗi xung đột (409) thay vì thành công im lặng. | Báo cho quản trị viên biết dữ liệu trên màn hình đã cũ (một quản trị viên khác vừa thao tác). | Idempotent 200: che giấu việc màn hình đang hiển thị trạng thái cũ. |
| PD-8 | Khóa tài khoản không thay đổi dữ liệu hiện có của khách hàng (đơn hàng, đổi trả, đánh giá, hội thoại, bài viết, bình luận). Quản trị viên vẫn xử lý được các đơn và yêu cầu của tài khoản bị khóa. | Khóa là biện pháp chặn truy cập, không phải xóa dữ liệu; đơn đang giao vẫn cần được hoàn tất. | Tự hủy đơn hoặc ẩn nội dung của tài khoản bị khóa: ảnh hưởng nghiệp vụ đơn hàng, cần quyết định riêng. |
| PD-9 | Mở khóa không khôi phục phiên cũ; khách hàng đăng nhập lại bằng mật khẩu hiện có. | Phiên đã bị thu hồi khi khóa; đăng nhập lại là hành vi rõ ràng nhất. | Khôi phục phiên đã thu hồi: phức tạp và không cần thiết. |

## Yêu cầu

### Yêu cầu 1: Truy cập trang quản lý người dùng

**User Story:** Là quản trị viên, tôi muốn mở trang quản lý người dùng từ menu điều hướng, để tra cứu và xử lý tài khoản.

#### Tiêu chí chấp nhận

1.1. WHEN quản trị viên đã đăng nhập xem menu điều hướng của ứng dụng quản trị THEN hệ thống SHALL hiển thị mục "Người dùng" ở trạng thái dùng được (không còn nhãn "Sắp ra mắt"), và WHEN quản trị viên chọn mục này THEN hệ thống SHALL mở trang danh sách người dùng tại `/users` và đánh dấu mục "Người dùng" đang được chọn.

1.2. IF người dùng chưa đăng nhập truy cập `/users` hoặc `/users/<id>` trong ứng dụng quản trị THEN hệ thống SHALL giữ hành vi chuyển hướng tới trang đăng nhập quản trị hiện có.

1.3. IF lời gọi bất kỳ API quản lý người dùng nào không kèm phiên đăng nhập hợp lệ THEN hệ thống SHALL trả về HTTP 401; IF người gọi đã đăng nhập nhưng không có vai trò `admin` THEN hệ thống SHALL trả về HTTP 403 với `error.code` = `forbidden`. Cả hai trường hợp đều không trả về dữ liệu người dùng và không thay đổi trạng thái tài khoản.

### Yêu cầu 2: Danh sách người dùng

**User Story:** Là quản trị viên, tôi muốn xem danh sách tài khoản kèm vai trò, trạng thái và số đơn hàng, để nắm tổng quan khách hàng.

#### Tiêu chí chấp nhận

2.1. WHEN trang `/users` hiển thị THEN hệ thống SHALL hiển thị bảng người dùng, mỗi dòng gồm: email, vai trò ("Khách hàng" / "Quản trị viên"), trạng thái ("Hoạt động" / "Đã khóa"), số đơn hàng (mọi trạng thái) và ngày tạo tài khoản (`dd/MM/yyyy`).

2.2. Danh sách SHALL được sắp xếp theo thời điểm tạo tài khoản giảm dần (mới nhất trước); các tài khoản tạo cùng thời điểm SHALL có thứ tự ổn định giữa các lần tải.

2.3. WHEN danh sách có nhiều hơn 20 tài khoản thỏa bộ lọc THEN hệ thống SHALL phân trang 20 tài khoản mỗi trang, hiển thị tổng số tài khoản thỏa bộ lọc, trang hiện tại / tổng số trang, và nút "Trước" / "Sau"; nút "Trước" SHALL bị vô hiệu ở trang đầu và nút "Sau" SHALL bị vô hiệu ở trang cuối.

2.4. IF không có tài khoản nào thỏa bộ lọc THEN hệ thống SHALL hiển thị thông báo "Không tìm thấy người dùng phù hợp" thay cho bảng.

2.5. WHILE danh sách đang tải THEN hệ thống SHALL hiển thị trạng thái đang tải; IF tải danh sách thất bại THEN hệ thống SHALL hiển thị thông báo "Không thể tải danh sách người dùng" kèm nút "Thử lại" để tải lại, và SHALL không hiển thị danh sách rỗng như thể không có người dùng.

2.6. WHEN quản trị viên chọn một dòng (email) trong danh sách THEN hệ thống SHALL mở trang chi tiết `/users/<id>` của tài khoản đó.

2.7. IF API danh sách nhận `page` không phải số nguyên dương, hoặc `limit` không phải số nguyên trong khoảng 1–100 THEN hệ thống SHALL trả về HTTP 400 với `error.code` = `validation_error` và `error.fields` chỉ ra tham số không hợp lệ; IF `page` vượt quá số trang hiện có THEN hệ thống SHALL trả về danh sách rỗng kèm thông tin phân trang đúng tổng số.

### Yêu cầu 3: Tìm kiếm và lọc

**User Story:** Là quản trị viên, tôi muốn tìm theo email và lọc theo vai trò, trạng thái, để nhanh chóng tìm đúng tài khoản cần xử lý.

#### Tiêu chí chấp nhận

3.1. WHEN quản trị viên nhập từ khóa vào ô tìm kiếm và nhấn Enter hoặc nút "Tìm" THEN hệ thống SHALL chỉ hiển thị tài khoản có email chứa từ khóa đó, không phân biệt chữ hoa / thường, sau khi bỏ khoảng trắng đầu và cuối từ khóa; từ khóa rỗng SHALL không lọc theo email.

3.2. WHEN quản trị viên chọn bộ lọc vai trò ("Tất cả vai trò", "Khách hàng", "Quản trị viên") THEN hệ thống SHALL chỉ hiển thị tài khoản có vai trò tương ứng; "Tất cả vai trò" là mặc định.

3.3. WHEN quản trị viên chọn bộ lọc trạng thái ("Tất cả trạng thái", "Hoạt động", "Đã khóa") THEN hệ thống SHALL chỉ hiển thị tài khoản có trạng thái tương ứng; "Tất cả trạng thái" là mặc định.

3.4. WHEN nhiều bộ lọc cùng được áp dụng THEN hệ thống SHALL chỉ hiển thị tài khoản thỏa tất cả bộ lọc; WHEN quản trị viên thay đổi từ khóa hoặc bộ lọc THEN hệ thống SHALL quay về trang 1.

3.5. WHEN quản trị viên tìm kiếm, lọc hoặc chuyển trang THEN hệ thống SHALL ghi trạng thái đó lên địa chỉ trang (`search`, `role`, `status`, `page`); WHEN quản trị viên tải lại trình duyệt, chia sẻ đường dẫn hoặc quay lại từ trang chi tiết THEN hệ thống SHALL khôi phục đúng từ khóa, bộ lọc và trang đó. IF địa chỉ trang chứa giá trị `role`, `status` hoặc `page` không hợp lệ THEN giao diện SHALL dùng giá trị mặc định tương ứng.

3.6. IF API danh sách nhận `role` khác `customer` / `admin` hoặc `status` khác `active` / `locked` (giá trị rỗng được coi là không lọc) THEN hệ thống SHALL trả về HTTP 400 với `error.code` = `invalid_filter` và `error.fields` chỉ ra tham số không hợp lệ.

3.7. IF từ khóa tìm kiếm sau khi bỏ khoảng trắng dài hơn 100 ký tự THEN API SHALL trả về HTTP 400 với `error.code` = `validation_error` và `error.fields.search`; giao diện SHALL giới hạn ô tìm kiếm tối đa 100 ký tự.

### Yêu cầu 4: Chi tiết tài khoản

**User Story:** Là quản trị viên, tôi muốn xem thông tin và lịch sử mua hàng tóm tắt của một tài khoản, để quyết định cách hỗ trợ hoặc xử lý.

#### Tiêu chí chấp nhận

4.1. WHEN quản trị viên mở `/users/<id>` của một tài khoản tồn tại THEN hệ thống SHALL hiển thị: email, vai trò, trạng thái, ngày giờ tạo tài khoản (`HH:mm dd/MM/yyyy`); IF tài khoản đang bị khóa THEN hệ thống SHALL hiển thị thêm thời điểm khóa (`HH:mm dd/MM/yyyy`) và lý do khóa (hoặc "Không có lý do" khi không nhập).

4.2. WHEN trang chi tiết hiển thị THEN hệ thống SHALL hiển thị tóm tắt mua hàng gồm: tổng số đơn hàng (mọi trạng thái), số đơn đã giao, tổng giá trị đơn đã giao (tổng `total_vnd` của các đơn đã giao, bao gồm phí vận chuyển, không trừ hoàn tiền) và thời điểm đặt đơn gần nhất; IF tài khoản chưa có đơn nào THEN các số đếm và tổng tiền SHALL là 0 và thời điểm đặt đơn gần nhất SHALL hiển thị "Chưa có đơn hàng".

4.3. WHEN trang chi tiết hiển thị THEN hệ thống SHALL hiển thị tối đa 5 đơn hàng gần nhất của tài khoản (mới nhất trước), mỗi đơn gồm mã đơn, trạng thái (dùng nhãn trạng thái đơn hàng hiện có của ứng dụng quản trị), tổng tiền và thời điểm đặt; WHEN quản trị viên chọn một đơn THEN hệ thống SHALL mở trang chi tiết đơn hàng quản trị hiện có `/orders/<orderId>`. IF tài khoản chưa có đơn nào THEN hệ thống SHALL hiển thị "Tài khoản chưa có đơn hàng".

4.4. IF `<id>` không tương ứng với tài khoản nào (kể cả `<id>` sai định dạng) THEN API SHALL trả về HTTP 404 với `error.code` = `user_not_found` và `error.message` = "Không tìm thấy người dùng", và giao diện SHALL hiển thị "Không tìm thấy người dùng" kèm liên kết "Quay lại danh sách" về `/users`.

4.5. WHEN trang chi tiết hiển thị THEN hệ thống SHALL có liên kết "Quay lại danh sách" đưa quản trị viên về danh sách người dùng với từ khóa, bộ lọc và trang trước đó nếu quản trị viên đến từ danh sách, hoặc về `/users` nếu mở trực tiếp.

4.6. IF tải chi tiết thất bại vì lỗi khác 404 THEN hệ thống SHALL hiển thị "Không thể tải thông tin người dùng" kèm nút "Thử lại".

### Yêu cầu 5: Khóa tài khoản khách hàng

**User Story:** Là quản trị viên, tôi muốn khóa tài khoản khách hàng vi phạm, để ngăn tài khoản đó tiếp tục đăng nhập và sử dụng cửa hàng.

#### Tiêu chí chấp nhận

5.1. WHEN quản trị viên xem chi tiết một tài khoản `customer` đang `active` THEN hệ thống SHALL hiển thị nút "Khóa tài khoản"; WHEN quản trị viên nhấn nút THEN hệ thống SHALL hiển thị hộp thoại xác nhận nêu email tài khoản, ô nhập "Lý do khóa" không bắt buộc (tối đa 500 ký tự) và hai nút "Hủy" / "Khóa tài khoản".

5.2. WHEN quản trị viên xác nhận khóa THEN hệ thống SHALL chuyển tài khoản sang `locked`, ghi thời điểm khóa và lý do (đã bỏ khoảng trắng đầu và cuối; lý do rỗng được lưu là không có lý do), hiển thị thông báo "Đã khóa tài khoản", và cập nhật trạng thái trên trang chi tiết và danh sách mà không cần tải lại trình duyệt.

5.3. WHEN quản trị viên nhấn "Hủy" hoặc đóng hộp thoại THEN hệ thống SHALL không thay đổi tài khoản.

5.4. WHEN tài khoản bị khóa THEN hệ thống SHALL thu hồi mọi phiên gia hạn (refresh token) hiện có của tài khoản; mọi yêu cầu gia hạn phiên sau đó SHALL bị từ chối với HTTP 401 và `error.code` = `invalid_token`.

5.5. IF tài khoản bị khóa đăng nhập (trên cửa hàng hoặc ứng dụng quản trị) với email và mật khẩu đúng THEN hệ thống SHALL trả về HTTP 403 với `error.code` = `account_locked` và `error.message` = "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ bộ phận hỗ trợ.", không cấp phiên mới, và trang đăng nhập SHALL hiển thị thông điệp đó; IF mật khẩu sai THEN hệ thống SHALL giữ phản hồi sai thông tin đăng nhập hiện có (HTTP 401, `invalid_credentials`).

5.6. IF tài khoản bị khóa còn access token được cấp trước thời điểm khóa THEN token đó SHALL tiếp tục được chấp nhận tới khi hết hạn, tối đa `ACCESS_TOKEN_TTL` (mặc định 15 phút) kể từ thời điểm cấp; sau khi token hết hạn, tài khoản SHALL không thể lấy access token mới.

5.7. WHEN tài khoản bị khóa THEN hệ thống SHALL giữ nguyên đơn hàng, yêu cầu đổi trả, đánh giá, hội thoại hỗ trợ, bài viết, bình luận và thông báo của tài khoản; quản trị viên SHALL tiếp tục xem và xử lý được các đơn hàng và yêu cầu đổi trả của tài khoản đó bằng các trang quản trị hiện có.

5.8. IF tài khoản mục tiêu có vai trò `admin` THEN giao diện SHALL không hiển thị nút "Khóa tài khoản", và API khóa SHALL trả về HTTP 409 với `error.code` = `cannot_lock_admin` và `error.message` = "Không thể khóa tài khoản quản trị viên", không thay đổi tài khoản.

5.9. IF tài khoản mục tiêu đã ở trạng thái `locked` THEN API khóa SHALL trả về HTTP 409 với `error.code` = `user_already_locked` và `error.message` = "Tài khoản đã bị khóa trước đó", không thay đổi thời điểm khóa và lý do hiện có; giao diện SHALL hiển thị thông điệp đó và tải lại thông tin tài khoản.

5.10. IF lý do khóa sau khi bỏ khoảng trắng dài hơn 500 ký tự THEN API SHALL trả về HTTP 400 với `error.code` = `validation_error` và `error.fields.reason`, không thay đổi tài khoản; giao diện SHALL hiển thị lỗi tại ô "Lý do khóa".

5.11. IF tài khoản mục tiêu không tồn tại THEN API khóa SHALL trả về HTTP 404 với `error.code` = `user_not_found`.

### Yêu cầu 6: Mở khóa tài khoản

**User Story:** Là quản trị viên, tôi muốn mở khóa tài khoản đã khóa, để khách hàng tiếp tục sử dụng cửa hàng khi vấn đề đã được giải quyết.

#### Tiêu chí chấp nhận

6.1. WHEN quản trị viên xem chi tiết một tài khoản đang `locked` THEN hệ thống SHALL hiển thị nút "Mở khóa tài khoản"; WHEN quản trị viên nhấn nút THEN hệ thống SHALL hiển thị hộp thoại xác nhận nêu email tài khoản với hai nút "Hủy" / "Mở khóa".

6.2. WHEN quản trị viên xác nhận mở khóa THEN hệ thống SHALL chuyển tài khoản sang `active`, xóa thời điểm khóa và lý do khóa, hiển thị thông báo "Đã mở khóa tài khoản", và cập nhật trạng thái trên trang chi tiết và danh sách mà không cần tải lại trình duyệt.

6.3. WHEN tài khoản đã được mở khóa THEN khách hàng SHALL đăng nhập được bằng email và mật khẩu hiện có; các phiên đã bị thu hồi khi khóa SHALL không được khôi phục.

6.4. IF tài khoản mục tiêu không ở trạng thái `locked` THEN API mở khóa SHALL trả về HTTP 409 với `error.code` = `user_not_locked` và `error.message` = "Tài khoản không ở trạng thái bị khóa", không thay đổi tài khoản; giao diện SHALL hiển thị thông điệp đó và tải lại thông tin tài khoản.

6.5. IF tài khoản mục tiêu không tồn tại THEN API mở khóa SHALL trả về HTTP 404 với `error.code` = `user_not_found`.

### Yêu cầu 7: Tương thích với hành vi hiện có

**User Story:** Là người vận hành hệ thống, tôi muốn tính năng mới không làm thay đổi trải nghiệm của tài khoản đang hoạt động, để nâng cấp an toàn.

#### Tiêu chí chấp nhận

7.1. WHEN hệ thống được nâng cấp lên phiên bản có tính năng này THEN mọi tài khoản hiện có SHALL ở trạng thái `active` và giữ nguyên email, mật khẩu, vai trò, phiên đăng nhập.

7.2. WHEN khách hàng đăng ký tài khoản mới THEN tài khoản SHALL được tạo ở trạng thái `active`.

7.3. WHILE tài khoản ở trạng thái `active` THEN hành vi và hình dạng phản hồi hiện có của đăng ký, đăng nhập, gia hạn phiên, đăng xuất và lấy thông tin tài khoản hiện tại (`/api/v1/auth/*`) SHALL không thay đổi.

7.4. WHEN cơ chế tạo quản trị viên bootstrap chạy THEN tài khoản quản trị SHALL được tạo ở trạng thái `active` như hiện tại.

7.5. WHEN quản trị viên xử lý đơn hàng, đổi trả, đánh giá, hội thoại và bài viết THEN các trang quản trị hiện có SHALL hoạt động như trước, không phụ thuộc trạng thái tài khoản của khách hàng liên quan.

### Yêu cầu 8: Ràng buộc phi chức năng

**User Story:** Là quản trị viên, tôi muốn trang quản lý người dùng phản hồi nhanh và dùng được trên nhiều kích thước màn hình, để làm việc hiệu quả.

#### Tiêu chí chấp nhận

8.1. WHEN cơ sở dữ liệu có 10.000 tài khoản và 50.000 đơn hàng THEN việc lấy một trang danh sách (có hoặc không có từ khóa và bộ lọc) và lấy dữ liệu chi tiết của một tài khoản SHALL mỗi thao tác hoàn tất dưới 1 giây ở tầng truy cập dữ liệu.

8.2. WHEN trang danh sách hoặc trang chi tiết hiển thị ở chiều rộng 375px THEN trang SHALL không có thanh cuộn ngang ở cấp trang; bảng danh sách được phép cuộn ngang bên trong vùng chứa của nó.

8.3. Mọi điều khiển (ô tìm kiếm, bộ lọc, phân trang, nút khóa / mở khóa, nút trong hộp thoại) SHALL thao tác được bằng bàn phím và có nhãn truy cập được; hộp thoại xác nhận SHALL nhận focus khi mở và trả focus về nút đã mở nó khi đóng.

8.4. WHILE yêu cầu khóa hoặc mở khóa đang được gửi THEN nút xác nhận trong hộp thoại SHALL bị vô hiệu để không gửi trùng.

8.5. Mọi thông điệp hiển thị cho người dùng và mọi `error.message` của lỗi nghiệp vụ mới SHALL bằng tiếng Việt.

8.6. WHEN quản trị viên khóa hoặc mở khóa tài khoản THEN hệ thống SHALL ghi log ứng dụng ở mức `info` gồm hành động, ID quản trị viên thực hiện và ID tài khoản mục tiêu; log SHALL không chứa lý do khóa, email, mật khẩu hay token.
