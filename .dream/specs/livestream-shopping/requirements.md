# Tài liệu yêu cầu

## Giới thiệu

Tính năng livestream bán hàng cho cửa hàng AuraPhone, theo phong cách livestream mua sắm trên mạng xã hội. Quản trị viên phát video trực tiếp từ ứng dụng quản trị (`frontend-admin`). Khách hàng đã đăng nhập xem trên cửa hàng (`frontend`), bình luận và thả tim theo thời gian thực, đồng thời mở "giỏ hàng live" gồm các sản phẩm quản trị viên chọn để thêm vào giỏ ngay trong lúc xem. Trong lúc phiên đang phát, quản trị viên có thể đặt giá live riêng cho từng biến thể, có thể giới hạn số suất.

Người dùng bị ảnh hưởng:

- **Quản trị viên** (vai trò `admin`): tạo, phát và kết thúc phiên live; quản lý sản phẩm, giá live và số suất của phiên; ghim sản phẩm đang giới thiệu; bình luận và ẩn bình luận.
- **Khách hàng** (vai trò `customer`): xem live, bình luận, thả tim, thêm sản phẩm vào giỏ và đặt hàng với giá live.
- **Khách vãng lai** (chưa đăng nhập): chỉ thấy rằng cửa hàng đang live và được mời đăng nhập để xem.

Quy ước dùng chung cho toàn bộ tài liệu:

- **Phiên live:** một buổi phát trực tiếp, có trạng thái `live` (đang phát) hoặc `ended` (đã kết thúc). Tại mỗi thời điểm có tối đa một phiên ở trạng thái `live`.
- **Giỏ hàng live:** danh sách sản phẩm quản trị viên gắn vào phiên live, tối đa 50 sản phẩm.
- **Giá live:** giá cố định tính bằng VND, đặt riêng cho từng biến thể thuộc một sản phẩm trong giỏ hàng live; biến thể không đặt giá live thì giữ giá thường.
- **Số suất:** số lượng đơn vị tối đa được bán với giá live của một biến thể trong phiên. Không đặt số suất nghĩa là chỉ giới hạn bởi tồn kho.
- **Giá hiệu lực:** giá áp dụng cho một biến thể tại một thời điểm. Bằng giá live khi đồng thời thỏa: phiên đang ở trạng thái `live`, biến thể có giá live, và biến thể còn suất (hoặc không đặt số suất). Các trường hợp còn lại bằng giá thường.
- **Thời gian thực:** sự kiện (bình luận, tim, ghim sản phẩm, số người xem, thay đổi giỏ hàng live, giá live, số suất còn lại, kết thúc phiên) hiển thị cho mọi người đang xem trong vòng 1 giây kể từ khi máy chủ ghi nhận, trong điều kiện mạng ổn định.
- **Ràng buộc kỹ thuật đã được duyệt:** video truyền bằng WebRTC qua media server tự host (MediaMTX), độ trễ mục tiêu dưới 1 giây; có phương án dự phòng HLS cho trình duyệt không kết nối được WebRTC. Không ghi hình phiên live.
- Thông báo lỗi nghiệp vụ hiển thị cho người dùng bằng tiếng Việt, theo chuẩn phong bì phản hồi `/api/v1` hiện có.

## Yêu cầu

### Yêu cầu 1: Tạo và bắt đầu phiên live

**User Story:** Là quản trị viên, tôi muốn chuẩn bị và bắt đầu một phiên live từ trình duyệt, để giới thiệu sản phẩm trực tiếp cho khách.

#### Tiêu chí chấp nhận

1.1. WHEN quản trị viên mở trang Livestream trong ứng dụng quản trị và không có phiên nào đang phát THEN hệ thống SHALL hiển thị biểu mẫu chuẩn bị gồm: tiêu đề phiên (bắt buộc, 1–120 ký tự), chọn sản phẩm cho giỏ hàng live (0–50 sản phẩm đang kinh doanh, tìm theo tên), giá live và số suất cho từng biến thể (Yêu cầu 8), chọn camera và micro, và khung xem trước hình ảnh từ camera.

