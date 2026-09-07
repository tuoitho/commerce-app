# Yêu Cầu Tính Năng Nhắn Tin Hỗ Trợ Đính Kèm Ngữ Cảnh Đơn Hàng

## Bối Cảnh

Khách hàng khi mua sắm và theo dõi đơn hàng thường phát sinh các thắc mắc (về thời gian giao, thay đổi địa chỉ, khiếu nại sản phẩm, kiểm tra tình trạng hàng...). Hiện tại, việc hỗ trợ cần diễn ra tập trung, liền mạch trong một luồng trao đổi duy nhất giữa khách hàng và ban quản trị (Admin), đồng thời cho phép khách hàng chia sẻ thông tin đơn hàng cụ thể vào cuộc trò chuyện mà không phải phân tách thành nhiều cuộc hội thoại rời rạc theo từng đơn hàng.

Tính năng "Nhắn tin hỗ trợ đính kèm ngữ cảnh đơn hàng" (Order-Context Support Chat) cung cấp kênh trao đổi 1-1 duy nhất giữa mỗi khách hàng và ban quản trị cửa hàng:
- Giữa mỗi khách hàng và admin chỉ có **duy nhất một cuộc hội thoại** xuyên suốt lịch sử tương tác.
- Khách hàng có thể mở hộp thoại chat thuận tiện từ ô inbox nổi (floating chat bubble) ở góc dưới bên phải màn hình trên toàn trang hoặc trực tiếp từ trang chi tiết đơn hàng.
- Ngữ cảnh đơn hàng được xử lý linh hoạt: khách hàng hoặc admin có thể **đính kèm đơn hàng như một tin nhắn thẻ đơn hàng** (Order Context Card Message) trực tiếp vào dòng thời gian hội thoại, không tạo hội thoại riêng cho từng đơn hàng.
- Tối ưu trải nghiệm tải và hiển thị tin nhắn: khi mở hội thoại chỉ nạp trước **X tin nhắn gần nhất**, người dùng cuộn lên trên đỉnh (scroll up) mới tải thêm các tin nhắn cũ hơn.
- Trải nghiệm nhận tin nhắn thông minh: khi người dùng đang xem các tin nhắn cũ (không ở vị trí mới nhất dưới đáy), nếu có tin nhắn mới đến, hệ thống giữ nguyên vị trí đọc và hiển thị chỉ báo **"Có X tin mới"**, cho phép nhấp vào để tự động cuộn xuống dưới cùng.
- Cho phép gửi tệp tin đa phương tiện (ảnh, video, dán ảnh trực tiếp từ clipboard) bên cạnh tin nhắn văn bản để minh họa rõ nét tình trạng hàng hóa hoặc chứng từ.
- Hiển thị trạng thái hoạt động trực tuyến ("Đang hoạt động", "Vừa xong", hoặc "Hoạt động X phút trước") để người dùng nắm bắt tính khả dụng của đối phương.
- Quản trị viên quản lý danh sách hội thoại tập trung (mỗi khách hàng một hội thoại), theo dõi số tin chưa đọc và phản hồi kịp thời.

## Định Nghĩa Miền

- **Cuộc hội thoại (Conversation)**: Phiên trao đổi tin nhắn 1-1 duy nhất và liên tục giữa một khách hàng cụ thể (`customer`) và ban quản trị (`admin`). Mỗi khách hàng chỉ có duy nhất một bản ghi cuộc hội thoại trong toàn bộ hệ thống.
- **Tin nhắn (Message)**: Đơn vị trao đổi trong cuộc hội thoại do Khách hàng hoặc Quản trị viên gửi, gồm 3 phân loại nội dung:
  1. *Tin nhắn văn bản thuần (Text Message)*: Nội dung chữ.
  2. *Tin nhắn đa phương tiện (Media Message)*: Tin nhắn kèm ảnh hoặc video hoặc ảnh dán từ clipboard.
  3. *Tin nhắn đính kèm đơn hàng (Order Context Message)*: Tin nhắn chứa thông tin snapshot đơn hàng hợp lệ của khách hàng để làm ngữ cảnh trao đổi.
