# Tài liệu yêu cầu

## Giới thiệu

Tính năng đánh giá sản phẩm đã mua cho phép khách hàng đã nhận hàng chia sẻ số sao, nhận xét, hình ảnh và video cho từng sản phẩm trong đơn hàng. Đánh giá được xác minh từ lịch sử mua hàng, hiển thị công khai trên trang chi tiết sản phẩm và cập nhật đúng trạng thái "Chờ đánh giá" trong lịch sử đơn hàng.

Phạm vi ban đầu không bao gồm bình luận của quản trị viên, lượt hữu ích, kiểm duyệt nội dung hay giao diện quản trị đánh giá. Đánh giá hợp lệ được công khai ngay sau khi gửi.

## Yêu cầu

### Yêu cầu 1: Xác định sản phẩm đủ điều kiện đánh giá

**User Story:** Là khách hàng đã mua hàng, tôi muốn biết sản phẩm nào có thể đánh giá, để tôi không phải tự tìm hoặc cung cấp mã nội bộ.

#### Tiêu chí chấp nhận

1.1. WHEN khách hàng đã đăng nhập xem một đơn hàng ở trạng thái `delivered` hoặc `partially_returned` THEN hệ thống SHALL hiển thị trạng thái đánh giá và hành động phù hợp cho từng sản phẩm trong đơn.

1.2. IF dòng hàng chưa được hoàn tiền trong đơn `delivered` hoặc `partially_returned` và chưa có đánh giá gắn với dòng hàng đó THEN hệ thống SHALL đánh dấu sản phẩm là có thể đánh giá.

1.3. IF đơn hàng không thuộc khách hàng đang đăng nhập, không ở trạng thái `delivered`/`partially_returned`, hoặc dòng hàng đã thuộc một return request `refunded` THEN hệ thống SHALL không cho phép khách hàng tạo đánh giá cho dòng hàng đó.

1.4. WHEN một dòng hàng có số lượng lớn hơn một THEN hệ thống SHALL coi toàn bộ dòng hàng là một lần mua đủ điều kiện cho một đánh giá.

1.5. WHEN khách hàng mua lại cùng một sản phẩm trong một đơn hàng `delivered` khác THEN hệ thống SHALL coi dòng hàng mới là một lần mua riêng có thể được đánh giá riêng.

1.6. IF một dòng hàng đã được hoàn tiền trước khi được đánh giá THEN hệ thống SHALL không cho phép tạo đánh giá mới cho dòng hàng đó, bất kể order ở trạng thái `partially_returned` hay `returned`.

1.7. IF đánh giá đã được tạo trước khi dòng hàng được hoàn tiền THEN hệ thống SHALL giữ đánh giá đó ở trạng thái công khai và tiếp tục tính đánh giá vào số liệu tổng hợp của sản phẩm.

### Yêu cầu 2: Gửi đánh giá

**User Story:** Là khách hàng đủ điều kiện, tôi muốn chấm sao và viết nhận xét, để chia sẻ trải nghiệm sử dụng sản phẩm.

#### Tiêu chí chấp nhận

2.1. WHEN khách hàng mở hành động đánh giá cho một sản phẩm đủ điều kiện THEN hệ thống SHALL hiển thị đúng sản phẩm và phân loại đã mua, bộ chọn số sao từ 1 đến 5, trường nhận xét và vùng chọn ảnh hoặc video.

2.2. WHEN khách hàng gửi đánh giá với số sao là số nguyên từ 1 đến 5, nhận xét không dài quá 1.000 ký tự và tệp đính kèm hợp lệ THEN hệ thống SHALL lưu và công khai ngay đánh giá cho đúng khách hàng, dòng hàng và sản phẩm đã mua.

2.3. IF nhận xét chỉ gồm khoảng trắng THEN hệ thống SHALL xử lý nhận xét như nội dung để trống.

2.4. IF số sao bị thiếu, không phải số nguyên từ 1 đến 5 hoặc nhận xét dài hơn 1.000 ký tự THEN hệ thống SHALL từ chối yêu cầu, giữ dữ liệu khách hàng đã nhập và chỉ rõ trường không hợp lệ.

2.5. WHEN khách hàng chọn tệp đính kèm THEN hệ thống SHALL cho phép tối đa 5 ảnh thuộc định dạng JPEG, PNG hoặc WebP, mỗi ảnh không quá 5 MB, và tối đa 1 video thuộc định dạng MP4 hoặc WebM không quá 50 MB trong cùng một đánh giá.