1.2. IF trình duyệt từ chối hoặc không có quyền truy cập camera/micro THEN hệ thống SHALL hiển thị thông báo hướng dẫn cấp quyền và vô hiệu hóa nút "Bắt đầu phát".

1.3. WHEN quản trị viên nhấn "Bắt đầu phát" với dữ liệu hợp lệ THEN hệ thống SHALL tạo phiên live ở trạng thái `live`, bắt đầu truyền video và âm thanh từ camera/micro đã chọn, và chuyển giao diện sang chế độ đang phát.

1.4. IF tiêu đề rỗng hoặc quá 120 ký tự, hoặc danh sách sản phẩm vượt 50 hay chứa sản phẩm không tồn tại hoặc ngừng kinh doanh THEN API SHALL trả về HTTP 400 với `error.code` = `validation_error` và `error.fields` chỉ ra trường không hợp lệ.

1.5. IF đã có một phiên đang ở trạng thái `live` THEN hệ thống SHALL từ chối tạo phiên mới với HTTP 409, `error.code` = `livestream_already_active`, thông báo "Đang có một phiên live khác diễn ra"; giao diện quản trị SHALL đưa quản trị viên tới phiên đang phát.

1.6. IF lời gọi API quản lý phiên live không có phiên đăng nhập hợp lệ THEN hệ thống SHALL trả về HTTP 401; IF người gọi không có vai trò `admin` THEN hệ thống SHALL trả về HTTP 403.

1.7. Chỉ quản trị viên SHALL phát được video vào phiên live; media server SHALL từ chối mọi yêu cầu phát không kèm quyền phát hợp lệ của phiên đó.

1.8. IF media server không khả dụng khi quản trị viên nhấn "Bắt đầu phát" THEN hệ thống SHALL hiển thị "Không kết nối được máy chủ phát video" và không để lại phiên nào ở trạng thái `live`.

### Yêu cầu 2: Điều khiển khi đang phát và kết thúc phiên

**User Story:** Là quản trị viên, tôi muốn theo dõi và điều khiển phiên đang phát, để vừa bán hàng vừa tương tác với khách.

#### Tiêu chí chấp nhận

2.1. WHEN phiên đang phát THEN màn hình quản trị SHALL hiển thị: hình xem trước của chính mình, trạng thái kết nối phát ("Đang phát", "Mất kết nối – đang thử lại"), thời lượng đã phát, số người đang xem, tổng số tim, luồng bình luận thời gian thực, và giỏ hàng live kèm giá live, số suất đã bán/tổng số suất của từng biến thể.

2.2. WHEN quản trị viên bật/tắt micro hoặc camera trong lúc phát THEN hệ thống SHALL tắt/bật tương ứng âm thanh hoặc hình ảnh gửi tới người xem mà không kết thúc phiên.

2.3. WHEN quản trị viên nhấn "Kết thúc live" và xác nhận THEN hệ thống SHALL chuyển phiên sang `ended`, dừng truyền video, mọi giá live của phiên SHALL hết hiệu lực ngay, và mọi người xem SHALL nhận thông báo "Phiên live đã kết thúc" theo thời gian thực.

2.4. IF kết nối phát của quản trị viên bị gián đoạn THEN người xem SHALL thấy trạng thái "Đang chờ tín hiệu" thay cho video, phiên vẫn ở trạng thái `live` (giá live vẫn hiệu lực), và video SHALL tự tiếp tục khi quản trị viên phát lại, kể cả sau khi tải lại trang quản trị.

2.5. IF phiên ở trạng thái `live` nhưng không nhận được tín hiệu phát liên tục trong 10 phút THEN hệ thống SHALL tự động kết thúc phiên như tiêu chí 2.3.

2.6. WHEN phiên kết thúc THEN màn hình quản trị SHALL hiển thị tóm tắt: thời lượng, số người xem cao nhất, tổng số bình luận, tổng số tim, và số suất giá live đã bán của từng biến thể.

### Yêu cầu 3: Khách xem livestream