- **Tin nhắn đính kèm đơn hàng (Order Context Message / Order Card)**: Thẻ thông tin đơn hàng được gửi vào dòng thời gian chat như một tin nhắn độc lập, hiển thị mã đơn, trạng thái, ngày đặt, tổng tiền, tóm tắt sản phẩm và nút chuyển hướng đến trang chi tiết đơn hàng (`/orders/:id` hoặc `/admin/orders/:id`).
- **Phân trang cuộn ngược (Reverse Infinite Scroll / Load On Scroll Up)**: Cơ chế phân trang tin nhắn theo hướng thời gian ngược: khi mở hội thoại chỉ tải X tin nhắn gần nhất (mặc định X = 20 tin). Khi người dùng cuộn lên đỉnh khung chat, hệ thống gửi yêu cầu lấy X tin nhắn cũ hơn trước mốc thời gian của tin nhắn cũ nhất hiện có và duy trì vị trí hiển thị cuộn mượt mà.
- **Chỉ báo tin mới khi xem tin cũ (New Message Indicator / Jump-to-Bottom)**: Nút hoặc thanh thông báo nổi xuất hiện khi người dùng đang cuộn xem lịch sử tin nhắn cũ (vị trí scroll cách đáy một khoảng ngưỡng) mà có tin nhắn mới phát sinh. Chỉ báo hiển thị "Có X tin mới" (với X tăng dần theo số tin mới nhận) và khi nhấp vào sẽ tự động cuộn xuống đáy màn hình chat, đồng thời ẩn chỉ báo.
- **Tệp tin đa phương tiện tin nhắn (Message Media)**: Ảnh (JPEG, PNG, WEBP dung lượng tối đa 10MB) hoặc video (MP4, WEBM dung lượng tối đa 50MB) được tải lên hoặc dán từ clipboard (`Ctrl+V`) và đính kèm vào tin nhắn.
- **Ô inbox nổi (Floating Chat Bubble/Widget)**: Nút biểu tượng cố định ở góc dưới bên phải màn hình trên cổng khách hàng, cho phép mở nhanh cửa sổ trò chuyện với admin mà không làm gián đoạn luồng duyệt web.
- **Trạng thái hoạt động (Activity Status / Online Presence)**: Thời điểm hoạt động gần nhất (`last_active_at`) của người dùng trong hệ thống chat, được hiển thị dưới dạng thân thiện: "Đang hoạt động" (trong vòng 2 phút), "Vừa xong", hoặc "Hoạt động X phút trước" / "Hoạt động X giờ trước".
- **Chủ sở hữu đơn hàng (Order Ownership)**: Đơn hàng hợp lệ mà khách hàng đang đăng nhập sở hữu (`order.user_id == current_user.id`). Khách hàng chỉ có thể đính kèm đơn hàng của chính mình.

## Phạm Vi

### Trong Phạm Vi

- Duy trì mô hình duy nhất một cuộc hội thoại 1-1 giữa mỗi khách hàng và ban quản trị (không phân mảnh hội thoại theo đơn hàng).
- Ô inbox nổi (Floating Chat Widget) cố định ở góc dưới bên phải màn hình khách hàng để mở nhanh hộp thoại chat với admin.
- Khả năng đính kèm đơn hàng như một tin nhắn thẻ đơn hàng vào cuộc trò chuyện:
  - Khi bấm nút "Hỏi về đơn hàng này" từ trang chi tiết đơn hàng (`/orders/:id`): Mở khung chat và tự động gợi ý/gửi thẻ đính kèm đơn hàng đó vào hội thoại.
  - Nút "Đính kèm đơn hàng" ngay trong giao diện chat: Cho phép khách hàng chọn một đơn hàng từ danh sách đơn hàng của chính mình để gửi vào hội thoại.
- Tải phân trang tin nhắn khi mở hội thoại: Mặc định chỉ tải X tin nhắn gần nhất (X = 20); cuộn lên trên đỉnh khung chat để tải tiếp các tin nhắn cũ hơn mà không làm giật vị trí hiển thị.
- Chỉ báo tin nhắn mới khi xem tin cũ: Hiển thị thông báo "Có X tin mới" khi đang cuộn xem tin cũ và có tin mới đến qua WebSocket; cho phép nhấp vào để tự động cuộn xuống đáy. Tự động ẩn chỉ báo khi người dùng tự cuộn xuống đáy.
- Gửi và nhận tin nhắn văn bản và tệp tin đa phương tiện (ảnh JPEG/PNG/WEBP, video MP4/WEBM, dán ảnh clipboard `Ctrl+V`).
- Hiển thị trạng thái hoạt động của đối phương trong khung chat ("Đang hoạt động" / "Vừa xong" / "Hoạt động X phút/giờ trước").
- Đánh dấu tin nhắn đã đọc khi đối phương mở cuộc hội thoại.
- Trang quản trị danh sách hội thoại tập trung (`/admin/messages`): Mỗi dòng đại diện cho một khách hàng, hiển thị số tin chưa đọc, tin nhắn mới nhất và thời điểm hoạt động; xem lịch sử tin nhắn bao gồm các thẻ đơn hàng đã đính kèm.

