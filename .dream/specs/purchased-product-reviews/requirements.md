# Yêu Cầu Tính Năng Đánh Giá Sản Phẩm Đã Mua

## Bối Cảnh

Khách hàng cần có thể đánh giá sản phẩm sau khi đơn hàng đã được giao, còn người xem sản phẩm cần thấy điểm đánh giá và nhận xét thực tế thay cho số liệu minh họa cố định. Hệ thống hiện đã lưu quan hệ giữa khách hàng, đơn hàng, từng sản phẩm trong đơn và thời điểm giao hàng; trang lịch sử đơn hàng cũng đã có chỉ số "Chờ đánh giá" nhưng chỉ số này hiện phản ánh số đơn đã giao, chưa phản ánh các sản phẩm thực sự còn chờ đánh giá.

Tính năng phục vụ hai nhóm người dùng:

- Khách hàng đã đăng nhập và đã nhận sản phẩm: tạo và chỉnh sửa đánh giá của chính mình.
- Mọi người xem sản phẩm: đọc tổng quan điểm số và danh sách đánh giá đã xác minh mua hàng.

## Định Nghĩa Miền

- **Đánh giá sản phẩm**: Điểm sao, nhận xét tùy chọn và media tùy chọn do một khách hàng gửi cho một sản phẩm.
- **Mua hàng đã xác minh**: Quan hệ được hệ thống xác nhận khi dòng hàng nguồn thuộc đơn hàng của chính khách hàng và đơn đang ở trạng thái `delivered` tại thời điểm tạo đánh giá.
- **Dòng hàng đủ điều kiện đánh giá**: Dòng hàng thuộc đơn `delivered` của khách hàng và chưa có đánh giá gắn với chính dòng hàng đó.
- **Đánh giá duy nhất**: Tối đa một đánh giá cho mỗi dòng hàng trong đơn; các dòng hàng hoặc lần mua khác nhau của cùng sản phẩm có quyền đánh giá riêng, còn số lượng nhiều hơn một trong cùng dòng hàng không tạo thêm quyền đánh giá.
- **Media đánh giá**: Ảnh hoặc video do khách hàng tải lên qua hệ thống và được gắn với một đánh giá theo thứ tự hiển thị xác định.
- **Lượt chỉnh sửa**: Một lần cập nhật đánh giá hoàn tất thành công sau khi tạo; thao tác thất bại không tiêu hao lượt chỉnh sửa.
- **Tổng quan đánh giá**: Điểm trung bình và tổng số đánh giá hiện có của một sản phẩm.
- **Dòng hàng chờ đánh giá**: Dòng hàng đủ điều kiện đánh giá của một khách hàng.

## Phạm Vi

### Trong Phạm Vi

- Xác định quyền đánh giá từ dữ liệu đơn hàng thuộc khách hàng.
- Tạo một đánh giá gồm điểm sao bắt buộc, nhận xét tùy chọn và tối đa 5 tệp media tùy chọn.
- Chỉnh sửa điểm sao, nhận xét và toàn bộ danh sách media trong đánh giá của chính khách hàng đúng một lần.
- Upload ảnh và video qua backend tới MinIO.
- Hiển thị một section đánh giá riêng trên trang chi tiết sản phẩm, gồm tổng quan và danh sách đánh giá đã xác minh của mọi khách hàng.
- Hiển thị trạng thái đánh giá theo từng sản phẩm trong chi tiết đơn hàng.
- Tính đúng số sản phẩm "Chờ đánh giá" trong lịch sử đơn hàng.
- Giữ tính đúng đắn khi một sản phẩm được mua nhiều lần hoặc một đơn hàng thay đổi sang trạng thái trả hàng sau khi đã đánh giá.

### Ngoài Phạm Vi

- Phản hồi của người bán, bình luận theo luồng, lượt thích hoặc báo cáo đánh giá.
- Kiểm duyệt hoặc quản trị đánh giá trong giao diện quản trị.
- Xóa đánh giá bởi khách hàng.
- Đánh giá theo từng biến thể; mọi đánh giá được tổng hợp ở cấp sản phẩm.
- Cửa sổ thời gian hết hạn quyền đánh giá.
- Chỉnh sửa riêng lẻ nhiều lần cho điểm, nhận xét hoặc media.
- Upload trực tiếp từ trình duyệt tới MinIO bằng presigned URL.
- Chuyển mã, nén hoặc biên tập ảnh/video sau khi tải lên.
- Tạo trang công khai mới cho sản phẩm đang không được hiển thị trong danh mục.

