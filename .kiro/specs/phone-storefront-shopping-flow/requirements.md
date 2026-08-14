# Tài liệu yêu cầu

## Giới thiệu

Feature này cung cấp khung giao diện cửa hàng điện thoại frontend cho khách truy cập, gồm điều hướng dùng chung, trang chủ, trang tìm kiếm, trang chi tiết sản phẩm và trang giỏ hàng. Người dùng có thể duyệt điện thoại theo hãng, chọn phân loại riêng của từng sản phẩm, thêm biến thể vào giỏ, thay đổi số lượng và chọn riêng từng dòng muốn mua.

Backend là nguồn sự thật cho dữ liệu điện thoại, hãng, phân loại, giá bằng Việt Nam Đồng, tồn kho và giỏ hàng. Khách có thể duyệt catalog công khai; giỏ hàng chỉ thuộc về tài khoản đã đăng nhập và được lưu trên backend. Phạm vi không bao gồm tạo đơn hàng, thanh toán, vận chuyển hoặc giao diện quản trị sản phẩm.

## Yêu cầu

### Yêu cầu 1: Khung cửa hàng và điều hướng

**User Story:** Là một khách truy cập, tôi muốn có khung giao diện và điều hướng nhất quán, để tôi có thể di chuyển giữa các chức năng mua sắm chính.

#### Tiêu chí chấp nhận

1.1 WHEN người dùng mở ứng dụng THEN hệ thống SHALL hiển thị phần đầu trang có liên kết đến trang chủ, trang tìm kiếm sản phẩm và giỏ hàng.

1.2 WHEN số lượng sản phẩm trong giỏ thay đổi THEN hệ thống SHALL hiển thị tổng số đơn vị sản phẩm hiện có trong giỏ tại khu vực điều hướng.

1.3 WHEN người dùng chọn một liên kết điều hướng THEN hệ thống SHALL mở đúng trang tương ứng mà không tải lại toàn bộ ứng dụng.

1.4 WHEN người dùng mở một địa chỉ trang không tồn tại THEN hệ thống SHALL hiển thị trạng thái không tìm thấy và cung cấp cách quay về trang chủ.

1.5 WHEN chiều rộng màn hình từ 320 px đến 767 px THEN hệ thống SHALL giữ các chức năng điều hướng chính sử dụng được mà không gây cuộn ngang toàn trang.

1.6 IF người dùng chưa đăng nhập chọn liên kết giỏ hàng THEN hệ thống SHALL chuyển tới trang đăng nhập và SHALL quay lại trang giỏ hàng sau khi đăng nhập thành công.

### Yêu cầu 2: Trang chủ

**User Story:** Là một khách truy cập, tôi muốn xem trang chủ có nội dung giới thiệu và điện thoại nổi bật, để tôi có điểm bắt đầu khi mua sắm.

#### Tiêu chí chấp nhận

2.1 WHEN người dùng mở trang chủ THEN hệ thống SHALL hiển thị khu vực giới thiệu cửa hàng điện thoại, lời kêu gọi khám phá sản phẩm và danh sách điện thoại nổi bật.

2.2 WHEN người dùng chọn lời kêu gọi khám phá sản phẩm THEN hệ thống SHALL mở trang tìm kiếm sản phẩm.

2.3 WHEN có điện thoại nổi bật THEN hệ thống SHALL hiển thị tối thiểu hãng, tên hoặc model, hình ảnh, khoảng giá, trạng thái còn hàng và hành động xem để chọn phân loại cho mỗi sản phẩm.

2.4 IF không có sản phẩm nổi bật THEN hệ thống SHALL hiển thị trạng thái trống có liên kết đến trang tìm kiếm sản phẩm.

### Yêu cầu 3: Tìm kiếm và duyệt sản phẩm

**User Story:** Là một khách truy cập, tôi muốn tìm kiếm và duyệt điện thoại theo hãng, để tôi có thể tìm thiết bị phù hợp.

#### Tiêu chí chấp nhận

3.1 WHEN người dùng mở trang tìm kiếm mà chưa nhập từ khóa hoặc bộ lọc THEN hệ thống SHALL hiển thị danh sách tất cả điện thoại khả dụng để duyệt.

3.2 WHEN người dùng nhập từ khóa tìm kiếm THEN hệ thống SHALL hiển thị các điện thoại có tên, model hoặc hãng khớp từ khóa mà không phân biệt chữ hoa và chữ thường.