**User Story:** Là khách hàng, tôi muốn biết khi nào cửa hàng đang live và xem ngay, để không bỏ lỡ sản phẩm được giới thiệu.

#### Tiêu chí chấp nhận

3.1. WHEN có phiên đang ở trạng thái `live` THEN cửa hàng SHALL hiển thị cho mọi người truy cập (kể cả chưa đăng nhập) một lối vào có nhãn "LIVE" trên thanh điều hướng đầu trang và một khối giới thiệu phiên live (tiêu đề, nút "Xem ngay") trên trang chủ, dẫn tới trang xem live; WHEN không có phiên nào đang phát THEN các lối vào này SHALL không hiển thị.

3.2. IF người chưa đăng nhập mở trang xem live THEN hệ thống SHALL chuyển tới trang đăng nhập và sau khi đăng nhập thành công SHALL đưa người dùng trở lại đúng trang xem live; API và media server SHALL không cung cấp video, bình luận hay dữ liệu phiên cho người gọi chưa đăng nhập (HTTP 401 đối với API).

3.3. WHEN người dùng đã đăng nhập mở trang xem của một phiên `live` THEN hệ thống SHALL phát video trực tiếp kèm âm thanh, tiêu đề phiên, số người đang xem, tổng số tim, luồng bình luận, thẻ sản phẩm đang ghim (nếu có) và nút mở giỏ hàng live.

3.4. WHEN video phát trên trang xem THEN độ trễ từ camera của quản trị viên tới màn hình người xem SHALL không quá 1 giây khi dùng WebRTC, hoặc không quá 10 giây khi trình duyệt phải dùng phương án dự phòng HLS, trong điều kiện mạng ổn định.

3.5. IF trình duyệt chặn tự động phát có âm thanh THEN hệ thống SHALL phát video ở chế độ tắt tiếng và hiển thị nút "Bật âm thanh".

3.6. WHEN người dùng mở trang xem của một phiên đã `ended` THEN hệ thống SHALL hiển thị "Phiên live đã kết thúc" cùng liên kết tới trang sản phẩm; IF phiên không tồn tại THEN API SHALL trả về HTTP 404 với `error.code` = `livestream_not_found` và giao diện SHALL hiển thị "Không tìm thấy phiên live".

3.7. WHEN trang xem hiển thị trên màn hình có chiều rộng dưới 768px THEN video SHALL chiếm toàn bộ chiều cao màn hình, bình luận hiển thị chồng lên góc dưới bên trái video, nút thả tim và nút giỏ hàng live đặt ở cạnh phải/dưới, theo bố cục livestream mua sắm dạng dọc.

3.8. Số người đang xem SHALL bằng số người dùng khác nhau đang mở trang xem của phiên (một người mở nhiều tab tính là một, không tính quản trị viên đang phát); WHEN con số này thay đổi THEN hệ thống SHALL cập nhật cho mọi người xem và quản trị viên theo thời gian thực.

3.9. IF media server không khả dụng trong khi phiên đang `live` THEN trang xem SHALL hiển thị "Đang chờ tín hiệu"; bình luận, tim và giỏ hàng live SHALL tiếp tục hoạt động.

### Yêu cầu 4: Bình luận

**User Story:** Là khách hàng đang xem live, tôi muốn bình luận và thấy bình luận của người khác ngay lập tức, để hỏi về sản phẩm và tương tác với chủ shop.

#### Tiêu chí chấp nhận

4.1. WHEN người dùng đã đăng nhập gửi bình luận 1–200 ký tự (sau khi bỏ khoảng trắng đầu/cuối) trong phiên `live` THEN hệ thống SHALL lưu bình luận và hiển thị nó, kèm tên hiển thị của người gửi, cho mọi người xem và quản trị viên theo thời gian thực.

4.2. IF bình luận rỗng hoặc dài hơn 200 ký tự THEN API SHALL trả về HTTP 400 với `error.code` = `validation_error` và `error.fields.content`.