## Yêu Cầu

### REQ-REVIEW-01 — Xác Định Quyền Đánh Giá Từ Đơn Đã Giao

**Câu Chuyện Người Dùng**

Là một khách hàng,
tôi muốn chỉ đánh giá sản phẩm mình đã thực sự nhận,
để các đánh giá công khai phản ánh trải nghiệm mua hàng đã xác minh.

#### Yêu Cầu Hành Vi

Khi khách hàng yêu cầu tạo đánh giá cho một dòng hàng, hệ thống phải tự xác minh rằng dòng hàng đó thuộc đơn hàng của chính khách hàng, xác định sản phẩm và phân loại từ dữ liệu dòng hàng, đồng thời xác minh đơn đang ở trạng thái `delivered`.

Khi hiển thị chi tiết đơn hàng, hệ thống phải cho biết với từng sản phẩm liệu khách hàng có thể tạo đánh giá mới hay đã có đánh giá để xem hoặc chỉnh sửa.

#### Bất Biến

- `INV-REVIEW-01-01` — Quyền đánh giá và sản phẩm nhận đánh giá phải được xác định từ dòng hàng thuộc đơn, không được suy ra chỉ từ mã sản phẩm, mã phân loại hoặc mã đơn do phía khách hàng cung cấp.
- `INV-REVIEW-01-02` — Đơn hàng của khách hàng khác không bao giờ cấp quyền đánh giá.
- `INV-REVIEW-01-03` — Mỗi dòng hàng cấp tối đa một quyền đánh giá, không phụ thuộc số lượng của dòng hàng đó.
- `INV-REVIEW-01-04` — Hai dòng hàng khác nhau, kể cả khi cùng sản phẩm hoặc cùng phân loại, cấp hai quyền đánh giá độc lập khi mỗi dòng đều thuộc đơn `delivered` của khách hàng.

#### Hành Vi Lỗi / Phụ Thuộc Trạng Thái

Nếu không tồn tại giao dịch mua đủ điều kiện, hệ thống phải từ chối tạo đánh giá với lỗi nghiệp vụ `review_not_eligible` và thông báo tiếng Việt.

Nếu sản phẩm đã mua hiện không còn được hiển thị công khai trong danh mục, quyền đánh giá từ đơn `delivered` vẫn được giữ nhưng hành vi ẩn sản phẩm công khai hiện có không thay đổi.

#### Tiêu Chí Chấp Nhận

**AC-REVIEW-01-01**

Cho trước một khách hàng có dòng hàng trong đơn `delivered`, khi khách hàng mở chi tiết đơn, thì mỗi dòng hàng chưa được đánh giá hiển thị hành động tạo đánh giá.

**AC-REVIEW-01-02**

Cho trước dòng hàng thuộc đơn chưa giao, đã hủy hoặc thuộc khách hàng khác, khi khách hàng cố tạo đánh giá, thì không có đánh giá mới và hệ thống trả lỗi `review_not_eligible` bằng tiếng Việt.

**AC-REVIEW-01-03**

Cho trước cùng một sản phẩm xuất hiện ở hai dòng hàng thuộc một hoặc nhiều đơn `delivered` của khách hàng, khi xác định quyền đánh giá, thì mỗi dòng hàng có một quyền đánh giá riêng; nếu một dòng có số lượng lớn hơn một thì dòng đó vẫn chỉ có một quyền.

### REQ-REVIEW-02 — Tạo Đánh Giá Hợp Lệ

**Câu Chuyện Người Dùng**

Là một khách hàng đã nhận sản phẩm,
tôi muốn chấm sao và có thể viết nhận xét,
để chia sẻ trải nghiệm của mình với người mua khác.

#### Yêu Cầu Hành Vi