3.3 WHEN từ khóa tìm kiếm thay đổi THEN hệ thống SHALL phản ánh từ khóa hiện tại trên địa chỉ trang để trạng thái tìm kiếm có thể được tải lại hoặc chia sẻ.

3.4 WHEN địa chỉ trang chứa từ khóa tìm kiếm THEN hệ thống SHALL khôi phục từ khóa và kết quả tương ứng khi trang được mở trực tiếp hoặc tải lại.

3.5 IF không có điện thoại khớp từ khóa và bộ lọc THEN hệ thống SHALL hiển thị trạng thái không có kết quả và một hành động xóa toàn bộ tiêu chí.

3.6 WHEN hệ thống đang lấy dữ liệu sản phẩm THEN hệ thống SHALL hiển thị trạng thái đang tải thay cho kết quả cũ không còn phù hợp.

3.7 IF việc lấy dữ liệu sản phẩm thất bại THEN hệ thống SHALL hiển thị thông báo lỗi và hành động thử lại.

3.8 WHEN có kết quả THEN hệ thống SHALL hiển thị tổng số kết quả và tối thiểu hãng, tên hoặc model, hình ảnh, khoảng giá, trạng thái còn hàng và hành động xem để chọn phân loại cho mỗi điện thoại.

3.9 WHEN người dùng mở bộ lọc danh mục THEN hệ thống SHALL lấy và hiển thị các hãng điện thoại từ backend, bao gồm Apple và Xiaomi trong bộ dữ liệu ban đầu.

3.10 WHEN người dùng chọn một hoặc nhiều hãng THEN hệ thống SHALL chỉ hiển thị điện thoại thuộc các hãng đã chọn và kết hợp điều kiện này với từ khóa hiện tại.

3.11 WHEN lựa chọn hãng thay đổi THEN hệ thống SHALL phản ánh các hãng đang chọn trên địa chỉ trang để bộ lọc có thể được tải lại hoặc chia sẻ.

3.12 WHEN địa chỉ trang chứa các hãng hợp lệ THEN hệ thống SHALL khôi phục lựa chọn hãng và kết quả tương ứng khi trang được mở trực tiếp hoặc tải lại.

3.13 WHEN frontend yêu cầu danh sách hãng, danh sách điện thoại hoặc chi tiết điện thoại mà không có phiên đăng nhập THEN backend SHALL trả dữ liệu catalog công khai mà không yêu cầu thông tin xác thực.

3.14 WHEN người dùng áp dụng giá tối thiểu, giá tối đa hoặc trạng thái còn hàng THEN hệ thống SHALL giữ các tiêu chí đó trên địa chỉ trang và SHALL lọc điện thoại theo các biến thể đang bán: một điện thoại khớp khoảng giá khi có ít nhất một biến thể có giá trong khoảng, và khớp trạng thái còn hàng khi có ít nhất một biến thể có tồn kho lớn hơn 0. Giá tối thiểu và tối đa SHALL là chuỗi số nguyên thập phân không âm theo biểu diễn canonical, không có dấu, số 0 đứng đầu, phân cách nhóm hoặc phần thập phân; giá trị không hợp lệ SHALL trả lỗi filter validation.

### Yêu cầu 4: Thêm sản phẩm vào giỏ hàng

**User Story:** Là một khách truy cập, tôi muốn thêm sản phẩm vào giỏ, để tôi có thể chuẩn bị các mặt hàng muốn mua.

#### Tiêu chí chấp nhận

4.1 WHEN người dùng đã chọn đủ giá trị cho mọi nhóm phân loại bắt buộc và tổ hợp tương ứng còn hàng rồi chọn thêm vào giỏ THEN hệ thống SHALL thêm đúng biến thể với số lượng 1 và xác nhận trực quan rằng thao tác đã thành công.

4.2 WHEN người dùng thêm một biến thể đã có trong giỏ THEN hệ thống SHALL tăng số lượng của dòng biến thể đó thêm 1 thay vì tạo dòng trùng lặp.

4.3 IF biến thể đã chọn hết hàng THEN hệ thống SHALL vô hiệu hóa hành động thêm vào giỏ và SHALL không thay đổi giỏ hàng.

4.4 IF việc thêm một đơn vị làm số lượng vượt quá tồn kho của biến thể đã chọn THEN hệ thống SHALL giữ nguyên số lượng và thông báo rằng đã đạt giới hạn tồn kho.