2.6. IF số lượng, định dạng hoặc kích thước tệp vượt giới hạn THEN hệ thống SHALL từ chối tệp không hợp lệ, giải thích giới hạn bị vi phạm và giữ lại các dữ liệu hợp lệ khác trong biểu mẫu.

2.7. WHEN khách hàng chọn tệp hợp lệ THEN hệ thống SHALL hiển thị bản xem trước và cho phép loại bỏ từng tệp trước khi gửi.

2.8. IF việc tải lên hoặc lưu bất kỳ tệp nào thất bại khi gửi đánh giá THEN hệ thống SHALL không công khai đánh giá chưa hoàn chỉnh, giữ dữ liệu biểu mẫu có thể khôi phục và cho phép khách hàng thử lại.

2.9. IF dòng hàng đã có đánh giá THEN hệ thống SHALL từ chối yêu cầu tạo thêm đánh giá cho cùng dòng hàng với lỗi xung đột.

2.10. WHEN đánh giá được gửi thành công THEN hệ thống SHALL thông báo thành công và cập nhật sản phẩm đó sang trạng thái đã đánh giá mà không yêu cầu tải lại toàn bộ trang.

2.11. WHEN một đánh giá có tệp đính kèm được lưu thành công THEN hệ thống SHALL duy trì liên kết giữa tệp và đánh giá để tệp tiếp tục có thể được xem cùng nội dung công khai trong các lần truy cập sau.

### Yêu cầu 3: Quản lý đánh giá của khách hàng

**User Story:** Là khách hàng đã đánh giá, tôi muốn xem và sửa đánh giá đúng một lần, để có thể sửa sai nhưng vẫn giữ tính ổn định của nội dung công khai.

#### Tiêu chí chấp nhận

3.1. WHEN khách hàng xem dòng hàng đã đánh giá nhưng chưa từng chỉnh sửa trong lịch sử hoặc chi tiết đơn hàng THEN hệ thống SHALL hiển thị đánh giá hiện tại và hành động chỉnh sửa.

3.2. WHEN chủ sở hữu cập nhật đánh giá lần đầu bằng dữ liệu hợp lệ THEN hệ thống SHALL thay thế số sao, nhận xét và danh sách tệp đính kèm theo nội dung đã gửi, ghi nhận quyền chỉnh sửa đã được sử dụng và thông báo cập nhật thành công.

3.3. IF người dùng không phải chủ sở hữu đánh giá THEN hệ thống SHALL không cho phép xem đánh giá qua ngữ cảnh đơn hàng riêng tư hoặc sửa đánh giá đó.

3.4. IF dữ liệu cập nhật không hợp lệ THEN hệ thống SHALL giữ nguyên đánh giá đã lưu và trả về lỗi theo từng trường như khi tạo mới.

3.5. IF việc tải lên hoặc lưu nội dung cập nhật thất bại THEN hệ thống SHALL giữ nguyên đánh giá công khai trước đó và không tính lần gửi thất bại là lần chỉnh sửa đã sử dụng.

3.6. IF đánh giá đã được cập nhật thành công một lần THEN hệ thống SHALL không hiển thị hành động chỉnh sửa và SHALL từ chối mọi yêu cầu cập nhật tiếp theo bằng lỗi xung đột.

3.7. WHEN khách hàng hoặc người dùng khác yêu cầu xóa đánh giá THEN hệ thống SHALL không cung cấp hoặc thực hiện hành động xóa.

3.8. IF dòng hàng đã được hoàn tiền sau khi đánh giá được tạo và đánh giá chưa từng chỉnh sửa THEN hệ thống SHALL tiếp tục cho phép chủ sở hữu sử dụng một lần chỉnh sửa trong order `partially_returned` hoặc `returned`.

### Yêu cầu 4: Hiển thị đánh giá trên trang sản phẩm

**User Story:** Là người xem sản phẩm, tôi muốn đọc đánh giá từ người đã mua, để có thêm thông tin trước khi quyết định mua hàng.

#### Tiêu chí chấp nhận

4.1. WHEN bất kỳ người dùng nào xem trang chi tiết một sản phẩm đang được công khai THEN hệ thống SHALL hiển thị điểm trung bình, tổng số đánh giá và danh sách đánh giá của sản phẩm từ dữ liệu thực tế.