Khi khách hàng đủ điều kiện gửi đánh giá hợp lệ cho một dòng hàng, hệ thống phải tạo đánh giá cho sản phẩm và phân loại được xác định từ dòng hàng đó, lưu các media hợp lệ theo thứ tự khách hàng chọn, đánh dấu đây là mua hàng đã xác minh và trả về đánh giá đã tạo.

Hệ thống phải yêu cầu điểm đánh giá là số nguyên từ 1 đến 5. Nhận xét là tùy chọn; khi có nội dung sau khi loại bỏ khoảng trắng ở đầu và cuối, nội dung không được vượt quá 1000 ký tự.

Hệ thống phải chấp nhận tối đa 5 tệp media cho một đánh giá, trong đó có tối đa 2 video. Ảnh chỉ được chấp nhận ở định dạng JPEG, PNG hoặc WebP và không vượt quá 5 MiB (5.242.880 bytes) mỗi tệp. Video chỉ được chấp nhận ở định dạng MP4 hoặc WebM và không vượt quá 50 MiB (52.428.800 bytes) mỗi tệp. Tệp đúng giới hạn được chấp nhận và tệp lớn hơn giới hạn dù chỉ 1 byte bị từ chối. Hệ thống phải xác minh loại nội dung thực tế thay vì chỉ dựa vào tên tệp hoặc khai báo từ khách hàng.

Khi khách hàng gửi đánh giá có media, backend phải tiếp nhận và truyền luồng tệp tới MinIO; khách hàng không tải trực tiếp lên MinIO.

#### Bất Biến

- `INV-REVIEW-02-01` — Mọi đánh giá công khai đều phải gắn với một giao dịch mua đã được hệ thống xác minh.
- `INV-REVIEW-02-02` — Nội dung nhận xét được coi là văn bản thuần túy và không được thực thi hoặc hiển thị như HTML.
- `INV-REVIEW-02-03` — Thời điểm tạo đánh giá không thay đổi khi đánh giá được chỉnh sửa.
- `INV-REVIEW-02-04` — Mọi media công khai của đánh giá phải do hệ thống tiếp nhận, xác minh và sở hữu tham chiếu; khách hàng không thể gắn URL media tùy ý.
- `INV-REVIEW-02-05` — Một đánh giá không bao giờ có quá 5 media hoặc quá 2 video.

#### Hành Vi Lỗi / Phụ Thuộc Trạng Thái

Nếu điểm sao không phải số nguyên từ 1 đến 5, nhận xét vượt quá 1000 ký tự, số tệp vượt giới hạn, số video vượt giới hạn, định dạng không được hỗ trợ hoặc kích thước tệp vượt giới hạn, hệ thống phải từ chối toàn bộ thao tác bằng lỗi xác thực, chỉ rõ trường không hợp lệ và không tạo đánh giá một phần.

Nếu nhận xét chỉ chứa khoảng trắng, hệ thống phải lưu đánh giá như một đánh giá chỉ có điểm sao.

Nếu lưu đánh giá thất bại sau khi một hoặc nhiều media đã được truyền tới MinIO, hệ thống phải không công khai các media đó và phải loại bỏ chúng khỏi MinIO. Khi MinIO hoạt động liên tục, mọi object không còn được tham chiếu phải được xóa vật lý trong tối đa 90 phút; nếu MinIO gián đoạn, thời hạn tối đa 90 phút được tính lại từ khi kết nối phục hồi.

#### Tiêu Chí Chấp Nhận

**AC-REVIEW-02-01**

Cho trước một dòng hàng đủ điều kiện chưa được đánh giá, khi khách hàng gửi điểm từ 1 đến 5, nhận xét hợp lệ và media hợp lệ, thì một đánh giá mua hàng đã xác minh được tạo cho đúng sản phẩm và phân loại của dòng hàng, đồng thời có thể đọc lại với media theo đúng thứ tự đã gửi.

**AC-REVIEW-02-02**

Cho trước một dòng hàng đủ điều kiện, khi khách hàng gửi đánh giá chỉ có điểm sao hợp lệ, thì đánh giá được tạo với nhận xét trống.

**AC-REVIEW-02-03**

Cho trước điểm sao ngoài phạm vi, không nguyên, nhận xét dài hơn 1000 ký tự hoặc media vi phạm bất kỳ giới hạn nào, khi khách hàng gửi đánh giá, thì hệ thống trả lỗi xác thực cho đúng trường và không tạo đánh giá.