### Ngoài Phạm Vi

- Cuộc gọi thoại hoặc gọi video trực tuyến (voice/video call).
- Chat nhóm nhiều khách hàng hoặc nhiều phòng ban khác nhau.
- Tích hợp chatbot AI trả lời tự động hoặc webhook chuyển tiếp tin nhắn sang nền tảng bên thứ ba (Telegram, Facebook Messenger, Zalo).
- Thu hồi hoặc chỉnh sửa nội dung tin nhắn sau khi đã gửi thành công.

---

## Yêu Cầu

### REQ-CHAT-01 — Mô Hình Hội Thoại Duy Nhất Và Đính Kèm Đơn Hàng Như Một Tin Nhắn

**Câu Chuyện Người Dùng**
Là một khách hàng,
tôi muốn chỉ có một cuộc trò chuyện liên tục duy nhất với cửa hàng và có thể đính kèm thông tin đơn hàng cụ thể vào cuộc trò chuyện bất cứ khi nào,
để toàn bộ lịch sử trao đổi được tập trung tại một nơi và admin nắm bắt ngay ngữ cảnh đơn hàng tôi đang muốn hỏi.

#### Yêu Cầu Hành Vi
Khi khách hàng truy cập website, hệ thống phải hiển thị nút biểu tượng ô inbox nổi ở góc dưới bên phải màn hình.

Khi khách hàng mở hộp thoại chat:
- Nếu khách hàng chưa đăng nhập, hệ thống hiển thị thông báo yêu cầu đăng nhập để nhắn tin hỗ trợ.
- Nếu khách hàng đã đăng nhập, hệ thống mở trực tiếp cuộc hội thoại duy nhất giữa khách hàng và ban quản trị. Nếu chưa có cuộc hội thoại nào tồn tại giữa khách hàng và shop, hệ thống tự động khởi tạo cuộc hội thoại đó.

Khi khách hàng đang ở trang chi tiết đơn hàng (`/orders/:id`) và nhấn nút "Hỏi về đơn hàng này":
- Hệ thống kiểm tra quyền sở hữu đơn hàng của khách hàng (`order.user_id == current_user.id`).
- Hệ thống mở hộp thoại chat duy nhất của khách hàng và đưa đơn hàng đó vào trạng thái sẵn sàng gửi (hoặc gửi một tin nhắn thẻ đơn hàng vào cuộc trò chuyện).

Khi khách hàng đang ở trong hộp thoại chat, giao diện cung cấp nút "Đính kèm đơn hàng":
- Khi khách hàng nhấn nút này, hệ thống hiển thị danh sách các đơn hàng gần đây của chính khách hàng đó.
- Khi khách hàng chọn một đơn hàng, hệ thống gửi một tin nhắn loại thẻ đơn hàng (Order Context Message) vào cuộc hội thoại.
- Thẻ đơn hàng trong tin nhắn hiển thị mã đơn, trạng thái đơn hàng, ngày tạo, tổng tiền, tóm tắt sản phẩm, và liên kết cho phép nhấp để mở trang chi tiết đơn hàng.

Hệ thống tuyệt đối không tạo thêm bản ghi cuộc hội thoại mới khi người dùng hỏi về các đơn hàng khác nhau.

#### Bất Biến
- `INV-CHAT-01-01` — Mỗi khách hàng có tối đa một cuộc hội thoại duy nhất với ban quản trị trong cơ sở dữ liệu (`UNIQUE (user_id)`).
- `INV-CHAT-01-02` — Khách hàng chỉ được phép đính kèm đơn hàng thuộc sở hữu của chính mình (`order.user_id == current_user.id`) vào tin nhắn.
- `INV-CHAT-01-03` — Dữ liệu tóm tắt trong thẻ đơn hàng đính kèm phản ánh thông tin snapshot thực tế từ cơ sở dữ liệu tại thời điểm gửi tin nhắn và cho phép nhấp để mở trang chi tiết đơn hàng.

