# Tài liệu yêu cầu

## Giới thiệu

Tính năng cho phép khách hàng thể hiện một đánh giá sản phẩm hoặc phản hồi của người bán là "Hữu ích" hay "Không hữu ích". Kết quả bình chọn giúp người xem khác nhận biết mức độ hữu ích của từng nội dung, đồng thời vẫn giữ nguyên các luồng xem, tạo và chỉnh sửa đánh giá cũng như quản lý phản hồi hiện có.

## Yêu cầu

### Yêu cầu 1: Hiển thị mức độ hữu ích

**User Story:** Là người xem đánh giá sản phẩm, tôi muốn thấy số lượt hữu ích và không hữu ích của từng nội dung, để tham khảo ý kiến cộng đồng.

#### Tiêu chí chấp nhận

1.1. WHEN hệ thống hiển thị một đánh giá trên trang chi tiết sản phẩm THEN hệ thống SHALL hiển thị riêng tổng số lượt "Hữu ích" và "Không hữu ích" của đánh giá đó.

1.2. WHEN một đánh giá có phản hồi của người bán THEN hệ thống SHALL hiển thị riêng tổng số lượt "Hữu ích" và "Không hữu ích" của phản hồi đó, độc lập với kết quả của đánh giá.

1.3. WHEN một nội dung chưa có lượt bình chọn THEN hệ thống SHALL hiển thị số lượt của cả hai lựa chọn là 0.

1.4. WHEN người xem chưa đăng nhập THEN hệ thống SHALL vẫn cho phép xem các tổng số bình chọn hiện tại.

1.5. WHEN khách hàng đã đăng nhập xem một nội dung THEN hệ thống SHALL thể hiện rõ lựa chọn hiện tại của khách hàng cho nội dung đó, hoặc trạng thái chưa bình chọn.

### Yêu cầu 2: Gửi và thay đổi bình chọn

**User Story:** Là khách hàng đã đăng nhập, tôi muốn bình chọn hữu ích hoặc không hữu ích cho nội dung mình đang xem, để đóng góp nhận định của mình.

#### Tiêu chí chấp nhận

2.1. WHEN khách hàng đã đăng nhập chọn "Hữu ích" hoặc "Không hữu ích" trên một nội dung hợp lệ THEN hệ thống SHALL lưu lựa chọn và cập nhật trạng thái cùng hai tổng số được hiển thị.

2.2. WHEN khách hàng đã có một lựa chọn cho một nội dung và chọn lựa chọn đối lập THEN hệ thống SHALL thay thế lựa chọn cũ bằng lựa chọn mới, giảm tổng cũ một và tăng tổng mới một.

2.3. WHEN khách hàng chọn lại lựa chọn đang được chọn THEN hệ thống SHALL gỡ bình chọn của khách hàng và giảm tổng tương ứng một.

2.4. WHEN nhiều yêu cầu bình chọn hợp lệ tác động đồng thời đến cùng một nội dung THEN hệ thống SHALL duy trì tối đa một lựa chọn hiện hành của mỗi khách hàng và trả về các tổng số không âm, phản ánh trạng thái đã lưu.

2.5. WHEN thao tác bình chọn đang được xử lý THEN giao diện SHALL ngăn khách hàng gửi lặp thao tác trên cùng nội dung cho đến khi nhận được kết quả.

2.6. IF lưu bình chọn thất bại THEN hệ thống SHALL thông báo lỗi bằng tiếng Việt và khôi phục trạng thái cùng tổng số gần nhất đã được xác nhận.

### Yêu cầu 3: Quyền bình chọn

**User Story:** Là chủ hệ thống, tôi muốn mỗi bình chọn gắn với một tài khoản khách hàng hợp lệ, để hạn chế thao túng kết quả.

#### Tiêu chí chấp nhận

3.1. WHEN người xem chưa đăng nhập kích hoạt một lựa chọn bình chọn THEN hệ thống SHALL yêu cầu đăng nhập và cung cấp khả năng quay lại đúng trang sản phẩm đang xem sau khi đăng nhập thành công.

3.2. IF tài khoản không có vai trò khách hàng THEN hệ thống SHALL từ chối tạo, đổi hoặc gỡ bình chọn.

3.3. WHEN khách hàng xem đánh giá do chính mình viết hoặc phản hồi người bán dành cho đánh giá đó THEN hệ thống SHALL cho phép khách hàng bình chọn từng nội dung theo cùng quy tắc áp dụng cho các nội dung khác.

3.4. IF đánh giá hoặc phản hồi mục tiêu không tồn tại tại thời điểm xử lý THEN hệ thống SHALL không thay đổi dữ liệu bình chọn và thông báo nội dung không còn khả dụng bằng tiếng Việt.

### Yêu cầu 4: Phân biệt đánh giá và phản hồi người bán

**User Story:** Là khách hàng, tôi muốn bình chọn độc lập cho đánh giá và phản hồi người bán, để đánh giá đúng từng nội dung.

#### Tiêu chí chấp nhận

