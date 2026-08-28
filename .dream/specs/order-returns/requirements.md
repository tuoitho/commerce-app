# Tài liệu yêu cầu

## Giới thiệu

Tính năng trả hàng cho phép khách hàng chọn các dòng sản phẩm cần trả trong đơn đã giao, theo dõi tiến trình và hủy yêu cầu khi còn chờ duyệt. Mỗi dòng được chọn phải trả toàn bộ số lượng đã mua. Quản trị viên có thể duyệt hoặc từ chối, xác nhận đã nhận hàng và xác nhận đã hoàn tiền COD. Workflow này là nguồn được hỗ trợ để chuyển đơn sang `partially_returned` hoặc `returned`, đồng thời cung cấp trạng thái theo từng dòng hàng cho tính năng đánh giá sản phẩm đã mua.

Phạm vi ban đầu không bao gồm trả một phần số lượng trong một dòng hàng, đổi sản phẩm, upload bằng chứng, vận chuyển thu hồi tự động hay cổng thanh toán hoàn tiền.

## Yêu cầu

### Yêu cầu 1: Xác định đơn đủ điều kiện trả hàng

**User Story:** Là khách hàng đã nhận hàng, tôi muốn biết đơn nào còn có thể yêu cầu trả, để không phải tự tính điều kiện hoặc cung cấp mã nội bộ.

#### Tiêu chí chấp nhận

1.1. WHEN khách hàng đã đăng nhập xem đơn của mình ở trạng thái `delivered` THEN hệ thống SHALL hiển thị trạng thái và hành động trả hàng phù hợp cho từng dòng sản phẩm.

1.2. IF ngày hiện tại không muộn hơn ngày thứ 7 sau ngày giao hàng theo múi giờ `Asia/Ho_Chi_Minh` và đơn chưa được hoàn trả THEN hệ thống SHALL đánh dấu đơn là đủ điều kiện gửi yêu cầu trả hàng cho đến hết ngày đó.

1.3. IF đơn không thuộc khách hàng, không ở trạng thái `delivered`, thiếu `deliveredAt` hoặc đã quá thời hạn 7 ngày THEN hệ thống SHALL không cho phép tạo yêu cầu trả hàng.

1.4. IF đơn đang có một yêu cầu ở trạng thái `pending_approval`, `approved` hoặc `received` THEN hệ thống SHALL không cho phép tạo thêm yêu cầu trả hàng cho đơn đó.

1.5. IF đơn đã có một yêu cầu ở trạng thái `refunded` THEN hệ thống SHALL không cho phép tạo thêm yêu cầu trả hàng cho đơn đó.

1.6. IF yêu cầu trước đó của đơn ở trạng thái `cancelled` hoặc `rejected` và đơn vẫn ở trạng thái `delivered` trong thời hạn 7 ngày THEN hệ thống SHALL cho phép khách hàng tạo yêu cầu mới.

1.7. WHEN hiển thị đơn đủ điều kiện THEN hệ thống SHALL lấy order ID, các dòng hàng, toàn bộ số lượng từng dòng và số tiền từ lịch sử đơn hiện có thay vì yêu cầu khách hàng nhập lại.

### Yêu cầu 2: Gửi yêu cầu trả sản phẩm đã chọn

**User Story:** Là khách hàng đủ điều kiện, tôi muốn chọn các sản phẩm cần trả và gửi lý do, để người bán xem xét yêu cầu của tôi.

#### Tiêu chí chấp nhận

2.1. WHEN khách hàng mở biểu mẫu trả hàng THEN hệ thống SHALL hiển thị toàn bộ dòng sản phẩm và số lượng trong đơn, cho phép chọn một hoặc nhiều dòng, đồng thời hiển thị số tiền hoàn dự kiến, danh sách lý do và trường mô tả.

2.2. WHEN khách hàng gửi yêu cầu THEN hệ thống SHALL yêu cầu đúng một lý do thuộc `defective`, `not_as_described`, `wrong_or_missing` hoặc `changed_mind` và SHALL cho phép mô tả tùy chọn tối đa 1.000 ký tự; `wrong_or_missing` SHALL có nghĩa là nhận sai sản phẩm hoặc thiếu phụ kiện/thành phần trong một dòng hàng đã nhận, không bao gồm chưa nhận toàn bộ dòng hàng.