#### Hành Vi Lỗi / Phụ Thuộc Trạng Thái
Nếu đơn hàng được chỉ định đính kèm không tồn tại hoặc không thuộc sở hữu của khách hàng, hệ thống phải từ chối thao tác đính kèm với mã lỗi `order_not_found` hoặc `forbidden` và thông báo lỗi bằng tiếng Việt: "Đơn hàng không tồn tại hoặc bạn không có quyền truy cập".

#### Tiêu Chí Chấp Nhận
**AC-CHAT-01-01**
Cho trước khách hàng đã đăng nhập có nhiều đơn hàng khác nhau, khi khách hàng bấm "Hỏi về đơn hàng này" tại đơn hàng A và sau đó tại đơn hàng B, hệ thống đều mở cùng một khung chat duy nhất của khách hàng đó, trong đó thẻ đơn hàng A và thẻ đơn hàng B xuất hiện như các tin nhắn nối tiếp trong cùng một luồng trao đổi.

**AC-CHAT-01-02**
Cho trước khách hàng đang ở trong khung chat, khi nhấn nút "Đính kèm đơn hàng", danh sách các đơn hàng của khách hàng được hiển thị. Khi chọn một đơn hàng, một tin nhắn dạng thẻ đơn hàng được gửi thành công vào luồng chat hiển thị đầy đủ mã đơn, ngày đặt, trạng thái và tổng tiền.

**AC-CHAT-01-03**
Cho trước khách hàng cố tình gửi mã đơn hàng không thuộc quyền sở hữu của mình, hệ thống từ chối lưu tin nhắn và trả về lỗi bảo mật bằng tiếng Việt.

---

### REQ-CHAT-02 — Gửi Tin Nhắn Văn Bản, Đa Phương Tiện (Ảnh, Video, Dán Clipboard)

**Câu Chuyện Người Dùng**
Là khách hàng hoặc quản trị viên,
tôi muốn gửi tin nhắn văn bản kèm hình ảnh, video hoặc dán ảnh trực tiếp từ bộ nhớ tạm,
để truyền đạt rõ ràng và trực quan nội dung trao đổi.

#### Yêu Cầu Hành Vi
Khi người dùng (khách hàng hoặc admin) gửi tin nhắn, tin nhắn có thể chứa nội dung văn bản (1 đến 2000 ký tự) và/hoặc tối đa 5 tệp tin đa phương tiện (ảnh JPEG/PNG/WEBP dung lượng tối đa 10MB mỗi tệp; video MP4/WEBM dung lượng tối đa 50MB mỗi tệp).

Khi người dùng dán ảnh trực tiếp từ bộ nhớ tạm (`Ctrl+V`) vào khung nhập tin nhắn, hệ thống tự động nhận diện tệp ảnh và đưa vào danh sách tệp đính kèm chờ gửi kèm xem trước (preview).

Hệ thống phải kiểm tra định dạng MIME thực tế thông qua magic bytes của tệp trước khi lưu trữ vào dịch vụ lưu trữ (MinIO).

Khi gửi tin nhắn thành công, tin nhắn được hiển thị ngay trong danh sách tin nhắn kèm vai trò người gửi (`customer` hoặc `admin`), thời điểm gửi, và danh sách media tương ứng (cho phép bấm phóng to ảnh hoặc phát video).

#### Bất Biến
- `INV-CHAT-02-01` — Tin nhắn gửi đi phải chứa ít nhất một trong các nội dung: văn bản hợp lệ (không toàn khoảng trắng), tệp đa phương tiện hợp lệ, hoặc thẻ đơn hàng hợp lệ.
- `INV-CHAT-02-02` — Mỗi tin nhắn đính kèm tối đa 5 tệp media; tệp ảnh chỉ chấp nhận JPEG, PNG, WEBP dung lượng <= 10MB; tệp video chỉ chấp nhận MP4, WEBM dung lượng <= 50MB.
- `INV-CHAT-02-03` — Dấu thời gian tạo (`created_at`) và thông tin người gửi của tin nhắn là bất biến sau khi lưu vào cơ sở dữ liệu.

