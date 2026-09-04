# Tài liệu yêu cầu: Nhắn tin hỗ trợ khách hàng và Quản trị viên kèm ngữ cảnh đơn hàng (Order Inquiry Messaging)

## Giới thiệu

Tính năng "Nhắn tin hỗ trợ khách hàng và Quản trị viên kèm ngữ cảnh đơn hàng" (Order Inquiry Messaging) cung cấp kênh trao đổi trực tiếp, thời gian thực (realtime) giữa khách hàng và nhân viên quản trị (Admin). 

Trên giao diện khách hàng, hệ thống cung cấp một nút chat nổi (floating widget) cố định ở góc dưới bên phải màn hình trên mọi trang để khách hàng có thể mở hộp thoại tin nhắn bất cứ lúc nào. Trong hộp thoại, khách hàng có thể theo dõi trạng thái hoạt động gần nhất của nhân viên hỗ trợ, trò chuyện trực tiếp, đính kèm tệp hình ảnh/video trực quan (như tình trạng sản phẩm lỗi, ảnh mở kiện hàng), hoặc đính kèm đơn hàng cụ thể (từ trang chi tiết đơn hàng hoặc bộ chọn đơn hàng trong khung chat) để làm rõ thông tin và xử lý thắc mắc nhanh chóng. 

Mọi tin nhắn và tệp đính kèm được lưu trữ bền vững trong cơ sở dữ liệu / dịch vụ lưu trữ đối tượng và truyền phát tức thời qua kết nối WebSocket hai chiều. Về phía ban quản trị, giao diện quản lý tin nhắn hỗ trợ xem danh sách hội thoại, hiển thị thẻ ngữ cảnh đơn hàng có liên kết điều hướng tới chi tiết đơn, xem ảnh/video trực tiếp và gửi phản hồi cho khách hàng theo thời gian thực.

## Yêu cầu

### Yêu cầu 1: Khởi tạo và xem hội thoại từ phía khách hàng (Customer Conversation Access & Floating Widget)

**User Story:** Là khách hàng đã đăng nhập, tôi muốn thấy nút chat ở góc dưới bên phải màn hình và mở hộp thoại tin nhắn với nhân viên hỗ trợ bất kỳ lúc nào, để xem lịch sử trò chuyện và biết được trạng thái hoạt động của tư vấn viên.

#### Tiêu chí chấp nhận

1.1. WHEN khách hàng truy cập bất kỳ trang nào trên giao diện cửa hàng THEN hệ thống SHALL hiển thị nút biểu tượng tin nhắn (inbox button) cố định tại góc dưới bên phải màn hình.
1.2. WHEN khách hàng nhấn vào nút biểu tượng tin nhắn THEN hệ thống SHALL mở hộp thoại trò chuyện nổi (chat popup/drawer) ở góc dưới bên phải màn hình mà không làm tải lại trang hiện tại.
1.3. WHEN khách hàng mở hộp thoại tin nhắn THEN hệ thống SHALL tải và hiển thị kênh hội thoại của khách hàng cùng toàn bộ lịch sử tin nhắn sắp xếp theo trình tự thời gian tăng dần.
1.4. WHEN khách hàng mở hộp thoại tin nhắn THEN hệ thống SHALL hiển thị thông tin tiêu đề gồm tên đội ngũ hỗ trợ và trạng thái hoạt động (online nếu có nhân viên quản trị đang trực tuyến, hoặc thời gian truy cập/hoạt động gần nhất ví dụ: "Hoạt động 5 phút trước").
1.5. IF khách hàng chưa từng gửi hoặc nhận tin nhắn nào trước đó THEN hệ thống SHALL hiển thị trạng thái hội thoại trống kèm thông điệp hướng dẫn bắt đầu cuộc trò chuyện.
1.6. IF người dùng chưa đăng nhập thực hiện thao tác mở khung chat hoặc gửi tin nhắn THEN hệ thống SHALL hiển thị thông báo yêu cầu đăng nhập và hướng dẫn đăng nhập.
1.7. WHEN khách hàng xem cuộc hội thoại có chứa tin nhắn chưa đọc gửi từ admin THEN hệ thống SHALL cập nhật trạng thái các tin nhắn đó thành đã đọc và xóa chỉ báo số tin nhắn chưa đọc (badge count).
1.8. WHEN khách hàng tải lại trang hoặc mở lại khung chat trên thiết bị bất kỳ sau khi đăng nhập THEN hệ thống SHALL bảo lưu toàn vẹn lịch sử tin nhắn trước đó của khách hàng.