4.3. IF một khách hàng gửi bình luận khi chưa đủ 2 giây kể từ bình luận trước của chính họ trong cùng phiên THEN API SHALL trả về HTTP 429 với `error.code` = `rate_limited`, thông báo "Bạn bình luận quá nhanh, vui lòng thử lại sau giây lát"; giao diện SHALL giữ nguyên nội dung đang nhập.

4.4. WHEN một người mở trang xem live THEN hệ thống SHALL hiển thị tối đa 50 bình luận gần nhất chưa bị ẩn của phiên, sắp xếp từ cũ đến mới, rồi nối tiếp các bình luận mới theo thời gian thực.

4.5. WHEN quản trị viên gửi bình luận từ màn hình phát THEN bình luận SHALL hiển thị cho mọi người xem với nhãn "Chủ shop" nổi bật; giới hạn tần suất ở 4.3 SHALL không áp dụng cho quản trị viên.

4.6. WHEN quản trị viên ẩn một bình luận THEN bình luận đó SHALL biến mất khỏi màn hình của mọi người xem theo thời gian thực và không xuất hiện trong danh sách ở tiêu chí 4.4.

4.7. IF phiên đã `ended` THEN API SHALL từ chối bình luận mới với HTTP 409, `error.code` = `livestream_ended`, thông báo "Phiên live đã kết thúc".

### Yêu cầu 5: Thả tim

**User Story:** Là khách hàng đang xem live, tôi muốn chạm để thả tim liên tục, để thể hiện sự yêu thích và thấy không khí sôi động của phiên live.

#### Tiêu chí chấp nhận

5.1. WHEN khách hàng chạm nút tim THEN giao diện SHALL hiển thị ngay hiệu ứng tim bay lên trên màn hình của chính họ, không chờ phản hồi từ máy chủ.

5.2. WHEN máy chủ ghi nhận tim THEN hệ thống SHALL tăng tổng số tim của phiên, hiển thị hiệu ứng tim bay cho mọi người xem khác và quản trị viên, và cập nhật con số tổng mới theo thời gian thực.

5.3. Mỗi người dùng SHALL được tính tối đa 10 tim mỗi giây trong một phiên; các lần chạm vượt giới hạn vẫn hiển thị hiệu ứng trên máy của họ nhưng SHALL không được cộng vào tổng và không hiển thị lỗi cho người dùng.

5.4. WHEN một người mở trang xem live THEN hệ thống SHALL hiển thị tổng số tim hiện tại của phiên.

5.5. IF phiên đã `ended` THEN hệ thống SHALL không cộng thêm tim cho phiên đó.

### Yêu cầu 6: Giỏ hàng live

**User Story:** Là khách hàng đang xem live, tôi muốn xem các sản phẩm đang được giới thiệu và thêm vào giỏ hàng mà không rời khỏi live, để mua ngay khi đang hứng thú.

#### Tiêu chí chấp nhận

6.1. WHEN người xem mở giỏ hàng live THEN hệ thống SHALL hiển thị dạng bảng trượt lên (không rời trang, video tiếp tục phát) danh sách sản phẩm của phiên theo thứ tự quản trị viên sắp xếp. Mỗi sản phẩm gồm: ảnh đại diện, tên, khoảng giá hiệu lực, giá thường gạch ngang nếu có biến thể đang hưởng giá live, nhãn "Giá live" khi có, và trạng thái "Hết hàng" nếu không còn biến thể nào còn hàng.

6.2. WHEN khách hàng chọn một sản phẩm trong giỏ hàng live THEN hệ thống SHALL cho chọn biến thể theo các nhóm tùy chọn của sản phẩm, hiển thị giá hiệu lực của biến thể đang chọn và, nếu biến thể có số suất, dòng "Còn X suất giá live". WHEN khách nhấn "Thêm vào giỏ" và thêm thành công THEN biến thể SHALL được thêm vào giỏ hàng hiện có của khách với hành vi giống thêm từ trang chi tiết sản phẩm, và giao diện SHALL hiển thị "Đã thêm sản phẩm vào giỏ hàng" cùng số lượng trên biểu tượng giỏ hàng được cập nhật.