**AC-REVIEW-02-04**

Cho trước nhận xét chứa cú pháp HTML hoặc script, khi đánh giá được hiển thị, thì người xem chỉ thấy nội dung văn bản và không có mã nào được thực thi.

**AC-REVIEW-02-05**

Cho trước khách hàng chọn 3 ảnh hợp lệ và 2 video hợp lệ, khi tạo đánh giá thành công, thì cả 5 media được hiển thị đúng thứ tự và không có tệp thứ sáu nào được chấp nhận.

**AC-REVIEW-02-06**

Cho trước tệp có phần mở rộng hợp lệ nhưng nội dung thực tế không khớp định dạng được hỗ trợ, khi gửi đánh giá, thì thao tác bị từ chối và không có media hoặc đánh giá công khai mới.

**AC-REVIEW-02-07**

Cho trước MinIO lỗi giữa quá trình upload, khi thao tác kết thúc, thì không có đánh giá một phần, không có media công khai mới và người dùng nhận được lỗi có thể thử lại.

**AC-REVIEW-02-08**

Cho trước ảnh hoặc video hợp lệ có kích thước đúng giới hạn byte, khi gửi đánh giá, thì tệp được chấp nhận; khi cùng loại tệp lớn hơn giới hạn 1 byte, thì thao tác bị từ chối bằng lỗi xác thực trường media.

**AC-REVIEW-02-09**

Cho trước object đã upload nhưng thao tác đánh giá thất bại và MinIO tiếp tục hoạt động, khi 90 phút trôi qua, thì object đó không còn tồn tại trong MinIO.

### REQ-REVIEW-03 — Bảo Đảm Một Đánh Giá Cho Mỗi Dòng Hàng

#### Yêu Cầu Hành Vi

Hệ thống phải bảo đảm tối đa một đánh giá cho mỗi dòng hàng, kể cả khi nhiều yêu cầu tạo được gửi đồng thời.

#### Bất Biến

- `INV-REVIEW-03-01` — Không trạng thái cạnh tranh nào được tạo ra hai đánh giá cho cùng một dòng hàng.
- `INV-REVIEW-03-02` — Mỗi đánh giá chỉ đóng góp một lần vào tổng số và điểm trung bình của sản phẩm.

#### Hành Vi Lỗi / Phụ Thuộc Trạng Thái

Nếu dòng hàng đã có đánh giá và khách hàng tiếp tục yêu cầu tạo mới, hệ thống phải giữ nguyên đánh giá hiện có và trả lỗi nghiệp vụ `review_already_exists` bằng tiếng Việt; khách hàng có thể chuyển sang chỉnh sửa đánh giá đó.

Nếu client không biết mutation đã thành công hay chưa do timeout hoặc mất kết nối, client phải tải lại trạng thái đánh giá có thẩm quyền trước khi quyết định cho phép gửi lại.

#### Tiêu Chí Chấp Nhận

**AC-REVIEW-03-01**

Cho trước khách hàng đã đánh giá một dòng hàng, khi khách hàng gửi yêu cầu tạo mới cho cùng dòng hàng, thì không có đánh giá thứ hai và hệ thống trả `review_already_exists`; một dòng hàng khác từ lần mua khác vẫn có thể được đánh giá riêng.

**AC-REVIEW-03-02**

Cho trước hai yêu cầu tạo đồng thời cho cùng dòng hàng, khi cả hai hoàn tất, thì chỉ một đánh giá tồn tại và chỉ một yêu cầu thành công.

**AC-REVIEW-03-03**

Cho trước client bị timeout khi tạo đánh giá, khi kết nối phục hồi, thì client tải lại review state của dòng hàng; nếu review đã tồn tại thì hiển thị kết quả đó và không gửi lại, còn nếu dòng hàng vẫn đủ điều kiện thì cho phép người dùng thử lại.

### REQ-REVIEW-04 — Chỉnh Sửa Đánh Giá Của Chính Khách Hàng

**Câu Chuyện Người Dùng**

Là người đã gửi đánh giá,
tôi muốn sửa điểm sao hoặc nhận xét,
để cập nhật trải nghiệm của mình mà không tạo đánh giá trùng lặp.