---

### Yêu cầu 2: Gửi tin nhắn và đính kèm ngữ cảnh đơn hàng từ phía khách hàng (Customer Sending Message with Order Context)

**User Story:** Là khách hàng, tôi muốn gửi tin nhắn kèm thông tin đơn hàng cụ thể, để quản trị viên nắm bắt ngay bối cảnh đơn hàng mà tôi đang thắc mắc mà không cần tôi phải tự gõ lại mã đơn hay chi tiết sản phẩm.

#### Tiêu chí chấp nhận

2.1. WHEN khách hàng nhấn nút "Hỏi đáp về đơn hàng" từ trang chi tiết đơn hàng hoặc danh sách đơn hàng THEN hệ thống SHALL tự động mở hộp thoại tin nhắn ở góc dưới bên phải và gán đơn hàng tương ứng vào làm ngữ cảnh đính kèm sẵn sàng để gửi.
2.2. WHEN khách hàng đang mở hộp thoại tin nhắn và nhấn biểu tượng đính kèm đơn hàng THEN hệ thống SHALL hiển thị danh sách các đơn hàng đã đặt của chính khách hàng đó để khách hàng chọn 1 đơn hàng muốn đính kèm.
2.3. WHEN khách hàng chọn một đơn hàng từ danh sách THEN hệ thống SHALL hiển thị vùng xem trước của đơn hàng được đính kèm (gồm mã đơn hàng, ngày đặt, trạng thái đơn hàng, tổng tiền) ngay trên ô nhập tin nhắn và cho phép khách hàng gỡ bỏ đính kèm trước khi bấm gửi.
2.4. WHEN khách hàng gửi tin nhắn có đính kèm đơn hàng hợp lệ THEN hệ thống SHALL lưu trữ tin nhắn cùng tham chiếu đơn hàng vào cơ sở dữ liệu, đồng thời hiển thị trong luồng hội thoại một thẻ đơn hàng trực quan chứa: mã đơn hàng, ngày tạo, trạng thái hiện tại của đơn, tổng tiền, danh sách sản phẩm tóm tắt (tên sản phẩm, số lượng, ảnh đại diện) và nút liên kết mở trang chi tiết đơn hàng của khách hàng.
2.5. WHEN khách hàng gửi tin nhắn văn bản thông thường không đính kèm đơn hàng THEN hệ thống SHALL lưu và hiển thị tin nhắn dạng văn bản tiêu chuẩn.
2.6. IF nội dung tin nhắn rỗng (chỉ chứa khoảng trắng), không có đơn hàng đính kèm và không có tệp hình ảnh/video đính kèm THEN hệ thống SHALL từ chối gửi và thông báo lỗi yêu cầu nhập nội dung hoặc đính kèm đơn hàng / tệp phương tiện.
2.7. IF độ dài nội dung văn bản của tin nhắn vượt quá 2.000 ký tự THEN hệ thống SHALL từ chối gửi và hiển thị thông báo vượt quá độ dài tối đa cho phép.
2.8. IF khách hàng gửi yêu cầu đính kèm một mã đơn hàng không tồn tại hoặc không thuộc sở hữu của tài khoản khách hàng đó THEN hệ thống SHALL từ chối yêu cầu và trả về thông báo lỗi dữ liệu đơn hàng không hợp lệ.

---

### Yêu cầu 3: Quản lý danh sách hội thoại và tra cứu phía Quản trị viên (Admin Conversation Management)

**User Story:** Là quản trị viên cửa hàng, tôi muốn xem danh sách các cuộc hội thoại của khách hàng, lọc theo trạng thái và tìm kiếm, để tôi có thể phân loại và phản hồi kịp thời các yêu cầu cần hỗ trợ.

#### Tiêu chí chấp nhận

