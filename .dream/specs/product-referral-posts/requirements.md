# Tài liệu yêu cầu: Bài viết giới thiệu sản phẩm, Tương tác cảm xúc, Bình luận phân cấp và Thông báo thời gian thực (Product Referral Posts)

## Giới thiệu

Tính năng "Bài viết giới thiệu sản phẩm" (Product Referral Posts) cho phép Quản trị viên (Admin) đăng tải và quản lý các bài viết truyền thông, đánh giá hoặc giới thiệu sản phẩm kèm nội dung văn bản, tệp hình ảnh/video và thẻ liên kết sản phẩm tham chiếu (referred products) lấy từ danh mục cửa hàng.

Khách hàng và người xem trên giao diện cửa hàng cũng như Quản trị viên trên cổng quản trị có thể xem danh sách bài viết, xem trang chi tiết bài viết, chuyển tiếp tới trang sản phẩm từ thẻ sản phẩm đính kèm, sao chép liên kết chia sẻ bài viết, bày tỏ cảm xúc đa trạng thái (Thích, Yêu thích, Haha, Wow, Buồn, Phẫn nộ - tương tự Facebook) cho cả bài viết và từng bình luận, cũng như thảo luận qua hệ thống bình luận phân cấp tối đa 2 cấp (bình luận gốc cấp 1 và phản hồi cấp 2 - tương tự Facebook/TikTok).

Khi có tương tác bày tỏ cảm xúc hoặc bình luận/phản hồi mới, chủ bài viết (Admin) và chủ bình luận (Admin hoặc Khách hàng) sẽ nhận được thông báo thời gian thực (realtime) qua kết nối WebSocket trên cả cổng quản trị và giao diện cửa hàng. Khi người nhận nhấp vào một thông báo, hệ thống tự động điều hướng đến trang chi tiết bài viết tương ứng, cuộn mượt (smooth scroll) và tạo hiệu ứng làm nổi bật kèm tiêu điểm (focus/highlight) trực tiếp vào đúng đối tượng mục tiêu (bài viết, bình luận gốc hoặc bình luận phản hồi).

---

## Yêu cầu

### Yêu cầu 1: Quản trị viên tạo, chỉnh sửa và xóa bài viết kèm phương tiện và sản phẩm giới thiệu (Admin Post Management & Product Referrals)

**User Story:** Là Quản trị viên (Admin), tôi muốn tạo, chỉnh sửa và xóa bài viết có nội dung văn bản, hình ảnh/video tải lên và danh sách sản phẩm giới thiệu từ danh mục cửa hàng, để quảng bá sản phẩm trực quan tới khách hàng.

#### Tiêu chí chấp nhận

1.1. WHEN Quản trị viên mở biểu mẫu tạo hoặc chỉnh sửa bài viết THEN hệ thống SHALL cho phép nhập nội dung văn bản, tải lên các tệp hình ảnh hoặc video đính kèm, và tìm kiếm, chọn đính kèm một hoặc nhiều sản phẩm hiện có từ danh mục sản phẩm của cửa hàng.

1.2. WHEN Quản trị viên chọn tệp phương tiện đính kèm cho bài viết THEN hệ thống SHALL hỗ trợ tệp hình ảnh (JPEG, PNG, WebP, GIF dung lượng tối đa 10MB mỗi tệp) và tệp video (MP4, WebM dung lượng tối đa 50MB mỗi tệp), hiển thị bản xem trước và cho phép gỡ bỏ tệp trước khi lưu.

1.3. WHEN Quản trị viên gửi yêu cầu tạo bài viết hợp lệ có nội dung văn bản (từ 1 đến 5.000 ký tự) và ít nhất 1 sản phẩm giới thiệu hợp lệ THEN hệ thống SHALL lưu bài viết, các tệp phương tiện và danh sách liên kết sản phẩm giới thiệu theo đúng thứ tự đã chọn, đồng thời trả về thông tin bài viết vừa tạo.

1.4. WHEN Quản trị viên cập nhật nội dung văn bản, danh sách tệp phương tiện hoặc danh sách sản phẩm giới thiệu của một bài viết hiện có THEN hệ thống SHALL lưu thay đổi, cập nhật thời gian chỉnh sửa và giữ nguyên toàn bộ cảm xúc cùng bình luận đã có của bài viết đó.