#### Yêu Cầu Hành Vi

Khi chủ sở hữu chưa sử dụng lượt chỉnh sửa gửi một bản cập nhật hợp lệ, hệ thống phải cập nhật nguyên tử chính đánh giá hiện có gồm điểm sao, nhận xét và toàn bộ danh sách media, giữ nguyên trạng thái mua hàng đã xác minh, ghi nhận thời điểm cập nhật mới và đánh dấu lượt chỉnh sửa đã được sử dụng.

Trong lần chỉnh sửa, khách hàng phải có thể giữ nguyên, loại bỏ, sắp xếp lại media hiện có và thêm media mới trong cùng một thao tác, miễn trạng thái cuối cùng tuân thủ mọi giới hạn media.

#### Bất Biến

- `INV-REVIEW-04-01` — Khách hàng chỉ được chỉnh sửa đánh giá của chính mình.
- `INV-REVIEW-04-02` — Việc chỉnh sửa không được thay đổi khách hàng, sản phẩm, phân loại hoặc dòng hàng nguồn của đánh giá.
- `INV-REVIEW-04-03` — Mỗi đánh giá có tối đa một lần cập nhật thành công sau khi tạo, kể cả khi có nhiều yêu cầu chỉnh sửa đồng thời.
- `INV-REVIEW-04-04` — Đánh giá và danh sách media công khai của nó luôn cùng phản ánh trạng thái trước hoặc sau chỉnh sửa, không phản ánh trạng thái pha trộn.

#### Hành Vi Lỗi / Phụ Thuộc Trạng Thái

Nếu đánh giá không tồn tại hoặc không thuộc khách hàng hiện tại, hệ thống phải không tiết lộ thông tin sở hữu, không thay đổi dữ liệu và trả lỗi không tìm thấy bằng tiếng Việt.

Việc đơn hàng nguồn chuyển sang `returned` sau khi đánh giá đã được tạo không được tự động xóa, ẩn hoặc vô hiệu hóa quyền chỉnh sửa đánh giá đó.

Nếu lượt chỉnh sửa đã được sử dụng, hệ thống phải giữ nguyên đánh giá và trả lỗi nghiệp vụ `review_edit_limit_reached` bằng tiếng Việt.

Nếu chỉnh sửa thất bại do xác thực, xung đột, lỗi MinIO hoặc lỗi hệ thống, lượt chỉnh sửa phải còn nguyên và trạng thái đánh giá cùng media công khai phải không đổi. Media mới đã upload trong thao tác thất bại phải không được công khai và phải được loại bỏ khỏi MinIO; media bị yêu cầu loại bỏ chỉ được xóa khỏi MinIO sau khi cập nhật đánh giá đã thành công. Thời hạn xóa vật lý tuân theo giới hạn 90 phút của REQ-REVIEW-02.

#### Tiêu Chí Chấp Nhận

**AC-REVIEW-04-01**

Cho trước đánh giá chưa được chỉnh sửa, khi khách hàng gửi điểm sao, nhận xét và danh sách media mới hợp lệ, thì cùng một đánh giá được cập nhật nguyên tử, thời điểm tạo giữ nguyên, thời điểm cập nhật tăng lên và lượt chỉnh sửa được đánh dấu đã dùng.

**AC-REVIEW-04-02**

Cho trước đánh giá của khách hàng khác, khi người dùng cố chỉnh sửa, thì hệ thống trả lỗi không tìm thấy và nội dung đánh giá không đổi.

**AC-REVIEW-04-03**

Cho trước đánh giá đã được tạo khi đơn ở trạng thái `delivered`, khi đơn sau đó chuyển sang `returned`, thì đánh giá vẫn được hiển thị và chủ sở hữu vẫn có thể chỉnh sửa.

**AC-REVIEW-04-04**

Cho trước đánh giá đã có một lần chỉnh sửa thành công, khi chủ sở hữu gửi cập nhật tiếp theo, thì hệ thống trả `review_edit_limit_reached` và điểm, nhận xét, media cùng thời điểm cập nhật không đổi.

**AC-REVIEW-04-05**