4.2. WHEN sản phẩm chưa có đánh giá THEN hệ thống SHALL hiển thị trạng thái chưa có đánh giá, tổng số bằng 0 và không hiển thị điểm hoặc số lượng mẫu giả định.

4.3. WHEN sản phẩm có đánh giá THEN hệ thống SHALL tính điểm trung bình từ các đánh giá hiện có, làm tròn đến một chữ số thập phân.

4.4. WHEN hiển thị một đánh giá công khai THEN hệ thống SHALL hiển thị số sao, nhận xét nếu có, ngày đánh giá, phân loại đã mua, dấu hiệu "Đã mua hàng" và email đã che của khách hàng mà không để lộ email đầy đủ hoặc thông tin nhận hàng.

4.5. WHEN che email người đánh giá THEN hệ thống SHALL trích xuất canonical email address từ bare address hoặc display-name form được auth hiện hỗ trợ, giữ ký tự đầu tiên của phần trước `@`, thay phần còn lại bằng `***` và giữ nguyên domain; ví dụ `Tuoi Tho <tuoitho@gmail.com>` SHALL hiển thị thành `t***@gmail.com`.

4.6. WHEN đánh giá có ảnh hoặc video THEN hệ thống SHALL hiển thị các tệp theo đúng đánh giá, cho phép xem ảnh và điều khiển phát video mà không tự động phát âm thanh.

4.7. WHEN danh sách có nhiều hơn 10 đánh giá THEN hệ thống SHALL cho phép người xem tải các trang tiếp theo, mỗi trang tối đa 10 đánh giá và mặc định sắp xếp mới nhất trước.

4.8. IF việc tải danh sách đánh giá thất bại trong khi thông tin sản phẩm vẫn tải được THEN hệ thống SHALL giữ trang sản phẩm sử dụng được, hiển thị lỗi riêng tại khu vực đánh giá và cung cấp hành động thử lại.

4.9. IF một ảnh hoặc video riêng lẻ không tải được THEN hệ thống SHALL giữ phần còn lại của đánh giá sử dụng được và hiển thị trạng thái thay thế cho tệp bị lỗi.

4.10. WHEN một đánh giá được tạo hoặc cập nhật thành công THEN hệ thống SHALL phản ánh số liệu tổng hợp và nội dung mới nhất trong lần tải dữ liệu kế tiếp.

4.11. IF stored email không thể trích xuất thành canonical email address THEN hệ thống SHALL hiển thị `Khách hàng đã mua` thay cho email và SHALL không trả chuỗi email gốc trong public payload.

### Yêu cầu 5: Đồng bộ trạng thái chờ đánh giá

**User Story:** Là khách hàng, tôi muốn mục "Chờ đánh giá" phản ánh đúng phần việc còn lại, để dễ hoàn tất đánh giá sau khi nhận hàng.

#### Tiêu chí chấp nhận

5.1. WHEN khách hàng xem thống kê lịch sử mua hàng THEN hệ thống SHALL tính "Chờ đánh giá" là số order `delivered` hoặc `partially_returned` còn ít nhất một dòng hàng chưa được hoàn tiền và chưa được đánh giá.

5.2. WHEN khách hàng mở nhóm "Chờ đánh giá" THEN hệ thống SHALL hiển thị mọi order `delivered` hoặc `partially_returned` còn ít nhất một dòng hàng có thể đánh giá và chỉ rõ từng dòng hàng đang chờ đánh giá, đã đánh giá hoặc không còn đủ điều kiện do hoàn tiền.

5.3. WHEN dòng hàng cuối cùng chưa đánh giá trong một đơn được đánh giá thành công THEN hệ thống SHALL giảm số đơn "Chờ đánh giá" đi một.

5.4. WHEN đánh giá được chỉnh sửa THEN hệ thống SHALL không thay đổi số đơn "Chờ đánh giá".

5.5. WHEN refund hoàn tất cho một hoặc nhiều dòng hàng THEN hệ thống SHALL tính lại "Chờ đánh giá" theo các dòng chưa hoàn tiền còn lại; order SHALL rời số đếm khi không còn dòng hàng nào có thể đánh giá.