2.3. WHEN khách hàng chọn một dòng hàng THEN hệ thống SHALL đưa toàn bộ số lượng đã mua của dòng đó vào yêu cầu và SHALL không cho phép nhập số lượng trả một phần.

2.4. WHEN yêu cầu hợp lệ được gửi THEN hệ thống SHALL tạo một yêu cầu `pending_approval` bao gồm đúng các dòng đã chọn với toàn bộ số lượng đã mua.

2.5. WHEN yêu cầu chứa tất cả dòng hàng của đơn THEN hệ thống SHALL tính số tiền hoàn dự kiến bằng tổng giá trị các dòng hàng cộng toàn bộ phí vận chuyển ban đầu.

2.6. WHEN yêu cầu chỉ chứa một phần các dòng hàng của đơn THEN hệ thống SHALL tính số tiền hoàn dự kiến bằng tổng giá trị các dòng được chọn và không bao gồm phí vận chuyển ban đầu.

2.7. IF không có dòng hàng nào được chọn, lý do thiếu/không hợp lệ hoặc mô tả dài hơn 1.000 ký tự THEN hệ thống SHALL từ chối yêu cầu, giữ dữ liệu đã nhập và chỉ rõ trường không hợp lệ.

2.8. IF request chứa dòng hàng không thuộc order, trùng dòng hàng hoặc số lượng khác toàn bộ số lượng đã mua THEN hệ thống SHALL từ chối yêu cầu và không để client thay đổi sản phẩm, số lượng hoặc số tiền hoàn.

2.9. IF điều kiện đơn thay đổi trước khi yêu cầu được lưu THEN hệ thống SHALL kiểm tra lại dữ liệu hiện tại, không tạo yêu cầu không hợp lệ và trả lỗi nghiệp vụ bằng tiếng Việt.

2.10. WHEN yêu cầu được tạo thành công THEN hệ thống SHALL thông báo thành công và hiển thị mã yêu cầu, trạng thái, thời gian tạo, lý do, mô tả, các sản phẩm và số tiền hoàn dự kiến mà không tải lại toàn bộ trang.

### Yêu cầu 3: Xem và hủy yêu cầu trả hàng

**User Story:** Là khách hàng đã gửi yêu cầu, tôi muốn theo dõi và hủy khi người bán chưa duyệt, để kiểm soát quyết định trả hàng của mình.

#### Tiêu chí chấp nhận

3.1. WHEN khách hàng xem chi tiết đơn có yêu cầu trả hàng THEN hệ thống SHALL hiển thị yêu cầu mới nhất, trạng thái hiện tại, timeline trạng thái, lý do, mô tả, danh sách sản phẩm, số tiền dự kiến hoặc thực tế và lý do từ chối nếu có.

3.2. WHEN chủ đơn hủy yêu cầu ở trạng thái `pending_approval` THEN hệ thống SHALL chuyển yêu cầu sang `cancelled`, ghi thời gian hủy và cho phép tạo yêu cầu mới nếu đơn vẫn ở trạng thái `delivered` trong thời hạn 7 ngày.

3.3. IF yêu cầu không thuộc khách hàng hoặc không còn ở trạng thái `pending_approval` THEN hệ thống SHALL không cho phép khách hàng hủy yêu cầu.

3.4. WHEN khách hàng xem lịch sử đơn THEN hệ thống SHALL cho phép nhận biết đơn đang chờ duyệt trả, đã được duyệt, đã nhận hàng trả, đã hoàn tiền, bị từ chối hoặc đã hủy yêu cầu.

### Yêu cầu 4: Quản trị viên duyệt hoặc từ chối

**User Story:** Là quản trị viên, tôi muốn kiểm tra yêu cầu trả hàng và quyết định duyệt hoặc từ chối, để xử lý đúng chính sách bán hàng.

#### Tiêu chí chấp nhận

4.1. WHEN quản trị viên xem danh sách yêu cầu trả hàng THEN hệ thống SHALL hỗ trợ lọc theo trạng thái và hiển thị mã yêu cầu, mã đơn, email khách hàng, thời gian tạo, lý do và số tiền dự kiến.