1.5. WHEN Quản trị viên xóa một bài viết hiện có THEN hệ thống SHALL xóa bài viết đó cùng các bình luận, cảm xúc và thông báo gắn với bài viết đó khỏi danh sách hiển thị.

1.6. IF nội dung văn bản của bài viết bị để trống (chỉ chứa khoảng trắng), vượt quá 5.000 ký tự, hoặc không có sản phẩm giới thiệu nào được chọn THEN hệ thống SHALL từ chối yêu cầu với mã lỗi xác thực (`validation_error`) kèm thông tin trường không hợp lệ.

1.7. IF tệp phương tiện tải lên không thuộc định dạng được hỗ trợ hoặc vượt quá giới hạn dung lượng (10MB đối với ảnh, 50MB đối với video) THEN hệ thống SHALL từ chối yêu cầu và hiển thị thông báo lỗi bằng tiếng Việt.

1.8. IF danh sách sản phẩm giới thiệu có chứa mã sản phẩm không tồn tại trong danh mục cửa hàng THEN hệ thống SHALL từ chối yêu cầu và hiển thị thông báo lỗi bằng tiếng Việt.

1.9. IF người dùng chưa đăng nhập hoặc tài khoản không có vai trò Quản trị viên (`admin`) gọi các thao tác tạo, chỉnh sửa hoặc xóa bài viết THEN hệ thống SHALL từ chối truy cập với mã trạng thái không được phép (HTTP 401 hoặc HTTP 403).

---

### Yêu cầu 2: Hiển thị danh sách bài viết, trang chi tiết bài viết, thẻ sản phẩm giới thiệu và chia sẻ liên kết (Post Feed, Detail View, Referral Cards & Share)

**User Story:** Là người xem (khách vãng lai, khách hàng đã đăng nhập hoặc quản trị viên), tôi muốn duyệt bảng tin bài viết, xem chi tiết bài viết kèm hình ảnh/video, nhấp vào sản phẩm giới thiệu để xem thông tin sản phẩm, và sao chép liên kết bài viết để chia sẻ.

#### Tiêu chí chấp nhận

2.1. WHEN người xem truy cập danh sách bài viết (trên giao diện cửa hàng hoặc giao diện quản trị) THEN hệ thống SHALL hiển thị các bài viết theo thứ tự thời gian đăng mới nhất trước, bao gồm: thông tin người đăng, thời gian đăng, nội dung văn bản, trình xem hình ảnh/video đính kèm, danh sách thẻ sản phẩm giới thiệu, tổng số cảm xúc theo từng loại, tổng số bình luận và các nút tương tác (Bày tỏ cảm xúc, Bình luận, Chia sẻ).

2.2. WHEN người xem chưa đăng nhập truy cập danh sách bài viết hoặc trang chi tiết bài viết trên giao diện cửa hàng THEN hệ thống SHALL cho phép xem đầy đủ nội dung bài viết, tệp hình ảnh/video, thẻ sản phẩm giới thiệu, số lượng cảm xúc và danh sách bình luận công khai.

2.3. WHEN hệ thống hiển thị mỗi thẻ sản phẩm giới thiệu (referred product) trong bài viết THEN hệ thống SHALL hiển thị ảnh đại diện sản phẩm, tên sản phẩm, thương hiệu, giá bán hiện tại, trạng thái còn hàng hoặc hết hàng, và liên kết điều hướng trực tiếp tới trang chi tiết của sản phẩm đó.

2.4. WHEN người xem trên giao diện cửa hàng nhấn vào một thẻ sản phẩm giới thiệu trong bài viết THEN hệ thống SHALL điều hướng tới trang chi tiết sản phẩm tương ứng để người xem có thể xem chi tiết và mua hàng.

2.5. WHEN người xem nhấn vào nút "Chia sẻ" (Share) trên một bài viết tại trang danh sách hoặc trang chi tiết THEN hệ thống SHALL sao chép đường dẫn URL đầy đủ của trang chi tiết bài viết đó vào bộ nhớ tạm (clipboard) và hiển thị thông báo xác nhận "Đã sao chép liên kết bài viết" bằng tiếng Việt.

2.6. WHEN hệ thống chưa có bài viết nào được đăng THEN trang danh sách bài viết SHALL hiển thị trạng thái trống với thông điệp tiếng Việt rõ ràng thay vì để trang trắng.