4.1. WHEN khách hàng bình chọn cho một đánh giá THEN hệ thống SHALL chỉ thay đổi bình chọn và tổng số của đánh giá đó.

4.2. WHEN khách hàng bình chọn cho phản hồi người bán THEN hệ thống SHALL chỉ thay đổi bình chọn và tổng số của phản hồi đó.

4.3. WHEN người bán chỉnh sửa nội dung một phản hồi hiện có THEN hệ thống SHALL giữ nguyên các bình chọn đã có của phản hồi đó.

4.4. WHEN người bán xóa một phản hồi THEN hệ thống SHALL không còn hiển thị hoặc chấp nhận bình chọn cho phản hồi đã xóa.

4.5. WHEN người bán tạo lại phản hồi sau khi đã xóa THEN hệ thống SHALL coi đó là nội dung phản hồi mới với hai tổng số bắt đầu từ 0 và không có lựa chọn hiện tại của khách hàng.

### Yêu cầu 5: Tính nhất quán khi tải danh sách

**User Story:** Là người xem, tôi muốn số liệu và trạng thái bình chọn nhất quán khi chuyển trang hoặc tải lại, để tin cậy kết quả hiển thị.

#### Tiêu chí chấp nhận

5.1. WHEN danh sách đánh giá được tải, tải lại hoặc chuyển trang THEN hệ thống SHALL trả về hai tổng số cho từng đánh giá và từng phản hồi hiện có trong danh sách.

5.2. WHEN yêu cầu danh sách đến từ khách hàng đã đăng nhập THEN hệ thống SHALL trả về lựa chọn hiện tại của khách hàng cho từng đánh giá và từng phản hồi hiện có trong danh sách.

5.3. WHEN yêu cầu danh sách đến từ người xem chưa đăng nhập THEN hệ thống SHALL không biểu thị bất kỳ lựa chọn nào là lựa chọn của người xem.

5.4. WHEN một thao tác bình chọn thành công THEN kết quả trả về SHALL chứa trạng thái lựa chọn hiện tại và hai tổng số mới nhất của đúng nội dung được thao tác.

### Yêu cầu 6: Bảo toàn hành vi hiện có

**User Story:** Là người dùng chức năng đánh giá hiện tại, tôi muốn các luồng sẵn có tiếp tục hoạt động, để tính năng bình chọn không làm gián đoạn trải nghiệm.

#### Tiêu chí chấp nhận

6.1. WHEN tính năng bình chọn được bổ sung THEN hệ thống SHALL giữ nguyên khả năng xem đánh giá công khai mà không cần đăng nhập.

6.2. WHEN danh sách đánh giá được tải THEN hệ thống SHALL tiếp tục sắp xếp đánh giá mới nhất trước và giữ nguyên hành vi phân trang hiện có.

6.3. WHEN tính năng bình chọn được sử dụng THEN hệ thống SHALL không làm thay đổi điểm trung bình, phân bố số sao hoặc tổng số đánh giá sản phẩm.

6.4. WHEN khách hàng tạo hoặc chỉnh sửa đánh giá THEN hệ thống SHALL giữ nguyên các quy tắc đủ điều kiện, giới hạn chỉnh sửa và xử lý nội dung đa phương tiện hiện có.

6.5. WHEN người bán tạo, chỉnh sửa hoặc xóa phản hồi THEN hệ thống SHALL giữ nguyên các quy tắc nội dung và quyền quản trị hiện có, ngoại trừ vòng đời bình chọn được quy định tại Yêu cầu 4.

6.6. WHEN khách hàng xem lịch sử đánh giá cá nhân THEN hệ thống SHALL giữ nguyên cách hiển thị hiện có và không hiển thị số liệu hoặc điều khiển bình chọn tại trang này.

### Yêu cầu 7: Khả dụng và tiếp cận

**User Story:** Là người dùng trên thiết bị và phương thức tương tác khác nhau, tôi muốn điều khiển bình chọn rõ ràng và tiếp cận được, để có thể sử dụng tính năng thuận tiện.

#### Tiêu chí chấp nhận

7.1. WHEN giao diện hiển thị các lựa chọn bình chọn THEN mỗi lựa chọn SHALL có nhãn tiếng Việt rõ ràng, thể hiện được trạng thái chọn mà không chỉ phụ thuộc vào màu sắc.

7.2. WHEN người dùng thao tác bằng bàn phím THEN hệ thống SHALL cho phép đưa tiêu điểm đến từng lựa chọn, kích hoạt lựa chọn và hiển thị tiêu điểm rõ ràng.

7.3. WHEN giao diện hiển thị trên chiều rộng 320 pixel trở lên THEN các lựa chọn và tổng số SHALL không gây cuộn ngang và vẫn có vùng tương tác tối thiểu 44 x 44 pixel.

7.4. WHEN dữ liệu bình chọn đang được tải cùng danh sách đánh giá THEN giao diện SHALL hiển thị trạng thái tải hiện có của khu vực đánh giá thay vì hiển thị số liệu chưa được xác nhận.