Cho trước đánh giá chưa được chỉnh sửa, khi một lần chỉnh sửa thất bại, thì khách hàng vẫn còn một lượt chỉnh sửa và có thể gửi lại thành công sau đó.

**AC-REVIEW-04-06**

Cho trước hai yêu cầu chỉnh sửa đồng thời cho một đánh giá chưa từng sửa, khi cả hai hoàn tất, thì đúng một yêu cầu thành công và yêu cầu còn lại nhận `review_edit_limit_reached` bằng tiếng Việt.

### REQ-REVIEW-05 — Hiển Thị Danh Sách Đánh Giá Công Khai

**Câu Chuyện Người Dùng**

Là người đang xem sản phẩm,
tôi muốn đọc các đánh giá đã xác minh,
để tham khảo trải nghiệm của khách hàng đã mua.

#### Yêu Cầu Hành Vi

Khi người dùng mở section đánh giá của một sản phẩm công khai, hệ thống phải hiển thị đánh giá từ mọi dòng hàng đã được đánh giá của sản phẩm đó theo thứ tự mới cập nhật gần nhất trước, hỗ trợ phân trang và cung cấp điểm sao, nhận xét, thông tin phân loại đã mua, danh sách media theo thứ tự, nhãn mua hàng đã xác minh, thời điểm tạo, thời điểm cập nhật và trạng thái còn quyền chỉnh sửa cho chính người xem nếu đã đăng nhập.

Hệ thống phải hiển thị tác giả bằng nhãn trung lập "Khách hàng đã mua hàng" và không công khai email, mã người dùng hoặc dữ liệu cá nhân khác.

#### Bất Biến

- `INV-REVIEW-05-01` — Mọi đánh giá trong danh sách công khai đều mang trạng thái mua hàng đã xác minh.
- `INV-REVIEW-05-02` — Thứ tự giữa các đánh giá có cùng thời điểm cập nhật phải ổn định giữa các lần đọc khi dữ liệu không thay đổi.
- `INV-REVIEW-05-03` — Media đã bị loại khỏi một đánh giá sau chỉnh sửa không còn xuất hiện qua bề mặt công khai của tính năng.

#### Hành Vi Lỗi / Phụ Thuộc Trạng Thái

Nếu sản phẩm chưa có đánh giá, hệ thống phải trả danh sách rỗng và giao diện hiển thị trạng thái "Chưa có đánh giá" thay vì số liệu minh họa.

Nếu yêu cầu phân trang không hợp lệ, hệ thống phải trả lỗi xác thực trường tương ứng và không trả một trang kết quả mơ hồ.

#### Tiêu Chí Chấp Nhận

**AC-REVIEW-05-01**

Cho trước sản phẩm có nhiều đánh giá, khi bất kỳ người dùng nào mở trang chi tiết sản phẩm, thì họ đọc được trang đánh giá theo thứ tự cập nhật giảm dần mà không cần đăng nhập.

**AC-REVIEW-05-02**

Cho trước một đánh giá công khai, khi hiển thị đánh giá, thì có nhãn "Khách hàng đã mua hàng" và không có email hoặc mã người dùng của tác giả.

**AC-REVIEW-05-03**

Cho trước sản phẩm chưa có đánh giá, khi mở trang chi tiết, thì giao diện hiển thị "Chưa có đánh giá" và không hiển thị điểm hoặc số lượng giả định.

**AC-REVIEW-05-04**

Cho trước đánh giá có nhiều ảnh và video, khi người dùng xem trên desktop hoặc mobile, thì media hiển thị theo đúng thứ tự, ảnh có mô tả truy cập và video có điều khiển phát/tạm dừng bằng bàn phím.

**AC-REVIEW-05-05**

Cho trước nhiều khách hàng hoặc nhiều dòng hàng đã gửi đánh giá cho một sản phẩm, khi mở section đánh giá trên trang chi tiết sản phẩm, thì tổng quan và danh sách bao gồm mọi đánh giá của sản phẩm, đồng thời mỗi đánh giá cho biết phân loại đã mua mà không làm lộ dữ liệu cá nhân.

### REQ-REVIEW-06 — Tổng Hợp Điểm Đánh Giá Chính Xác

#### Yêu Cầu Hành Vi