2.7. IF người xem truy cập trang chi tiết của một bài viết có mã định danh không tồn tại hoặc đã bị xóa THEN hệ thống SHALL trả về trạng thái không tìm thấy (HTTP 404) và hiển thị thông báo bài viết không tồn tại hoặc đã bị xóa bằng tiếng Việt.

---

### Yêu cầu 3: Bày tỏ cảm xúc đa trạng thái cho bài viết (Post Multi-Emotion Reactions)

**User Story:** Là người dùng đã đăng nhập (Khách hàng hoặc Quản trị viên), tôi muốn bày tỏ cảm xúc (Thích, Yêu thích, Haha, Wow, Buồn, Phẫn nộ) trên bài viết, đổi sang cảm xúc khác hoặc gỡ bỏ cảm xúc của mình, để thể hiện sự quan tâm đối với bài viết.

#### Tiêu chí chấp nhận

3.1. WHEN người dùng mở bộ chọn cảm xúc trên một bài viết THEN hệ thống SHALL cung cấp 6 loại cảm xúc: `like` (Thích), `love` (Yêu thích), `haha` (Haha), `wow` (Wow), `sad` (Buồn), và `angry` (Phẫn nộ).

3.2. WHEN người dùng đã đăng nhập chọn một cảm xúc cho bài viết mà mình chưa từng bày tỏ cảm xúc THEN hệ thống SHALL lưu cảm xúc đó, hiển thị trạng thái đã chọn của người dùng, tăng bộ đếm của loại cảm xúc đó thêm 1 và tăng tổng số cảm xúc của bài viết thêm 1.

3.3. WHEN người dùng đã đăng nhập đã có cảm xúc trên bài viết và chọn một loại cảm xúc khác THEN hệ thống SHALL thay thế cảm xúc cũ bằng cảm xúc mới, giảm bộ đếm của cảm xúc cũ đi 1, tăng bộ đếm của cảm xúc mới thêm 1 và giữ nguyên tổng số cảm xúc của bài viết.

3.4. WHEN người dùng đã đăng nhập nhấn lại vào đúng loại cảm xúc hiện tại của mình trên bài viết THEN hệ thống SHALL gỡ bỏ cảm xúc đó, đưa trạng thái của người dùng về chưa chọn, giảm bộ đếm của cảm xúc đó đi 1 và giảm tổng số cảm xúc của bài viết đi 1.

3.5. WHEN nhiều yêu cầu bày tỏ cảm xúc tác động đồng thời lên cùng một bài viết THEN hệ thống SHALL đảm bảo mỗi người dùng chỉ có tối đa 1 cảm xúc hiện hành trên bài viết đó và mọi số liệu thống kê cảm xúc không âm, phản ánh đúng dữ liệu đã lưu.

3.6. IF người xem chưa đăng nhập nhấn bày tỏ cảm xúc trên bài viết THEN hệ thống SHALL yêu cầu đăng nhập và hỗ trợ quay lại đúng bài viết đang xem sau khi đăng nhập thành công.

---

### Yêu cầu 4: Bình luận và trả lời bình luận phân cấp tối đa 2 cấp (Two-Level Hierarchical Comments & Replies)

**User Story:** Là người dùng đã đăng nhập (Khách hàng hoặc Quản trị viên), tôi muốn bình luận vào bài viết và trả lời các bình luận hiện có với cấu trúc phân cấp tối đa 2 cấp (tương tự Facebook/TikTok), để trao đổi rõ ràng mà giao diện không bị lồng sâu quá mức.

#### Tiêu chí chấp nhận

4.1. WHEN người dùng đã đăng nhập gửi một bình luận gốc hợp lệ vào bài viết THEN hệ thống SHALL lưu bình luận ở cấp 1 (cấp gốc), tăng tổng số bình luận của bài viết thêm 1 và hiển thị bình luận kèm thông tin người viết, vai trò (nếu là Quản trị viên thì hiển thị huy hiệu "Quản trị viên"), nội dung và thời gian tạo.

4.2. WHEN người dùng đã đăng nhập gửi phản hồi (reply) cho một bình luận gốc cấp 1 THEN hệ thống SHALL lưu bình luận phản hồi ở cấp 2 trực thuộc bình luận gốc đó, tăng tổng số bình luận của bài viết thêm 1 và hiển thị phản hồi trong nhánh con bên dưới bình luận gốc.