#### Hành Vi Lỗi / Phụ Thuộc Trạng Thái
Nếu tin nhắn không chứa bất kỳ nội dung nào (không text, không media, không thẻ đơn hàng), hệ thống chặn gửi với cảnh báo: "Vui lòng nhập nội dung tin nhắn hoặc đính kèm tệp tin".

Nếu tệp tải lên vượt quá dung lượng hoặc sai định dạng MIME qua kiểm tra magic bytes, hệ thống từ chối tệp với mã lỗi `invalid_media_type` hoặc `file_too_large` và thông báo lỗi bằng tiếng Việt.

#### Tiêu Chí Chấp Nhận
**AC-CHAT-02-01**
Cho trước người dùng nhập tin nhắn văn bản và bấm gửi, tin nhắn xuất hiện trong luồng trao đổi kèm vai trò người gửi và dấu thời gian.

**AC-CHAT-02-02**
Cho trước người dùng chụp ảnh màn hình và nhấn `Ctrl+V` vào ô chat, ảnh xuất hiện trong danh sách đính kèm chờ gửi và gửi đi thành công dưới dạng ảnh.

**AC-CHAT-02-03**
Cho trước người dùng gửi ảnh hoặc video hợp lệ, đối phương nhận được tin nhắn và có thể xem ảnh phóng to hoặc phát video trực tiếp.

**AC-CHAT-02-04**
Nếu người dùng cố tình tải lên tệp thực thi hoặc tệp vượt giới hạn dung lượng, hệ thống từ chối tiếp nhận và thông báo lỗi bằng tiếng Việt.

---

### REQ-CHAT-03 — Phân Trang Tải Tin Nhắn Và Chỉ Báo Tin Nhắn Mới Khi Xem Tin Cũ

**Câu Chuyện Người Dùng**
Là người sử dụng chat (khách hàng hoặc quản trị viên),
tôi muốn khi mở chat chỉ nạp các tin nhắn gần nhất và cuộn lên để xem tiếp tin cũ, đồng thời nhận thông báo khi có tin nhắn mới nếu tôi đang xem tin cũ,
để giao diện tải nhanh, mượt mà và tôi không bị gián đoạn hay bỏ lỡ tin nhắn mới khi đang đọc lịch sử.

#### Yêu Cầu Hành Vi
Khi người dùng mở một cuộc hội thoại:
- Hệ thống chỉ tải trước **X tin nhắn gần nhất** (mặc định X = 20 tin nhắn, có thể cấu hình) thay vì tải toàn bộ lịch sử tin nhắn.
- Khung chat tự động cuộn xuống dưới cùng để hiển thị tin nhắn mới nhất.

Khi người dùng cuộn lên trên đỉnh khung chat (scroll to top):
- Nếu cuộc hội thoại còn các tin nhắn cũ hơn, hệ thống tự động tải thêm X tin nhắn tiếp theo có mốc thời gian trước tin nhắn cũ nhất hiện tại (`before_id` hoặc `before_timestamp`).
- Trong quá trình tải và sau khi nạp xong dữ liệu tin cũ, giao diện phải duy trì ổn định vị trí cuộn của người dùng (scroll position preservation), không làm giật hay nhảy vị trí trang hiển thị.
- Nếu đã nạp hết toàn bộ lịch sử tin nhắn, hệ thống dừng gửi yêu cầu tải thêm và không hiển thị biểu tượng tải ở đỉnh.

Khi người dùng đang ở vị trí tin nhắn không phải mới nhất (vị trí thanh cuộn cách đáy một khoảng vượt quá ngưỡng quy định, ví dụ > 100px):
- Khi có tin nhắn mới được gửi đến (từ đối phương qua kết nối real-time WebSocket):
  - Khung chat **không tự động cuộn màn hình xuống đáy**, nhằm bảo đảm người dùng tiếp tục đọc lịch sử tin nhắn mà không bị giật màn hình.
  - Hệ thống hiển thị một nút / thanh thông báo nổi ở góc dưới khung chat: **"Có X tin mới"** kèm biểu tượng mũi tên chỉ xuống (với X là số lượng tin nhắn mới phát sinh kể từ khi người dùng rời đáy).
  - Khi người dùng nhấp vào nút thông báo "Có X tin mới": Khung chat thực hiện thao tác cuộn mượt (smooth scroll) xuống đáy đến tin nhắn mới nhất, đồng thời ẩn nút thông báo và đặt lại bộ đếm X về 0.
  - Nếu người dùng tự dùng tay hoặc chuột cuộn xuống chạm đáy khung chat: Nút thông báo "Có X tin mới" cũng tự động ẩn đi và bộ đếm X đặt lại về 0.