4.2. WHEN quản trị viên xem chi tiết yêu cầu THEN hệ thống SHALL hiển thị mã đơn, trạng thái đơn, email khách hàng, phương thức thanh toán, ngày đặt, ngày giao, tổng giá trị đơn, snapshot đúng các sản phẩm/số lượng được yêu cầu trả, lý do, mô tả, timeline và số tiền dự kiến mà không hiển thị thông tin xác thực của khách hàng.

4.3. WHEN quản trị viên duyệt yêu cầu `pending_approval` THEN hệ thống SHALL chuyển yêu cầu sang `approved`, ghi thời gian duyệt và giữ order ở trạng thái `delivered` cho đến khi hoàn tiền hoàn tất.

4.4. WHEN quản trị viên từ chối yêu cầu `pending_approval` với lý do từ chối không rỗng và không quá 1.000 ký tự THEN hệ thống SHALL chuyển yêu cầu sang `rejected`, ghi lý do và thời gian từ chối.

4.5. IF quản trị viên từ chối mà thiếu lý do hoặc lý do dài hơn 1.000 ký tự THEN hệ thống SHALL giữ yêu cầu ở trạng thái cũ và chỉ rõ trường không hợp lệ.

4.6. IF yêu cầu đã rời trạng thái `pending_approval` THEN hệ thống SHALL từ chối thao tác duyệt hoặc từ chối lặp bằng lỗi xung đột.

### Yêu cầu 5: Nhận hàng trả và xác nhận hoàn tiền

**User Story:** Là quản trị viên, tôi muốn ghi nhận hàng trả và hoàn tiền, để kết thúc yêu cầu và cập nhật đơn chính xác.

#### Tiêu chí chấp nhận

5.1. WHEN quản trị viên xác nhận đã nhận đầy đủ tất cả dòng hàng trong yêu cầu `approved` THEN hệ thống SHALL yêu cầu xác định đúng physical variant thực nhận cho từng dòng, chuyển yêu cầu sang `received`, ghi thời gian nhận và tăng inventory quantity của mỗi physical variant theo toàn bộ số lượng đã trả tương ứng.

5.2. IF yêu cầu không ở trạng thái `approved` THEN hệ thống SHALL từ chối thao tác xác nhận nhận hàng bằng lỗi xung đột.

5.3. WHEN quản trị viên xác nhận đã hoàn tiền COD cho yêu cầu `received` THEN hệ thống SHALL đặt số tiền hoàn thực tế bằng số tiền hoàn dự kiến, chuyển yêu cầu sang `refunded`, đồng thời ghi quản trị viên và thời gian hoàn tiền trong cùng một thao tác nhất quán.

5.4. WHEN yêu cầu được hoàn tiền và chứa tất cả dòng hàng của đơn THEN hệ thống SHALL chuyển order từ `delivered` sang `returned` trong cùng thao tác hoàn tiền.

5.5. WHEN yêu cầu được hoàn tiền và chỉ chứa một phần các dòng hàng của đơn THEN hệ thống SHALL chuyển order từ `delivered` sang `partially_returned` trong cùng thao tác hoàn tiền.

5.6. IF yêu cầu không ở trạng thái `received` THEN hệ thống SHALL từ chối thao tác xác nhận hoàn tiền bằng lỗi xung đột và không thay đổi order.

5.7. IF thao tác xác nhận nhận hàng không thể tăng đầy đủ tồn kho cho mọi dòng được trả THEN hệ thống SHALL không chuyển yêu cầu sang `received` và không tăng tồn kho một phần.

5.8. IF product hoặc variant của dòng hàng trả đã inactive THEN hệ thống SHALL vẫn tăng inventory quantity nhưng SHALL giữ nguyên trạng thái active/inactive và không tự đưa sản phẩm trở lại catalog bán được.

5.9. WHEN quản trị viên chọn physical variant thực nhận THEN hệ thống SHALL cung cấp khả năng tìm kiếm cả variant active và inactive bằng thông tin product, model và phân loại, không yêu cầu quản trị viên biết UUID nội bộ.