6.3. IF biến thể được chọn đã hết hàng, ngừng kinh doanh, hoặc số lượng trong giỏ đã đạt tồn kho THEN hệ thống SHALL giữ nguyên các mã lỗi và thông báo hiện có của giỏ hàng (`out_of_stock`, `stock_limit`, `cart_item_unavailable`) và hiển thị thông báo tương ứng trong bảng giỏ hàng live.

6.4. WHEN người xem nhấn vào tên sản phẩm trong giỏ hàng live THEN hệ thống SHALL mở trang chi tiết sản phẩm trong tab mới để không gián đoạn phiên live.

6.5. WHEN quản trị viên thêm, bỏ hoặc sắp xếp lại sản phẩm của giỏ hàng live trong lúc phát (tối đa 50 sản phẩm) THEN danh sách SHALL cập nhật cho mọi người xem theo thời gian thực; bỏ một sản phẩm khỏi giỏ hàng live SHALL đồng thời gỡ giá live của các biến thể thuộc sản phẩm đó.

6.6. IF một sản phẩm trong giỏ hàng live bị ngừng kinh doanh hoặc bị xóa khỏi danh mục THEN sản phẩm đó SHALL không còn hiển thị trong giỏ hàng live; giỏ hàng chính của khách tiếp tục theo quy tắc hiện có.

6.7. WHEN giá hiệu lực hoặc số suất còn lại của một biến thể trong giỏ hàng live thay đổi (quản trị viên sửa, hết suất, phiên kết thúc) THEN bảng giỏ hàng live đang mở SHALL cập nhật theo thời gian thực.

### Yêu cầu 7: Ghim sản phẩm đang giới thiệu

**User Story:** Là quản trị viên, tôi muốn ghim sản phẩm mình đang giới thiệu, để khách thấy ngay và bấm mua.

#### Tiêu chí chấp nhận

7.1. WHEN quản trị viên ghim một sản phẩm thuộc giỏ hàng live THEN mọi người xem SHALL thấy thẻ sản phẩm nổi trên video (ảnh, tên, khoảng giá hiệu lực, nhãn "Giá live" khi có, nút "Mua ngay") theo thời gian thực; tại mỗi thời điểm có tối đa một sản phẩm được ghim, và ghim sản phẩm mới SHALL thay thế sản phẩm cũ.

7.2. WHEN người xem nhấn "Mua ngay" trên thẻ ghim THEN hệ thống SHALL mở giỏ hàng live ở bước chọn biến thể của sản phẩm đó (tiêu chí 6.2).

7.3. WHEN quản trị viên bỏ ghim, hoặc bỏ sản phẩm đang ghim khỏi giỏ hàng live THEN thẻ ghim SHALL biến mất khỏi màn hình mọi người xem theo thời gian thực.

7.4. WHEN một người mở trang xem live trong lúc có sản phẩm đang ghim THEN hệ thống SHALL hiển thị ngay thẻ ghim đó.

### Yêu cầu 8: Giá live và số suất

**User Story:** Là quản trị viên, tôi muốn đặt giá ưu đãi riêng cho live và giới hạn số suất, để tạo động lực chốt đơn ngay trong phiên.

#### Tiêu chí chấp nhận

8.1. WHEN quản trị viên đặt giá live cho một biến thể thuộc sản phẩm trong giỏ hàng live THEN giá live SHALL là số nguyên VND lớn hơn 0 và nhỏ hơn giá thường hiện tại của biến thể; số suất, nếu nhập, SHALL là số nguyên từ 1 đến 100000. IF giá trị không hợp lệ THEN API SHALL trả về HTTP 400 với `error.code` = `validation_error` và `error.fields` chỉ ra biến thể và trường không hợp lệ.

8.2. Quản trị viên SHALL đặt, sửa và gỡ giá live, số suất của từng biến thể cả trong bước chuẩn bị (Yêu cầu 1.1) lẫn trong lúc phiên đang `live`. IF số suất mới nhỏ hơn số suất đã bán THEN API SHALL trả về HTTP 400 với `error.code` = `validation_error`, thông báo số suất không được nhỏ hơn số đã bán.