4.5 WHEN người dùng tải lại ứng dụng trong cùng trình duyệt THEN hệ thống SHALL khôi phục nội dung, số lượng và trạng thái chọn của giỏ hàng gần nhất.

4.6 IF người dùng chưa chọn đủ các nhóm phân loại bắt buộc THEN hệ thống SHALL không thêm sản phẩm và SHALL chỉ rõ các nhóm cần chọn.

4.7 WHEN người dùng thêm hai biến thể khác nhau của cùng một điện thoại THEN hệ thống SHALL tạo hai dòng giỏ hàng riêng biệt.

4.8 IF người dùng chưa đăng nhập chọn thêm vào giỏ THEN hệ thống SHALL chuyển tới trang đăng nhập, SHALL quay lại đúng trang chi tiết cùng các lựa chọn phân loại hiện tại sau khi đăng nhập thành công và SHALL yêu cầu người dùng xác nhận lại thao tác thêm.

4.9 WHEN backend nhận yêu cầu thêm biến thể vào giỏ THEN backend SHALL lấy tên, giá và tồn kho hiện tại từ catalog bằng mã biến thể thay vì tin cậy dữ liệu sản phẩm do frontend gửi.

4.10 IF mã biến thể không tồn tại hoặc không còn khả dụng THEN backend SHALL từ chối yêu cầu thêm, giữ nguyên giỏ và trả lỗi có thể phân biệt với lỗi xác thực và lỗi giới hạn tồn kho.

### Yêu cầu 5: Quản lý giỏ hàng

**User Story:** Là một khách truy cập, tôi muốn xem và chỉnh sửa giỏ hàng, để giỏ phản ánh đúng các mặt hàng tôi đang cân nhắc mua.

#### Tiêu chí chấp nhận

5.1 WHEN giỏ hàng có sản phẩm THEN hệ thống SHALL hiển thị mỗi dòng với trạng thái chọn, hình ảnh, hãng, tên hoặc model, toàn bộ giá trị phân loại đã chọn, số lượng và hành động xóa; IF dòng còn khả dụng THEN hệ thống SHALL hiển thị đơn giá và thành tiền, ELSE hệ thống SHALL hiển thị trạng thái không còn khả dụng thay cho giá.

5.2 WHEN người dùng tăng hoặc giảm số lượng trong giới hạn từ 1 đến tồn kho hiện có THEN hệ thống SHALL lưu số lượng mới trên backend, sau đó cập nhật thành tiền của dòng và tổng số đơn vị trong điều hướng từ phản hồi đã xác nhận.

5.3 IF người dùng cố giảm số lượng xuống dưới 1 hoặc tăng vượt tồn kho THEN hệ thống SHALL giữ nguyên số lượng và hiển thị lý do thao tác không được áp dụng.

5.4 WHEN người dùng xóa một dòng sản phẩm THEN hệ thống SHALL loại bỏ dòng đó khỏi giỏ và cập nhật các tổng liên quan.

5.5 IF giỏ hàng không có sản phẩm THEN hệ thống SHALL hiển thị trạng thái giỏ trống và hành động tiếp tục mua sắm dẫn đến trang tìm kiếm sản phẩm.

5.6 WHEN người dùng đăng nhập trên một phiên trình duyệt khác bằng cùng tài khoản THEN hệ thống SHALL tải cùng nội dung và trạng thái chọn của giỏ hàng đã lưu trên backend.

5.7 IF thao tác tải hoặc chỉnh sửa giỏ thất bại do lỗi tạm thời THEN hệ thống SHALL giữ trạng thái đã được backend xác nhận gần nhất, hiển thị lỗi và cung cấp hành động thử lại phù hợp.

5.8 IF phiên đăng nhập hết hạn và không thể làm mới khi đang thao tác giỏ THEN hệ thống SHALL chuyển người dùng tới đăng nhập và SHALL không hiển thị thao tác thất bại như đã lưu thành công.

5.9 IF một sản phẩm hoặc biến thể trong giỏ không còn tồn tại hoặc không còn được bán THEN hệ thống SHALL giữ dòng với thông tin nhận diện gần nhất, hiển thị trạng thái không còn khả dụng, bỏ chọn dòng và chỉ cho phép người dùng xóa dòng đó.

5.10 IF tồn kho hiện tại của biến thể bằng 0 THEN hệ thống SHALL giữ dòng và số lượng hiện có, hiển thị trạng thái hết hàng, bỏ chọn dòng và chỉ cho phép người dùng xóa dòng đó.