5.6. WHEN tính năng review được tích hợp THEN hệ thống SHALL giữ bucket `delivered` hiển thị mọi order `delivered`, bucket `returns` hiển thị `partially_returned`/`returned`, và SHALL cung cấp bộ lọc `reviewable` riêng cho nhóm "Chờ đánh giá".

### Yêu cầu 6: Phân quyền và tính toàn vẹn

**User Story:** Là khách hàng và người xem sản phẩm, tôi muốn đánh giá phản ánh giao dịch thật và được bảo vệ khỏi thay đổi trái phép, để có thể tin cậy nội dung hiển thị.

#### Tiêu chí chấp nhận

6.1. WHEN người chưa đăng nhập đọc đánh giá sản phẩm THEN hệ thống SHALL cho phép truy cập nội dung đánh giá công khai.

6.2. IF người chưa đăng nhập cố tạo hoặc cập nhật đánh giá THEN hệ thống SHALL yêu cầu đăng nhập và không lưu thay đổi.

6.3. WHEN tạo đánh giá THEN hệ thống SHALL xác định sản phẩm và chủ sở hữu từ dòng hàng đã mua thay vì tin vào thông tin sản phẩm hoặc người dùng do trình khách gửi lên.

6.4. IF hai yêu cầu đồng thời cố tạo đánh giá cho cùng một dòng hàng THEN hệ thống SHALL chỉ lưu một đánh giá và trả lỗi xung đột cho yêu cầu còn lại.

6.5. WHEN refund và tạo review cạnh tranh trên cùng dòng hàng THEN hệ thống SHALL tuần tự hóa theo current order/refunded-item state để không tạo review mới sau khi refund đã hoàn tất.

6.6. IF sản phẩm đã mua sau đó hết hàng nhưng vẫn có trang chi tiết công khai THEN hệ thống SHALL tiếp tục hiển thị và tiếp nhận đánh giá đủ điều kiện cho sản phẩm đó.

6.7. WHEN tiếp nhận tệp đính kèm THEN hệ thống SHALL xác minh loại tệp thực tế, từ chối nội dung không khớp định dạng được cho phép và không phục vụ tệp tải lên như nội dung thực thi.

6.8. WHEN trả về kết quả hoặc lỗi qua API THEN hệ thống SHALL giữ nguyên Full Status Envelope hiện có; thông báo lỗi nghiệp vụ SHALL bằng tiếng Việt.

### Yêu cầu 7: Trải nghiệm, khả năng truy cập và tương thích

**User Story:** Là khách hàng sử dụng các thiết bị và phương thức nhập liệu khác nhau, tôi muốn quy trình đánh giá rõ ràng và sử dụng được, để có thể hoàn thành mà không gặp trở ngại.

#### Tiêu chí chấp nhận

7.1. WHEN khách hàng sử dụng bàn phím THEN hệ thống SHALL cho phép mở biểu mẫu, chọn từ 1 đến 5 sao, nhập nhận xét, gửi và đóng biểu mẫu với chỉ báo focus nhìn thấy được.

7.2. WHEN trình đọc màn hình tiếp cận bộ chọn sao THEN hệ thống SHALL cung cấp tên và trạng thái lựa chọn có ý nghĩa mà không chỉ dựa vào màu sắc hoặc biểu tượng.

7.3. WHEN giao diện hiển thị ở chiều rộng 320 CSS pixel trở lên THEN hệ thống SHALL không tạo cuộn ngang ngoài chủ ý và SHALL giữ hành động gửi hoặc chỉnh sửa đánh giá có thể tiếp cận.

7.4. WHEN khu vực đánh giá đang tải hoặc đang gửi dữ liệu THEN hệ thống SHALL hiển thị trạng thái tiến trình và ngăn gửi lặp ngoài ý muốn.

7.5. WHEN tính năng được đưa vào sử dụng THEN hệ thống SHALL giữ nguyên hành vi hiện có của quy trình đặt hàng, thay đổi trạng thái đơn, trả hàng, giỏ hàng và yêu thích, ngoại trừ các thay đổi trạng thái đánh giá được quy định trong tài liệu này.

7.6. WHEN hiển thị ảnh đánh giá THEN hệ thống SHALL cung cấp mô tả truy cập phù hợp cho ảnh.

7.7. WHEN hiển thị video đánh giá THEN hệ thống SHALL cung cấp điều khiển phát có thể sử dụng bằng bàn phím.