8.3. WHILE phiên đang `live` THEN giá hiệu lực của biến thể SHALL được áp dụng nhất quán cho mọi khách hàng (không phân biệt có đang xem live hay không) tại: giỏ hàng live, thẻ ghim, trang chi tiết sản phẩm (kèm nhãn "Giá live" và giá thường gạch ngang), giỏ hàng, trang thanh toán và đơn hàng được tạo.

8.4. Danh sách sản phẩm, thẻ sản phẩm ở trang danh mục/trang chủ, bộ lọc và sắp xếp theo giá SHALL tiếp tục dùng giá thường.

8.5. WHEN khách hàng đặt hàng có biến thể đang hưởng giá live THEN đơn hàng SHALL ghi nhận giá live làm đơn giá của dòng đó, và số suất đã bán của biến thể SHALL tăng đúng bằng số lượng của dòng, nguyên tử với việc tạo đơn: hai khách đặt đồng thời SHALL không làm tổng số suất đã bán vượt số suất.

8.6. IF số lượng của một dòng đặt hàng lớn hơn số suất giá live còn lại của biến thể (và còn ít nhất 1 suất) THEN hệ thống SHALL từ chối tạo đơn với HTTP 409, `error.code` = `live_quota_exceeded`, thông báo "Chỉ còn X suất giá live cho [tên sản phẩm]. Vui lòng giảm số lượng."; không suất nào bị trừ và không đơn nào được tạo.

8.7. WHEN số suất đã bán bằng số suất THEN biến thể SHALL về giá thường ngay, giỏ hàng live và thẻ ghim SHALL hiển thị "Hết suất giá live" theo thời gian thực.

8.8. WHEN phiên kết thúc THEN mọi biến thể của phiên SHALL về giá thường ngay. IF khách đang ở trang thanh toán với giá live khi giá hiệu lực đã đổi (phiên kết thúc, hết suất, quản trị viên sửa giá) THEN việc đặt hàng SHALL bị từ chối theo luồng sản phẩm đã thay đổi hiện có (HTTP 409, `error.code` = `product_changed`), và khách SHALL thấy giá mới trước khi đặt lại.

8.9. WHEN một đơn hàng có dòng mua với giá live chuyển sang trạng thái `cancelled` trong lúc phiên tương ứng vẫn `live` THEN số suất đã bán của biến thể SHALL giảm đúng bằng số lượng của dòng đó; IF phiên đã `ended` THEN số suất không thay đổi.

8.10. Đơn hàng đã tạo SHALL giữ nguyên đơn giá đã ghi nhận sau khi phiên kết thúc; hoàn tiền đổi trả SHALL tính theo đơn giá đã ghi nhận, như quy tắc hiện có.

### Yêu cầu 9: Tương thích với hệ thống hiện có

#### Tiêu chí chấp nhận

9.1. Khi không có phiên nào đang `live`, giỏ hàng, đặt hàng, giá, tồn kho, đổi trả và trang chi tiết sản phẩm SHALL hoạt động y như hiện tại.

9.2. Chat hỗ trợ khách hàng và thông báo hiện có SHALL giữ nguyên hành vi; sự kiện livestream SHALL không xuất hiện trong hộp chat hay danh sách thông báo.

9.3. Các trang và API hiện có của cửa hàng và ứng dụng quản trị SHALL hoạt động bình thường khi media server không chạy.

9.4. Số liệu trang tổng quan quản trị SHALL tiếp tục tính theo đơn giá đã ghi nhận trên đơn hàng, không cần thay đổi định nghĩa số liệu.

### Yêu cầu 10: Ngoài phạm vi

10.1. Tính năng này SHALL không bao gồm: ghi hình và xem lại phiên live; lên lịch phiên live và gửi thông báo khi bắt đầu live; giới hạn số suất trên mỗi khách hàng; giá live dạng phần trăm; giữ giá live sau khi phiên kết thúc; nhiều phiên live đồng thời; nhiều người cùng phát (khách mời); chặn người dùng khỏi phiên live; trang lịch sử các phiên live đã kết thúc; thống kê doanh thu theo phiên live.