5.11 IF số lượng trong giỏ lớn hơn tồn kho hiện tại nhưng tồn kho vẫn lớn hơn 0 THEN hệ thống SHALL giữ nguyên số lượng, hiển thị số lượng tối đa hiện có, bỏ chọn dòng và chỉ cho phép người dùng giảm số lượng xuống một giá trị hợp lệ hoặc xóa dòng.

5.12 WHEN người dùng giảm một dòng thiếu tồn kho xuống số lượng từ 1 đến tồn kho hiện tại THEN hệ thống SHALL xóa trạng thái lỗi của dòng nhưng SHALL giữ dòng ở trạng thái chưa chọn cho đến khi người dùng chủ động chọn lại.

### Yêu cầu 6: Chọn sản phẩm muốn mua

**User Story:** Là một khách truy cập, tôi muốn tích chọn riêng từng dòng trong giỏ, để phần tổng kết chỉ bao gồm các sản phẩm tôi muốn mua lúc này.

#### Tiêu chí chấp nhận

6.1 WHEN một sản phẩm được thêm mới vào giỏ THEN hệ thống SHALL đặt dòng sản phẩm đó ở trạng thái được chọn.

6.2 WHEN người dùng thay đổi ô chọn của một dòng THEN hệ thống SHALL lưu trạng thái chọn mới trên backend và SHALL chỉ thay đổi trạng thái chọn của dòng đó.

6.3 WHEN người dùng chọn tất cả THEN hệ thống SHALL lưu trạng thái được chọn cho mọi dòng có thể mua và SHALL giữ các dòng không còn khả dụng, hết hàng hoặc vượt tồn kho ở trạng thái chưa chọn; WHEN người dùng bỏ chọn tất cả THEN hệ thống SHALL lưu trạng thái chưa chọn cho mọi dòng.

6.4 WHEN trạng thái chọn hoặc số lượng thay đổi THEN hệ thống SHALL hiển thị số dòng được chọn và tổng tiền chỉ của các dòng vừa được chọn vừa hợp lệ để mua.

6.5 IF không có dòng nào được chọn THEN hệ thống SHALL hiển thị tổng tiền bằng 0 và vô hiệu hóa hành động tiếp tục mua.

6.6 IF có ít nhất một dòng được chọn THEN hệ thống SHALL cho phép hành động tiếp tục mua và SHALL thể hiện rõ rằng bước tạo đơn hàng, thanh toán chưa thuộc phạm vi hiện tại.

### Yêu cầu 7: Hiển thị giá, khả năng truy cập và responsive

**User Story:** Là một khách truy cập sử dụng thiết bị hoặc phương thức tương tác khác nhau, tôi muốn giao diện rõ ràng và thao tác được, để tôi có thể sử dụng luồng mua sắm.

#### Tiêu chí chấp nhận

7.1 WHEN hệ thống hiển thị giá hoặc tổng tiền THEN hệ thống SHALL sử dụng giá nguồn bằng Việt Nam Đồng, định dạng theo locale `vi-VN`, hiển thị ký hiệu `₫` và không hiển thị chữ số thập phân; hệ thống SHALL không tự quy đổi từ đơn vị tiền khác.

7.2 WHEN người dùng chỉ sử dụng bàn phím THEN hệ thống SHALL cho phép tiếp cận và kích hoạt mọi liên kết, nút, ô tìm kiếm, điều khiển số lượng và ô chọn bằng thứ tự focus hợp lý với chỉ báo focus nhìn thấy được.

7.3 WHEN một hình ảnh sản phẩm được hiển thị THEN hệ thống SHALL cung cấp nội dung thay thế mô tả sản phẩm; IF hình ảnh không tải được THEN hệ thống SHALL giữ lại tên sản phẩm và các hành động liên quan.

7.4 WHEN trạng thái giỏ hàng hoặc kết quả tìm kiếm thay đổi do thao tác của người dùng THEN hệ thống SHALL cung cấp phản hồi có thể nhận biết mà không chỉ dựa vào màu sắc.

7.5 WHEN giao diện được hiển thị ở chiều rộng từ 320 px trở lên THEN hệ thống SHALL không che khuất nội dung, điều khiển chính hoặc gây cuộn ngang toàn trang.

### Yêu cầu 8: Chi tiết và phân loại sản phẩm

**User Story:** Là một khách truy cập, tôi muốn xem chi tiết và chọn phân loại phù hợp của điện thoại, để tôi thêm đúng biến thể muốn mua vào giỏ.