Khi tổng quan đánh giá của sản phẩm được đọc, hệ thống phải cung cấp tổng số đánh giá từ mọi dòng hàng của sản phẩm và trung bình cộng của điểm sao hiện tại, làm tròn đến một chữ số thập phân theo quy tắc round half up; ví dụ `4,25` hiển thị thành `4,3`.

Khi đánh giá được tạo hoặc chỉnh sửa điểm sao, lần đọc tổng quan tiếp theo phải phản ánh dữ liệu mới.

#### Bất Biến

- `INV-REVIEW-06-01` — Tổng số đánh giá bằng số đánh giá duy nhất hiện có của sản phẩm.
- `INV-REVIEW-06-02` — Điểm trung bình chỉ được tính từ các đánh giá hiện có của đúng sản phẩm.

#### Hành Vi Lỗi / Phụ Thuộc Trạng Thái

Nếu sản phẩm chưa có đánh giá, tổng số phải là `0` và hệ thống không được biểu diễn rằng sản phẩm đã đạt một điểm trung bình cụ thể.

#### Tiêu Chí Chấp Nhận

**AC-REVIEW-06-01**

Cho trước một sản phẩm có các điểm 5, 4 và 2, khi đọc tổng quan, thì tổng số là 3 và điểm hiển thị là 3,7.

**AC-REVIEW-06-02**

Cho trước khách hàng đổi điểm từ 2 thành 5, khi đọc lại tổng quan, thì tổng số không đổi và điểm trung bình phản ánh điểm 5 mới.

**AC-REVIEW-06-03**

Cho trước sản phẩm chưa có đánh giá, khi đọc tổng quan, thì tổng số là 0 và giao diện không hiển thị số `5.0` hoặc một điểm mặc định khác.

**AC-REVIEW-06-04**

Cho trước điểm trung bình chính xác là `4,25`, khi đọc tổng quan, thì điểm hiển thị là `4,3`.

### REQ-REVIEW-07 — Đồng Bộ Trạng Thái Đánh Giá Trong Luồng Đơn Hàng

**Câu Chuyện Người Dùng**

Là một khách hàng,
tôi muốn biết chính xác sản phẩm nào còn chờ đánh giá,
để hoàn thành đánh giá trực tiếp từ lịch sử mua hàng.

#### Yêu Cầu Hành Vi

Khi khách hàng xem chi tiết đơn `delivered`, hệ thống phải hiển thị hành động "Đánh giá" cho mỗi dòng hàng đủ điều kiện và hành động "Xem/Sửa đánh giá" cho dòng hàng đã được đánh giá.

Khi hệ thống cung cấp chỉ số "Chờ đánh giá", chỉ số phải bằng số dòng hàng thuộc các đơn hiện đang `delivered` của khách hàng mà chưa có đánh giá.

Khi khách hàng tạo đánh giá thành công, trạng thái của dòng hàng trong chi tiết đơn và chỉ số "Chờ đánh giá" phải phản ánh rằng dòng hàng không còn chờ đánh giá ở lần đọc tiếp theo.

#### Bất Biến

- `INV-REVIEW-07-01` — Mỗi dòng hàng chưa đánh giá trong đơn `delivered` đóng góp đúng một đơn vị vào chỉ số "Chờ đánh giá", không phụ thuộc số lượng của dòng.
- `INV-REVIEW-07-02` — Dòng hàng đã được đánh giá không đóng góp vào chỉ số "Chờ đánh giá".
- `INV-REVIEW-07-03` — Chỉ số "Chờ đánh giá" không bao gồm dòng hàng thuộc đơn chưa giao, đã hủy hoặc `returned`.

#### Hành Vi Lỗi / Phụ Thuộc Trạng Thái

Nếu không tải được trạng thái đánh giá, giao diện phải hiển thị trạng thái lỗi có thể thử lại và không được giả định dòng hàng đủ điều kiện hoặc chưa được đánh giá.

Nếu một sản phẩm xuất hiện ở nhiều dòng hàng, trạng thái đánh giá của từng dòng phải độc lập; đánh giá ở một dòng không được làm mất quyền đánh giá của dòng khác.

#### Tiêu Chí Chấp Nhận

**AC-REVIEW-07-01**