4.3. WHEN người dùng đã đăng nhập nhấn "Trả lời" vào một bình luận phản hồi đang ở cấp 2 và gửi nội dung hợp lệ THEN hệ thống SHALL gắn bình luận mới vào cùng bình luận gốc cấp 1 của nhánh đó (giữ độ sâu phân cấp tối đa là 2 cấp), đồng thời lưu và hiển thị tham chiếu tới người dùng của bình luận cấp 2 được trả lời.

4.4. WHEN một bình luận gốc cấp 1 có các bình luận phản hồi cấp 2 THEN giao diện SHALL hỗ trợ hiển thị số lượng phản hồi và cho phép mở rộng hoặc thu gọn danh sách phản hồi của bình luận gốc đó.

4.5. WHEN tác giả của bình luận hoặc Quản trị viên thực hiện xóa một bình luận THEN hệ thống SHALL xóa bình luận đó (và các phản hồi cấp 2 trực thuộc nếu là bình luận gốc cấp 1) và cập nhật lại tổng số bình luận của bài viết.

4.6. IF nội dung bình luận hoặc phản hồi bị bỏ trống (chỉ chứa khoảng trắng) hoặc vượt quá 1.000 ký tự THEN hệ thống SHALL từ chối lưu và trả về thông báo lỗi xác thực.

4.7. IF người dùng gửi phản hồi cho một bình luận không tồn tại, đã bị xóa hoặc không thuộc về bài viết tương ứng THEN hệ thống SHALL từ chối yêu cầu và trả về thông báo lỗi bằng tiếng Việt.

4.8. IF người xem chưa đăng nhập thực hiện gửi bình luận hoặc nhấn trả lời bình luận THEN hệ thống SHALL yêu cầu đăng nhập trước khi gửi.

---

### Yêu cầu 5: Bày tỏ cảm xúc đa trạng thái cho bình luận và phản hồi (Comment & Reply Multi-Emotion Reactions)

**User Story:** Là người dùng đã đăng nhập (Khách hàng hoặc Quản trị viên), tôi muốn bày tỏ cảm xúc (Thích, Yêu thích, Haha, Wow, Buồn, Phẫn nộ) cho từng bình luận gốc hoặc bình luận phản hồi, để thể hiện sự đồng tình hay cảm xúc với từng ý kiến cụ thể.

#### Tiêu chí chấp nhận

5.1. WHEN hệ thống hiển thị một bình luận gốc (cấp 1) hoặc bình luận phản hồi (cấp 2) THEN hệ thống SHALL hiển thị nút bày tỏ cảm xúc, trạng thái cảm xúc hiện tại của người dùng đang đăng nhập (nếu có), cùng tổng số lượt cảm xúc và các biểu tượng cảm xúc của riêng bình luận đó.

5.2. WHEN người dùng đã đăng nhập chọn cảm xúc mới, đổi sang cảm xúc khác hoặc nhấn lại để gỡ cảm xúc trong 6 loại (`like`, `love`, `haha`, `wow`, `sad`, `angry`) trên một bình luận gốc hoặc phản hồi THEN hệ thống SHALL lưu/cập nhật/xóa cảm xúc của người dùng trên đúng bình luận đó và cập nhật bộ đếm cảm xúc của bình luận đó một cách độc lập với bài viết và các bình luận khác.

5.3. IF bình luận mục tiêu không tồn tại hoặc đã bị xóa tại thời điểm bày tỏ cảm xúc THEN hệ thống SHALL từ chối thao tác và trả về thông báo lỗi bằng tiếng Việt.

---

### Yêu cầu 6: Thông báo thời gian thực qua WebSocket khi có tương tác cảm xúc hoặc bình luận (Realtime WebSocket Notifications)

**User Story:** Là Quản trị viên (chủ bài viết/chủ bình luận) hoặc Khách hàng (chủ bình luận), tôi muốn nhận được thông báo theo thời gian thực qua WebSocket ngay khi có người khác bày tỏ cảm xúc hoặc bình luận/phản hồi vào bài viết hoặc bình luận của tôi, để nắm bắt tương tác tức thì mà không cần tải lại trang.

#### Tiêu chí chấp nhận