#### Tiêu chí chấp nhận

8.1 WHEN người dùng mở một điện thoại hợp lệ THEN hệ thống SHALL hiển thị hãng, tên hoặc model, hình ảnh, mô tả và các nhóm phân loại do sản phẩm đó định nghĩa.

8.2 WHEN một sản phẩm định nghĩa các nhóm phân loại khác nhau như dung lượng, màu sắc hoặc phiên bản mạng THEN hệ thống SHALL hiển thị đúng nhãn và tập giá trị của từng nhóm mà không yêu cầu mọi sản phẩm có cùng nhóm.

8.3 WHEN người dùng chọn các giá trị phân loại THEN hệ thống SHALL xác định tổ hợp biến thể tương ứng và cập nhật giá, trạng thái tồn kho cùng số lượng tồn kho được hiển thị.

8.4 IF một giá trị không thể kết hợp với các lựa chọn hiện tại thành bất kỳ biến thể nào THEN hệ thống SHALL vô hiệu hóa giá trị đó và SHALL không cho phép tạo tổ hợp không hợp lệ.

8.5 WHEN trang chi tiết mới được mở THEN hệ thống SHALL yêu cầu người dùng chủ động chọn đủ các nhóm bắt buộc trước khi thêm vào giỏ.

8.6 IF địa chỉ trang chi tiết không tương ứng với sản phẩm hiện có THEN hệ thống SHALL hiển thị trạng thái không tìm thấy và hành động quay về trang tìm kiếm.

8.7 WHEN frontend yêu cầu chi tiết một điện thoại THEN backend SHALL trả các nhóm phân loại, giá trị phân loại và toàn bộ biến thể hợp lệ với giá VND cùng tồn kho hiện tại.

8.8 WHEN backend trả một điện thoại THEN backend SHALL chỉ trả các biến thể có đúng một giá trị thuộc mỗi nhóm phân loại bắt buộc và SHALL không trả hai biến thể có cùng một tổ hợp giá trị.

### Yêu cầu 9: API và lưu trữ giỏ hàng theo tài khoản

**User Story:** Là một người dùng đã đăng nhập, tôi muốn giỏ hàng được backend lưu an toàn theo tài khoản, để dữ liệu nhất quán giữa các phiên và thiết bị.

#### Tiêu chí chấp nhận

9.1 WHEN người dùng đã đăng nhập yêu cầu giỏ hàng THEN backend SHALL chỉ trả các dòng giỏ thuộc tài khoản được xác định từ access token hợp lệ.

9.2 IF yêu cầu đọc hoặc thay đổi giỏ không có access token hợp lệ THEN backend SHALL trả trạng thái không được xác thực theo error envelope hiện có và SHALL không đọc hoặc thay đổi giỏ của bất kỳ tài khoản nào.

9.3 WHEN người dùng thêm một biến thể chưa có trong giỏ THEN backend SHALL tạo một dòng có số lượng 1 và trạng thái được chọn.

9.4 WHEN người dùng thêm một biến thể đã có trong giỏ THEN backend SHALL tăng nguyên tử số lượng của dòng đó thêm 1 nếu kết quả không vượt tồn kho hiện tại.

9.5 WHEN người dùng đặt số lượng hợp lệ, đổi trạng thái chọn, chọn tất cả, bỏ chọn tất cả hoặc xóa dòng THEN backend SHALL lưu thay đổi và trả trạng thái giỏ mới nhất của tài khoản.

9.6 IF số lượng yêu cầu nhỏ hơn 1 hoặc lớn hơn tồn kho hiện tại THEN backend SHALL từ chối thay đổi, giữ nguyên dòng và trả lỗi validation hoặc giới hạn tồn kho có mã ổn định.

9.7 IF người dùng tham chiếu một dòng giỏ không tồn tại hoặc thuộc tài khoản khác THEN backend SHALL trả trạng thái không tìm thấy mà không tiết lộ dòng đó có thuộc tài khoản khác hay không.

9.8 WHEN nhiều yêu cầu thêm cùng một biến thể được xử lý đồng thời cho một tài khoản THEN backend SHALL không tạo dòng trùng lặp, không mất lần tăng đã thành công và không lưu số lượng vượt tồn kho hiện tại.