Nếu người dùng đang ở sát đáy khung chat (cách đáy <= 100px) tại thời điểm nhận tin nhắn mới: Khung chat tự động cuộn êm xuống đáy để hiển thị tin nhắn mới nhất ngay lập tức mà không cần hiển thị nút chỉ báo nổi.

#### Bất Biến
- `INV-CHAT-03-01` — Danh sách tin nhắn tải về luôn được sắp xếp theo trình tự thời gian tăng dần (`created_at ASC`) để đảm bảo tính nhất quán của dòng thời gian hội thoại.
- `INV-CHAT-03-02` — Thao tác nạp thêm tin nhắn cũ khi cuộn lên đỉnh không được làm thay đổi vị trí thị giác của tin nhắn mà người dùng đang nhìn thấy trước khi tải.
- `INV-CHAT-03-03` — Bộ đếm tin mới X trên chỉ báo nổi chỉ tính các tin nhắn nhận được trong lúc người dùng đang ở trạng thái không chạm đáy, và phải được reset về 0 ngay khi người dùng chạm đáy hoặc bấm cuộn xuống.

#### Hành Vi Lỗi / Phụ Thuộc Trạng Thái
Nếu mạng bị gián đoạn trong khi tải thêm tin nhắn cũ, hệ thống giữ nguyên các tin nhắn hiện có và cho phép người dùng thử cuộn lại hoặc bấm thử lại mà không gây mất dữ liệu hiển thị hiện tại.

#### Tiêu Chí Chấp Nhận
**AC-CHAT-03-01**
Cho trước một cuộc hội thoại có 100 tin nhắn, khi người dùng mở khung chat, hệ thống chỉ nạp đúng 20 tin nhắn mới nhất và vị trí hiển thị cuộn nằm ở đáy khung chat.

**AC-CHAT-03-02**
Cho trước người dùng cuộn lên trên đỉnh khung chat, hệ thống nạp thêm 20 tin nhắn cũ tiếp theo; vị trí xem của người dùng giữ nguyên tại tin nhắn đang đọc trước khi tải thêm, không bị nhảy màn hình lên đỉnh hay xuống đáy.

**AC-CHAT-03-03**
Cho trước người dùng đang cuộn lên giữa khung chat để đọc tin cũ, khi đối phương gửi 2 tin nhắn mới, màn hình không bị giật xuống đáy, và một nút nổi xuất hiện ở góc dưới với nội dung "Có 2 tin mới".

**AC-CHAT-03-04**
Khi người dùng nhấp vào nút "Có 2 tin mới", màn hình tự động cuộn xuống dưới cùng để lộ 2 tin nhắn mới nhất, và nút thông báo biến mất.

**AC-CHAT-03-05**
Cho trước người dùng đang ở vị trí sát đáy khung chat, khi có tin nhắn mới đến, khung chat tự động cuộn xuống hiển thị tin mới ngay lập tức mà không hiển thị nút thông báo nổi.

---

### REQ-CHAT-04 — Quản Lý Hội Thoại Và Phản Hồi Dành Cho Quản Trị Viên

**Câu Chuyện Người Dùng**
Là một quản trị viên,
tôi muốn quản lý danh sách cuộc hội thoại của tất cả khách hàng tập trung tại một nơi (mỗi khách hàng một hội thoại duy nhất), xem thẻ đơn hàng đính kèm trong tin nhắn và phản hồi kịp thời,
để hỗ trợ khách hàng nhanh chóng và chính xác.

#### Yêu Cầu Hành Vi
Khi quản trị viên truy cập trang quản lý tin nhắn (`/admin/messages`), hệ thống hiển thị danh sách các cuộc hội thoại giữa từng khách hàng và shop, phân trang và sắp xếp theo thời điểm có tin nhắn mới nhất giảm dần.