6.1. WHEN một hoặc nhiều người dùng bày tỏ cảm xúc hoặc gửi bình luận mới vào bài viết của Quản trị viên (và người thực hiện không phải chính Quản trị viên đăng bài đó) THEN hệ thống SHALL tạo mới hoặc gộp (rollup) vào thông báo chưa đọc hiện có của cùng nhóm tương tác (`post_reaction:<post_id>` hoặc `post_comment:<post_id>`) trong cơ sở dữ liệu cho Quản trị viên, cập nhật tổng số người tương tác duy nhất (`actorCount`) cùng danh sách người tương tác gần nhất, và phát sự kiện thông báo thời gian thực qua WebSocket tới Quản trị viên trong thời gian dưới 1 giây; nếu người dùng gỡ cảm xúc trên bài viết khiến không còn người tương tác nào trong thông báo chưa đọc thì hệ thống SHALL xóa thông báo chưa đọc đó (hoặc cập nhật lại số lượng và người tương tác còn lại).

6.2. WHEN một hoặc nhiều người dùng bày tỏ cảm xúc hoặc gửi bình luận phản hồi (cấp 2) vào một bình luận hiện có (và người thực hiện không phải chính chủ bình luận đó) THEN hệ thống SHALL tạo mới hoặc gộp (rollup) vào thông báo chưa đọc hiện có của cùng nhóm tương tác (`comment_reaction:<comment_id>` hoặc `comment_reply:<parent_comment_id>`) trong cơ sở dữ liệu cho chủ bình luận được tương tác (dù chủ bình luận là Quản trị viên hay Khách hàng), cập nhật tổng số người tương tác duy nhất (`actorCount`) cùng danh sách người tương tác gần nhất, và phát sự kiện thông báo thời gian thực qua WebSocket tới người dùng đó trong thời gian dưới 1 giây; nếu người dùng gỡ cảm xúc trên bình luận khiến không còn người tương tác nào trong thông báo chưa đọc thì hệ thống SHALL xóa thông báo chưa đọc đó (hoặc cập nhật lại số lượng và người tương tác còn lại).

6.3. WHEN một phản hồi mới được gửi cho một bình luận thuộc bài viết của Quản trị viên mà Quản trị viên chưa phải là chủ của bình luận được trả lời trực tiếp THEN hệ thống SHALL đồng thời tạo hoặc gộp và đẩy thông báo bình luận mới trên bài viết cho Quản trị viên đăng bài (nếu người gửi phản hồi không phải chính Quản trị viên đó), đồng thời đảm bảo mỗi người nhận chỉ nhận tối đa 1 thông báo cho cùng một hành động phản hồi.

6.4. WHEN người dùng tự bày tỏ cảm xúc hoặc tự bình luận/phản hồi trên bài viết hoặc bình luận của chính mình THEN hệ thống SHALL không tạo và không đẩy thông báo cho chính người thực hiện.

6.5. WHEN người dùng nhận được sự kiện thông báo qua WebSocket trên cổng quản trị hoặc trên giao diện cửa hàng THEN giao diện SHALL đưa thông báo đó lên đầu danh sách thông báo (nếu đã có thông báo cùng định danh `id` trong danh sách thì thay thế nội dung gộp mới mà không cộng trùng số lượng chưa đọc; nếu là thông báo chưa đọc mới thì tăng số lượng thông báo chưa đọc `unread badge` thêm 1).

6.6. WHEN người dùng mở danh sách thông báo trên thanh tiêu đề (Header của giao diện cửa hàng hoặc cổng quản trị) THEN hệ thống SHALL hiển thị các thông báo sắp xếp theo thời điểm cập nhật tương tác mới nhất trước (`updatedAt`), hiển thị nội dung gom nhóm người tương tác theo định dạng tiếng Việt (`"{Người 1}"` khi `actorCount = 1`, `"{Người 1} và {Người 2}"` khi `actorCount = 2`, hoặc `"{Người 1}, {Người 2} và {actorCount - 2} người khác"` khi `actorCount >= 3`), hành động tương tác (loại cảm xúc đã thả hoặc nội dung trích dẫn bình luận/phản hồi), thời gian tương tác và trạng thái đã đọc/chưa đọc, đồng thời cho phép đánh dấu một hoặc tất cả thông báo là đã đọc.

6.7. IF kết nối WebSocket bị gián đoạn tạm thời THEN giao diện SHALL tự động kết nối lại và đồng bộ lại danh sách thông báo cùng số lượng thông báo chưa đọc từ máy chủ.

---

### Yêu cầu 7: Điều hướng từ thông báo kèm hiệu ứng cuộn mượt và làm nổi bật đối tượng tương ứng (Notification Deep-Linking, Smooth Scroll & Target Focus)