9.9 WHEN backend trả giỏ hàng THEN backend SHALL lấy dữ liệu từ catalog hiện tại và SHALL trả đủ hãng, tên hoặc model, hình ảnh, phân loại, số lượng, tồn kho cùng trạng thái chọn; IF dòng có trạng thái `available` hoặc `insufficient_stock` THEN backend SHALL trả đơn giá hiện tại cùng thành tiền, ELSE backend SHALL không trả đơn giá hoặc thành tiền cho dòng.

9.10 WHEN giá của biến thể thay đổi sau khi được thêm vào giỏ THEN backend SHALL trả giá mới nhất ở lần đọc hoặc thay đổi giỏ tiếp theo và SHALL dùng giá mới nhất để tính thành tiền.

9.11 IF sản phẩm hoặc biến thể của một dòng giỏ bị xóa hoặc ngừng bán THEN backend SHALL giữ snapshot nhận diện gần nhất của dòng, lưu dòng ở trạng thái chưa chọn, trả trạng thái `unavailable` ổn định và SHALL từ chối mọi thao tác trên dòng ngoại trừ xóa.

9.12 IF tồn kho của một dòng giảm xuống 0 THEN backend SHALL giữ số lượng hiện có, lưu dòng ở trạng thái chưa chọn, trả trạng thái `out_of_stock` ổn định và SHALL từ chối mọi thao tác trên dòng ngoại trừ xóa.

9.13 IF số lượng của dòng lớn hơn tồn kho hiện tại nhưng tồn kho lớn hơn 0 THEN backend SHALL giữ số lượng hiện có, lưu dòng ở trạng thái chưa chọn, trả trạng thái `insufficient_stock` cùng tồn kho hiện tại và SHALL chỉ chấp nhận đặt số lượng mới trong khoảng từ 1 đến tồn kho hiện tại hoặc xóa dòng.

9.14 WHEN một dòng `insufficient_stock` được giảm xuống số lượng hợp lệ THEN backend SHALL trả dòng ở trạng thái `available` nhưng chưa chọn.

9.15 WHEN backend xử lý chọn một dòng hoặc chọn tất cả THEN backend SHALL không cho phép chọn dòng có trạng thái khác `available`; thao tác chọn tất cả SHALL bỏ qua các dòng không thể mua và SHALL trả toàn bộ trạng thái giỏ sau thao tác.

9.16 WHEN backend trả tổng kết giỏ THEN backend SHALL chỉ tính số dòng chọn và tổng tiền từ các dòng có trạng thái `available` và được chọn.

### Yêu cầu 10: Tính toàn vẹn và tương thích của catalog backend

**User Story:** Là người vận hành cửa hàng, tôi muốn backend duy trì dữ liệu điện thoại và biến thể hợp lệ, để frontend và giỏ hàng luôn dùng cùng một nguồn dữ liệu đáng tin cậy.

#### Tiêu chí chấp nhận

10.1 WHEN dữ liệu catalog ban đầu được nạp THEN backend SHALL lưu tối thiểu các hãng Apple và Xiaomi, nhiều mẫu điện thoại, nhiều cấu trúc nhóm phân loại, giá nguyên dương bằng VND, cùng cả biến thể còn hàng và hết hàng.

10.2 IF giá không phải số nguyên dương bằng VND hoặc tồn kho không phải số nguyên không âm trong miền `int64` không âm THEN backend SHALL từ chối lưu dữ liệu biến thể không hợp lệ; giá vẫn hỗ trợ miền tối đa 38 chữ số thập phân.

10.3 IF một biến thể thiếu nhóm phân loại bắt buộc, chứa giá trị không thuộc nhóm tương ứng hoặc trùng tổ hợp với biến thể khác của cùng sản phẩm THEN backend SHALL từ chối trạng thái dữ liệu không hợp lệ.

10.4 WHEN frontend sử dụng các API catalog và auth hiện có không thuộc phần contract được mở rộng bởi feature này THEN backend SHALL giữ nguyên error envelope, cơ chế access token/refresh và các đường dẫn API hiện hữu.

10.5 WHEN backend liệt kê điện thoại theo từ khóa và nhiều hãng THEN backend SHALL áp dụng so khớp không phân biệt hoa thường trên hãng, tên và model, dùng điều kiện OR giữa các hãng và AND giữa tập hãng với từ khóa.

10.6 IF một mã hãng trong bộ lọc không tồn tại THEN backend SHALL bỏ qua mã đó; IF không còn mã hãng hợp lệ THEN backend SHALL chỉ áp dụng các tiêu chí hợp lệ còn lại.