Mỗi dòng hội thoại hiển thị: tên và email khách hàng, đoạn trích tin nhắn mới nhất, thời gian tin nhắn cuối cùng, số lượng tin nhắn chưa đọc của admin (`admin_unread_count`), và trạng thái hoạt động của khách hàng.

Khi quản trị viên mở một cuộc hội thoại:
- Hệ thống tải X tin nhắn gần nhất của khách hàng đó theo cơ chế phân trang tại REQ-CHAT-03.
- Các thẻ đơn hàng do khách hàng (hoặc admin) đã đính kèm xuất hiện trực tiếp trong luồng tin nhắn kèm nút chuyển nhanh sang trang quản lý chi tiết đơn hàng (`/admin/orders/:id`).
- Hệ thống tự động đánh dấu các tin nhắn của khách hàng trong cuộc hội thoại đó là đã đọc (`admin_unread_count = 0`).

Trong trang chi tiết đơn hàng phía quản trị (`/admin/orders/:id`), hệ thống cung cấp nút "Nhắn tin cho khách hàng": khi nhấp vào, chuyển nhanh đến cuộc hội thoại duy nhất của khách hàng đó và cho phép đính kèm đơn hàng hiện tại vào tin nhắn.

#### Bất Biến
- `INV-CHAT-04-01` — Chỉ tài khoản có vai trò `admin` mới có quyền truy cập vào danh sách và nội dung hội thoại quản trị.
- `INV-CHAT-04-02` — Đánh dấu đã đọc bởi admin chỉ tác động đến các tin nhắn do khách hàng gửi, không làm ảnh hưởng đến trạng thái đọc của khách hàng.

#### Hành Vi Lỗi / Phụ Thuộc Trạng Thái
Nếu người dùng chưa xác thực hoặc không có quyền admin cố gắng truy cập API chat quản trị, hệ thống trả về mã lỗi `unauthorized` (401) hoặc `forbidden` (403).

#### Tiêu Chí Chấp Nhận
**AC-CHAT-04-01**
Cho trước khách hàng gửi tin nhắn mới (có thể là tin nhắn thường hoặc thẻ đơn hàng), trên trang `/admin/messages` xuất hiện hội thoại của khách hàng đó ở vị trí đầu tiên kèm huy hiệu số tin chưa đọc.

**AC-CHAT-04-02**
Khi admin mở cuộc hội thoại, hệ thống nạp 20 tin nhắn gần nhất, hiển thị thẻ đơn hàng đã đính kèm (nếu có) kèm liên kết xem chi tiết đơn, và số tin chưa đọc giảm về 0.

**AC-CHAT-04-03**
Admin có thể gửi tin nhắn văn bản, hình ảnh hoặc phản hồi trực tiếp tới khách hàng, và tin nhắn xuất hiện tức thì bên phía khách hàng.

---

### REQ-CHAT-05 — Trải Nghiệm Khách Hàng Với Ô Inbox Nổi Và Đánh Dấu Đã Đọc

**Câu Chuyện Người Dùng**
Là một khách hàng,
tôi muốn nhận biết ngay khi có tin nhắn phản hồi mới từ cửa hàng qua ô inbox nổi và mở thẳng vào cuộc trò chuyện duy nhất của mình,
để không bỏ lỡ thông tin phản hồi từ cửa hàng.

#### Yêu Cầu Hành Vi
Trên ô inbox nổi ở góc dưới bên phải màn hình, nếu có tin nhắn mới chưa đọc từ admin (`customer_unread_count > 0`), hệ thống hiển thị huy hiệu (badge) đếm số lượng tin nhắn chưa đọc.

Khi khách hàng nhấn vào ô inbox nổi:
- Hệ thống mở trực tiếp cuộc trò chuyện duy nhất giữa khách hàng và ban quản trị (không yêu cầu bước chọn hội thoại trung gian).
- Khung chat tải X tin nhắn gần nhất theo REQ-CHAT-03.
- Hệ thống tự động gửi yêu cầu đánh dấu đã đọc đối với các tin nhắn của admin, và badge chưa đọc trên ô inbox nổi được cập nhật về 0.