3.1. WHEN quản trị viên truy cập màn hình quản lý tin nhắn hỗ trợ THEN hệ thống SHALL hiển thị danh sách toàn bộ các cuộc hội thoại của khách hàng, sắp xếp theo thời điểm có tin nhắn mới nhất giảm dần.
3.2. WHEN hiển thị mỗi cuộc hội thoại trong danh sách THEN hệ thống SHALL cung cấp các thông tin: email/tên khách hàng, nội dung rút gọn của tin nhắn cuối cùng, thời gian của tin nhắn cuối cùng, trạng thái truy cập gần nhất của khách hàng, và số lượng tin nhắn chưa đọc từ khách hàng (nếu có).
3.3. WHEN quản trị viên nhấp chọn một cuộc hội thoại từ danh sách THEN hệ thống SHALL hiển thị luồng trao đổi chi tiết của cuộc hội thoại đó và đánh dấu các tin nhắn chưa đọc của khách hàng trong hội thoại này thành đã đọc bởi ban quản trị.
3.4. WHEN trong luồng trao đổi có tin nhắn đính kèm đơn hàng THEN hệ thống SHALL hiển thị thẻ tóm tắt đơn hàng (mã đơn, ngày đặt, trạng thái, tổng giá trị, sản phẩm) kèm nút liên kết chuyển tiếp trực tiếp sang trang chi tiết quản trị của đơn hàng đó.
3.5. WHEN quản trị viên nhập từ khóa tìm kiếm theo email khách hàng hoặc mã đơn hàng THEN hệ thống SHALL lọc danh sách hội thoại khớp với từ khóa tìm kiếm.
3.6. WHEN quản trị viên áp dụng bộ lọc trạng thái "Chưa đọc" THEN hệ thống SHALL chỉ hiển thị các cuộc hội thoại đang có tin nhắn mới từ khách hàng mà ban quản trị chưa xem.
3.7. IF người dùng không có vai trò quản trị viên (admin) cố gắng truy cập màn hình hoặc gọi các giao diện lập trình (API/WebSocket) quản lý tin nhắn hỗ trợ THEN hệ thống SHALL từ chối quyền truy cập và trả về mã lỗi không có quyền.

---

### Yêu cầu 4: Quản trị viên phản hồi tin nhắn khách hàng (Admin Message Reply)

**User Story:** Là quản trị viên, tôi muốn nhập câu trả lời trực tiếp trong cuộc hội thoại của khách hàng, để giải đáp các thắc mắc và hướng dẫn khách hàng xử lý vấn đề.

#### Tiêu chí chấp nhận

4.1. WHEN quản trị viên gửi nội dung phản hồi hợp lệ trong một cuộc hội thoại THEN hệ thống SHALL lưu tin nhắn với vai trò người gửi là admin vào cơ sở dữ liệu, cập nhật thời gian hoạt động mới nhất của cuộc hội thoại, và phát tin nhắn tức thời tới khách hàng qua kênh kết nối.
4.2. IF nội dung phản hồi của quản trị viên rỗng (chỉ chứa khoảng trắng) và không có tệp đính kèm THEN hệ thống SHALL từ chối gửi và thông báo yêu cầu nhập nội dung hoặc đính kèm tệp.
4.3. IF nội dung phản hồi của quản trị viên vượt quá 2.000 ký tự THEN hệ thống SHALL từ chối gửi và thông báo giới hạn ký tự.
4.4. WHEN một cuộc hội thoại được nhiều quản trị viên truy cập THEN bất kỳ quản trị viên hợp lệ nào cũng có thể gửi phản hồi tiếp nối vào cuộc trò chuyện mà không làm gián đoạn lịch sử trao đổi.
4.5. WHEN hiển thị tin nhắn từ phía ban quản trị trong giao diện khách hàng THEN hệ thống SHALL gắn nhãn định danh trực quan rõ ràng "Hỗ trợ viên" hoặc "Quản trị viên" để khách hàng nhận biết phản hồi chính thức từ cửa hàng.

---

### Yêu cầu 5: Đồng bộ thời gian thực qua WebSocket và Lưu trữ bền vững (Realtime WebSocket & Data Persistence)

**User Story:** Là người dùng (khách hàng hoặc quản trị viên), tôi muốn tin nhắn được truyền phát tức thời hai chiều qua WebSocket và được lưu trữ bền vững trong cơ sở dữ liệu, để cuộc trò chuyện diễn ra mượt mà và không bị thất lạc dữ liệu.

#### Tiêu chí chấp nhận