Cho trước một đơn `delivered` có ba dòng hàng, trong đó một dòng đã được đánh giá, khi đọc chỉ số "Chờ đánh giá", thì chỉ số tăng thêm 2.

**AC-REVIEW-07-02**

Cho trước cùng một sản phẩm chưa đánh giá xuất hiện trong hai dòng hàng của một hoặc nhiều đơn `delivered`, khi đọc chỉ số, thì hai dòng hàng được tính hai lần.

**AC-REVIEW-07-03**

Cho trước khách hàng vừa tạo đánh giá thành công từ một dòng trong chi tiết đơn, khi dữ liệu được tải lại, thì hành động của dòng đó chuyển thành "Xem/Sửa đánh giá", các dòng khác giữ trạng thái riêng và chỉ số "Chờ đánh giá" giảm đúng một.

**AC-REVIEW-07-04**

Cho trước một đơn chuyển từ `delivered` sang `returned` trước khi khách hàng đánh giá, khi đọc lại chỉ số, thì các dòng hàng chưa đánh giá của đơn đó không còn được tính là chờ đánh giá.

### REQ-REVIEW-08 — Xác Thực, Phản Hồi Và Khả Năng Truy Cập

#### Yêu Cầu Hành Vi

Hệ thống phải cho phép đọc đánh giá và tổng quan đánh giá mà không cần đăng nhập, nhưng phải yêu cầu phiên khách hàng hợp lệ để tạo hoặc chỉnh sửa đánh giá.

Mọi phản hồi của tính năng qua `/api/v1`, trừ phản hồi không nội dung nếu có, phải tuân theo Full Status Envelope và đặt thực thể hoặc tập hợp chính trực tiếp trong `data`.

Giao diện tạo và chỉnh sửa đánh giá phải sử dụng được bằng bàn phím, có nhãn truy cập cho điều khiển chọn sao và chọn media, có chỉ báo focus nhìn thấy được, không truyền đạt điểm số chỉ bằng màu sắc, đồng thời thông báo rõ số lượt chỉnh sửa còn lại trước khi xác nhận.

#### Bất Biến

- `INV-REVIEW-08-01` — Lỗi nghiệp vụ hiển thị cho người dùng phải có thông báo tiếng Việt.
- `INV-REVIEW-08-02` — Lỗi hệ thống không được làm lộ chi tiết nội bộ hoặc dữ liệu cá nhân.

#### Hành Vi Lỗi / Phụ Thuộc Trạng Thái

Nếu người chưa đăng nhập bắt đầu thao tác đánh giá, giao diện phải đưa người dùng đến đăng nhập và giữ một đích quay lại an toàn cho ngữ cảnh sản phẩm hoặc đơn hàng.

Nếu thao tác tạo hoặc chỉnh sửa thất bại, giao diện phải giữ điểm, nhận xét và các media còn khả dụng để gửi lại, thông báo lỗi phù hợp và cho phép thử lại mà không tạo bản sao ngoài ý muốn hoặc tiêu hao lượt chỉnh sửa.

#### Tiêu Chí Chấp Nhận

**AC-REVIEW-08-01**

Cho trước người dùng chưa đăng nhập, khi đọc danh sách đánh giá sản phẩm, thì dữ liệu công khai được hiển thị bình thường.

**AC-REVIEW-08-02**

Cho trước người dùng chưa đăng nhập bắt đầu đánh giá từ một URL nội bộ hợp lệ, khi hoàn tất đăng nhập, thì người dùng có thể quay lại đúng ngữ cảnh ban đầu.

**AC-REVIEW-08-03**

Cho trước một lỗi tạm thời khi gửi đánh giá, khi lỗi được hiển thị, thì điểm sao, nhận xét và danh sách media đã chọn vẫn còn trong phạm vi trình duyệt còn giữ được tệp, người dùng có thể thử lại và không có đánh giá trùng lặp hoặc lượt chỉnh sửa bị tiêu hao.

**AC-REVIEW-08-04**

Cho trước người dùng chỉ sử dụng bàn phím, khi mở và hoàn thành biểu mẫu đánh giá, thì họ có thể chọn điểm, nhập nhận xét, gửi hoặc hủy và nhận biết trạng thái focus cùng kết quả thao tác.