5.10. IF ánh xạ physical variant thiếu dòng hàng, lặp dòng hàng hoặc tham chiếu variant không tồn tại THEN hệ thống SHALL từ chối thao tác nhận hàng, giữ yêu cầu ở `approved` và không tăng inventory quantity một phần.

### Yêu cầu 6: Tích hợp trạng thái đơn và refunded-item state

**User Story:** Là khách hàng và hệ thống tiêu thụ trạng thái đơn, tôi muốn return workflow cập nhật nguồn trạng thái theo từng dòng hàng nhất quán, để các workflow downstream xác định chính xác sản phẩm đã được hoàn tiền.

#### Tiêu chí chấp nhận

6.1. WHEN yêu cầu ở `pending_approval`, `approved` hoặc `received` THEN hệ thống SHALL giữ order ở trạng thái `delivered` và hiển thị đồng thời trạng thái xử lý trả hàng.

6.2. WHEN yêu cầu chuyển sang `refunded` THEN hệ thống SHALL chuyển order từ `delivered` sang đúng một trong hai trạng thái `partially_returned` hoặc `returned` theo tập dòng hàng được hoàn tiền và SHALL không cho phép return request mới cho order đó.

6.3. WHEN một yêu cầu được hoàn tiền thành công THEN hệ thống SHALL duy trì chính xác tập order item đã được hoàn tiền gắn với yêu cầu `refunded` để các workflow downstream có thể phân biệt item đã trả và chưa trả.

6.4. WHEN order chuyển sang `partially_returned` THEN hệ thống SHALL không đánh dấu các dòng hàng ngoài yêu cầu refunded là đã trả.

6.5. WHEN refund hoàn tất THEN hệ thống SHALL cập nhật return request, item-level refunded state và order status trong cùng một transaction để các consumer không quan sát trạng thái hoàn tất một phần.

6.6. WHEN hai thao tác refund cạnh tranh trên cùng order THEN hệ thống SHALL tuần tự hóa bằng current order/request state và chỉ công khai một kết quả hợp lệ.

6.7. WHEN khách hàng lọc nhóm đơn trả hàng THEN hệ thống SHALL hiển thị cả order `partially_returned` và `returned`; các bucket và trạng thái đơn khác SHALL giữ hành vi hiện có.

### Yêu cầu 7: Phân quyền, lỗi và khả năng truy cập

**User Story:** Là khách hàng hoặc quản trị viên, tôi muốn return workflow bảo vệ dữ liệu và sử dụng được trên các thiết bị, để thao tác an toàn và rõ ràng.

#### Tiêu chí chấp nhận

7.1. IF người chưa đăng nhập gọi customer return operation THEN hệ thống SHALL yêu cầu đăng nhập và không thay đổi dữ liệu.

7.2. IF customer cố truy cập hoặc thay đổi return request của order không thuộc mình THEN hệ thống SHALL không để lộ nội dung yêu cầu và không thay đổi dữ liệu.

7.3. IF người dùng không có role admin gọi admin return operation THEN hệ thống SHALL từ chối truy cập và không thay đổi dữ liệu.

7.4. WHEN hai thao tác đồng thời cố chuyển cùng một return request khỏi cùng trạng thái nguồn THEN hệ thống SHALL chỉ cho phép một transition thành công.

7.5. WHEN API trả thành công hoặc lỗi THEN hệ thống SHALL dùng Full Status Envelope hiện có; lỗi nghiệp vụ SHALL có message tiếng Việt.

7.6. WHEN sử dụng bàn phím hoặc trình đọc màn hình THEN hệ thống SHALL cung cấp label, trạng thái, focus và thao tác đầy đủ cho biểu mẫu, dialog và action trả hàng mà không chỉ dựa vào màu sắc.

7.7. WHEN giao diện customer hoặc admin hiển thị ở chiều rộng 320 CSS pixel trở lên THEN hệ thống SHALL không tạo cuộn ngang ngoài chủ ý và SHALL giữ primary action có thể tiếp cận.

7.8. WHEN dữ liệu đang tải hoặc transition đang gửi THEN hệ thống SHALL hiển thị tiến trình, ngăn gửi lặp và cung cấp lỗi/retry tại ngữ cảnh phù hợp.