**User Story:** Là người nhận thông báo (Quản trị viên trên cổng quản trị/cửa hàng hoặc Khách hàng trên cửa hàng), tôi muốn khi nhấp vào một thông báo thì hệ thống tự động điều hướng tới trang chi tiết bài viết, kéo mượt tới đúng bài viết hoặc bình luận/phản hồi tương ứng và làm nổi bật (focus/highlight) đối tượng đó, để tôi định vị ngay nội dung có tương tác.

#### Tiêu chí chấp nhận

7.1. WHEN người dùng nhấp vào một thông báo trong danh sách thông báo THEN hệ thống SHALL đánh dấu thông báo đó là đã đọc (nếu đang ở trạng thái chưa đọc), cập nhật giảm số lượng chưa đọc và điều hướng tới trang chi tiết của bài viết tương ứng kèm định danh của đối tượng mục tiêu (bài viết hoặc bình luận/phản hồi cụ thể).

7.2. WHEN thông báo có mục tiêu là bài viết (do tương tác cảm xúc trên bài viết) và trang chi tiết bài viết được mở THEN giao diện SHALL tự động cuộn mượt (`smooth scroll`) đưa phần bài viết vào vùng nhìn thấy và kích hoạt hiệu ứng làm nổi bật trực quan (highlight ring/background) kèm trạng thái focus trên bài viết đó.

7.3. WHEN thông báo có mục tiêu là một bình luận gốc (cấp 1) hoặc bình luận phản hồi (cấp 2) và trang chi tiết bài viết được mở THEN giao diện SHALL tự động tải và mở rộng nhánh phản hồi chứa bình luận đó (nếu đang ở trạng thái thu gọn), cuộn mượt (`smooth scroll`) đưa đúng bình luận/phản hồi mục tiêu vào trung tâm vùng nhìn thấy, đặt tiêu điểm (`focus`) và kích hoạt hiệu ứng làm nổi bật trực quan trên bình luận/phản hồi đó.

7.4. WHEN người dùng đang ở sẵn tại trang chi tiết của cùng bài viết và nhấp vào một thông báo trỏ tới bài viết hoặc bình luận khác trong bài viết đó THEN giao diện SHALL vẫn thực hiện cuộn mượt và kích hoạt lại hiệu ứng làm nổi bật kèm focus vào đối tượng mục tiêu mới.

7.5. IF bình luận mục tiêu của thông báo đã bị xóa trước thời điểm người dùng nhấp vào thông báo THEN giao diện SHALL mở trang chi tiết bài viết và hiển thị thông báo bằng tiếng Việt cho biết bình luận mục tiêu không còn tồn tại.

---

### Yêu cầu 8: Chuẩn giao thức API, Bảo toàn hành vi hiện có và Khả năng tiếp cận (API Contract, Compatibility & Accessibility)

**User Story:** Là chủ sở hữu hệ thống và người dùng trên nhiều thiết bị, tôi muốn tính năng mới tuân thủ chuẩn phản hồi API hiện có, không làm ảnh hưởng các luồng mua sắm/chat sẵn có và đảm bảo khả năng tương tác bằng bàn phím cũng như trên thiết bị di động.

#### Tiêu chí chấp nhận

8.1. WHEN giao diện trao đổi dữ liệu bài viết, cảm xúc, bình luận và thông báo với máy chủ qua các điểm cuối `/api/v1` THEN mọi phản hồi thành công và thất bại SHALL tuân theo cấu trúc Full Status Envelope hiện hành (`success`, `message`, `data`, `error`, `meta`) và sử dụng thông báo tiếng Việt cho các lỗi nghiệp vụ.

8.2. WHEN hệ thống mở rộng kết nối WebSocket cho thông báo bài viết và bình luận THEN hệ thống SHALL bảo toàn nguyên vẹn hoạt động của các sự kiện tin nhắn hỗ trợ (`chat:new_message`, `chat:messages_read`, `chat:presence`) hiện có mà không gây xung đột kết nối.

8.3. WHEN giao diện hiển thị bộ chọn cảm xúc, danh sách bình luận 2 cấp, nút chia sẻ và danh sách thông báo trên màn hình từ 320px trở lên THEN các điều khiển tương tác SHALL không gây tràn ngang màn hình, hỗ trợ điều hướng bằng bàn phím và hiển thị trạng thái chọn/tiêu điểm rõ ràng không chỉ phụ thuộc vào màu sắc.