#### Bất Biến
- `INV-CHAT-05-01` — Khách hàng chỉ xem và tương tác với cuộc hội thoại của chính mình; tuyệt đối không thể truy cập tin nhắn của khách hàng khác.
- `INV-CHAT-05-02` — Đánh dấu đã đọc bởi khách hàng chỉ tác động đến tin nhắn do admin gửi trong cuộc hội thoại của chính khách hàng đó.

#### Hành Vi Lỗi / Phụ Thuộc Trạng Thái
Nếu khách hàng chưa đăng nhập mở ô inbox nổi, hệ thống hiển thị thông báo yêu cầu đăng nhập trước khi bắt đầu trò chuyện.

#### Tiêu Chí Chấp Nhận
**AC-CHAT-05-01**
Cho trước admin gửi tin nhắn phản hồi, ô inbox nổi ở góc dưới bên phải màn hình khách hàng hiển thị badge số tin chưa đọc.

**AC-CHAT-05-02**
Khi khách hàng nhấp vào ô inbox, hộp thoại chat mở trực tiếp vào luồng trao đổi duy nhất, nạp các tin nhắn mới nhất, và badge chưa đọc được xóa bỏ.

**AC-CHAT-05-03**
Khách hàng không thể xem nội dung cuộc hội thoại hoặc tải tệp media của khách hàng khác.

---

### REQ-CHAT-06 — Hiển Thị Trạng Thái Hoạt Động (Online / Thời Điểm Hoạt Động Gần Nhất)

**Câu Chuyện Người Dùng**
Là khách hàng hoặc quản trị viên,
tôi muốn nhìn thấy đối phương có đang trực tuyến hay vừa mới truy cập hay không,
để tôi biết có thể nhận được phản hồi ngay lập tức hay phải chờ đợi.

#### Yêu Cầu Hành Vi
Khi người dùng mở khung chat hoặc thực hiện thao tác trong cuộc hội thoại, hệ thống ghi nhận thời điểm hoạt động (`last_active_at`).

Khi hiển thị đầu trang hội thoại (chat header):
- Khách hàng nhìn thấy trạng thái của đội ngũ hỗ trợ (ví dụ: "Đang hoạt động" nếu có admin trực tuyến trong vòng 2 phút, hoặc "Hoạt động X phút trước" / "Vừa xong").
- Quản trị viên nhìn thấy trạng thái của khách hàng (ví dụ: "Đang hoạt động" nếu khách hàng mở chat trong vòng 2 phút, hoặc "Hoạt động X phút trước" / "Vừa xong" / thời gian truy cập gần nhất).

Quy tắc chuyển đổi hiển thị văn bản trạng thái:
- Nếu chênh lệch thời gian <= 2 phút: hiển thị "Đang hoạt động" kèm chấm xanh biểu thị trực tuyến.
- Nếu chênh lệch thời gian từ > 2 phút đến <= 10 phút: hiển thị "Vừa xong".
- Nếu chênh lệch thời gian từ > 10 phút đến < 60 phút: hiển thị "Hoạt động {X} phút trước".
- Nếu chênh lệch thời gian từ 1 giờ đến 24 giờ: hiển thị "Hoạt động {X} giờ trước".
- Nếu lớn hơn 24 giờ: hiển thị "Hoạt động ngày dd/MM".

#### Bất Biến
- `INV-CHAT-06-01` — Thời điểm hoạt động gần nhất được cập nhật tự động khi người dùng kết nối hoặc gửi tín hiệu heartbeat từ giao diện chat, không ghi nhận lặp lại nếu khoảng cách giữa 2 lần cập nhật nhỏ hơn 30 giây.
- `INV-CHAT-06-02` — Trạng thái hoạt động hiển thị công khai cho các bên tham gia cuộc hội thoại theo định dạng thời gian tương đối thân thiện bằng tiếng Việt.

#### Tiêu Chí Chấp Nhận
**AC-CHAT-06-01**
Cho trước khách hàng đang mở ô chat, góc trên khung chat của admin hiển thị "Đang hoạt động" với chấm xanh bên cạnh tên khách hàng.

**AC-CHAT-06-02**
Cho trước khách hàng đã đóng chat hoặc không thao tác trong 15 phút, phía khung chat của admin hiển thị "Hoạt động 15 phút trước".

**AC-CHAT-06-03**
Cho trước admin đang trực tuyến phản hồi, phía khung chat của khách hàng hiển thị "Hỗ trợ viên: Đang hoạt động".