5.1. WHEN khách hàng hoặc quản trị viên kết nối vào hệ thống tin nhắn THEN hệ thống SHALL thiết lập kết nối WebSocket có xác thực danh tính bằng mã thông báo (token) hợp lệ.
5.2. WHEN một bên gửi tin nhắn THEN hệ thống SHALL ghi nhận tin nhắn vào cơ sở dữ liệu trước, sau đó phát (broadcast) sự kiện tin nhắn mới qua WebSocket đến bên nhận trong thời gian dưới 1 giây.
5.3. WHEN có tin nhắn mới gửi đến trong khi người dùng đang mở cuộc hội thoại và vị trí cuộn đang ở phía trên THEN hệ thống SHALL không tự động cuộn màn hình xuống dưới mà hiển thị nút thông báo nổi "X tin nhắn mới ↓".
5.4. WHEN người dùng nhấn vào nút thông báo "X tin nhắn mới ↓" (hoặc khi người dùng đang ở sẵn vị trí đáy của khung chat lúc tin nhắn đến) THEN hệ thống SHALL cuộn khung chat xuống vị trí tin nhắn mới nhất và cập nhật trạng thái đã đọc.
5.5. WHEN người dùng đang không mở hộp thoại tin nhắn nhưng có tin nhắn mới gửi đến THEN hệ thống SHALL phát tín hiệu qua WebSocket để cập nhật chỉ báo số lượng tin nhắn chưa đọc (unread badge) trên nút inbox góc dưới bên phải (phía khách hàng) hoặc thanh menu (phía quản trị viên).
5.6. WHEN người dùng kết nối, ngắt kết nối hoặc gửi tin nhắn THEN hệ thống SHALL cập nhật mốc thời gian hoạt động gần nhất (last active timestamp) để hiển thị trạng thái truy cập cho đối phương.
5.7. IF kết nối WebSocket bị gián đoạn vì lý do mạng THEN hệ thống SHALL tự động thử kết nối lại (auto-reconnect) theo chu kỳ lũy thừa (exponential backoff) và đồng bộ lại các tin nhắn mới nhất từ cơ sở dữ liệu khi kết nối thành công.
5.8. IF tin nhắn gửi đi thất bại do mất kết nối hoàn toàn THEN hệ thống SHALL hiển thị chỉ báo trạng thái gửi lỗi kèm nút bấm cho phép người dùng thử gửi lại (retry).

---

### Yêu cầu 6: Đính kèm hình ảnh và video trong tin nhắn (Media Attachments: Images & Videos)

**User Story:** Là người dùng (khách hàng hoặc quản trị viên), tôi muốn gửi kèm hình ảnh hoặc video trong tin nhắn, để cung cấp bằng chứng trực quan (ví dụ: sản phẩm bị trầy xước, sai mẫu, video mở hộp) giúp việc hỏi đáp và xử lý yêu cầu nhanh chóng, chính xác.

#### Tiêu chí chấp nhận

6.1. WHEN người dùng (khách hàng hoặc quản trị viên) nhấn biểu tượng đính kèm tệp phương tiện trong khung chat THEN hệ thống SHALL cho phép chọn tệp hình ảnh (định dạng: JPEG, PNG, WebP, GIF) hoặc tệp video (định dạng: MP4, WebM).
6.2. WHEN người dùng chọn tệp phương tiện hợp lệ THEN hệ thống SHALL hiển thị vùng xem trước (preview thumbnail) kèm nút gỡ bỏ trước khi bấm gửi.
6.3. WHEN người dùng gửi tin nhắn có đính kèm ảnh hoặc video THEN hệ thống SHALL lưu tệp vào dịch vụ lưu trữ đối tượng, lưu thông tin tệp (URL, loại phương tiện, kích thước) gắn liền với tin nhắn trong cơ sở dữ liệu, và phát tin nhắn qua WebSocket.
6.4. WHEN hiển thị tin nhắn chứa hình ảnh trong luồng chat THEN hệ thống SHALL hiển thị ảnh dạng thu nhỏ (thumbnail) và cho phép người dùng bấm vào để xem kích thước đầy đủ (lightbox preview).
6.5. WHEN hiển thị tin nhắn chứa video trong luồng chat THEN hệ thống SHALL hiển thị trình phát video (video player) cho phép phát/tạm dừng, điều chỉnh âm lượng và mở rộng toàn màn hình trực tiếp trong giao diện chat.
6.6. IF tệp hình ảnh vượt quá dung lượng 10MB hoặc tệp video vượt quá dung lượng 50MB THEN hệ thống SHALL từ chối tải tệp và hiển thị thông báo vượt quá giới hạn dung lượng cho phép.
6.7. IF người dùng chọn tệp không đúng định dạng ảnh hoặc video được hỗ trợ THEN hệ thống SHALL từ chối tiếp nhận và hiển thị thông báo định dạng không hợp lệ.
6.8. WHEN một tin nhắn kết hợp nội dung văn bản cùng với tệp phương tiện và/hoặc đơn hàng đính kèm THEN hệ thống SHALL hiển thị các thành phần một cách có thứ tự và thống nhất trong cùng một khối tin nhắn.
