# Yêu Cầu Tính Năng Đánh Giá Hữu Ích / Không Hữu Ích Đánh Giá Sản Phẩm (Product Review Helpfulness)

## Context

Hệ thống cho phép khách hàng xem các đánh giá sản phẩm từ những người đã mua hàng. Để tăng tính hữu ích và độ tin cậy của thông tin đánh giá, người dùng cần có khả năng biểu quyết xem một đánh giá cụ thể là "Hữu ích" (Helpful) hay "Không hữu ích" (Unhelpful). Hệ thống tổng hợp số lượt biểu quyết này và phản hồi trạng thái biểu quyết của người dùng hiện tại để hiển thị trực quan trên giao diện danh sách đánh giá.
Đồng thời, quản trị viên (Admin) được cung cấp trải nghiệm quản trị thông minh: theo dõi các chỉ số tổng quan (tổng lượt vote hữu ích, không hữu ích, số đánh giá chưa phản hồi), xem đánh giá theo từng sản phẩm cụ thể, và sắp xếp theo mức độ hữu ích để nhận diện các phản hồi được cộng đồng quan tâm và ưu tiên phản hồi từ cửa hàng kịp thời.

## Domain Definitions

- **Review (Đánh giá sản phẩm)**: Bản ghi phản hồi trải nghiệm mua hàng do khách hàng đã mua sản phẩm tạo ra.
- **Helpful Vote (Biểu quyết hữu ích)**: Hành động người dùng ghi nhận một đánh giá mang lại thông tin giá trị, tích cực hoặc hữu ích cho quyết định mua sắm.
- **Unhelpful Vote (Biểu quyết không hữu ích)**: Hành động người dùng ghi nhận một đánh giá không mang lại giá trị hoặc không liên quan.
- **Vote State (Trạng thái biểu quyết của người xem)**: Trạng thái hiện thời của người dùng đang đăng nhập đối với một đánh giá cụ thể, gồm 3 giá trị khả dĩ: `helpful` (đã vote hữu ích), `unhelpful` (đã vote không hữu ích), hoặc `null` / `none` (chưa vote hoặc đã hủy vote).
- **Vote Counts (Số lượng biểu quyết)**: Gồm `helpfulCount` (tổng số lượt vote hữu ích) và `unhelpfulCount` (tổng số lượt vote không hữu ích) của một đánh giá.
- **Admin Review Overview Metrics (Chỉ số tổng quan đánh giá)**: Gồm tổng số lượng đánh giá (`totalReviews`), tổng lượt hữu ích (`totalHelpful`), tổng lượt không hữu ích (`totalUnhelpful`), và tổng số đánh giá chưa có phản hồi từ cửa hàng (`unansweredCount`).
- **Admin Review Filter & Sort (Bộ lọc và sắp xếp quản trị)**:
  - Lọc theo sản phẩm (`productId` hoặc tìm kiếm theo tên `search`).
  - Sắp xếp (`sort`): `latest` (mới nhất), `most_helpful` (nhiều lượt hữu ích nhất), `most_unhelpful` (nhiều lượt không hữu ích nhất).

## Scope

### In Scope

- Khách hàng đã đăng nhập có thể thực hiện biểu quyết "Hữu ích" hoặc "Không hữu ích" cho bất kỳ đánh giá sản phẩm hợp lệ nào (bao gồm cả đánh giá do chính mình tạo ra).
- Khách hàng có thể hủy biểu quyết (bỏ chọn vote đã thực hiện) hoặc chuyển đổi trực tiếp giữa "Hữu ích" và "Không hữu ích".
- Mỗi tài khoản người dùng chỉ được có tối đa một trạng thái biểu quyết hiệu lực (hữu ích hoặc không hữu ích) trên mỗi đánh giá tại một thời điểm.
- Cho phép tác giả của đánh giá được biểu quyết (hữu ích / không hữu ích) cho đánh giá của chính mình.
- Hiển thị số lượng biểu quyết hữu ích, không hữu ích cho tất cả người xem (kể cả khách vãng lai chưa đăng nhập).
- Hiển thị trạng thái biểu quyết cá nhân (đã vote hữu ích / không hữu ích) cho khách hàng đã đăng nhập.
- Yêu cầu đăng nhập đối với khách vãng lai khi nhấn nút biểu quyết trên giao diện.
- Phía Quản trị viên (Admin):
  - Hiển thị thẻ chỉ số tổng quan (Tổng đánh giá, Tổng 👍 hữu ích, 👎 không hữu ích, Chưa phản hồi).
  - Lọc danh sách đánh giá theo sản phẩm (qua `productId` hoặc tìm kiếm tên sản phẩm).
  - Nút thao tác nhanh "Lọc theo sản phẩm này" trên từng thẻ đánh giá.
  - Sắp xếp danh sách đánh giá theo `most_helpful`, `most_unhelpful`, `latest`.
  - Hiển thị huy hiệu số lượt hữu ích và không hữu ích trực quan trên từng thẻ đánh giá.

### Out of Scope

- Bỏ phiếu đánh giá đối với phản hồi từ cửa hàng (Store Review Response).
- Báo cáo vi phạm hoặc khiếu nại đánh giá (Review Reporting).
- Cho phép Quản trị viên thực hiện biểu quyết từ giao diện Admin.
- Ghi nhận bình luận lý do không hữu ích.

## Requirements

### REQ-VOTE-01 — Biểu quyết và chuyển đổi trạng thái hữu ích / không hữu ích

**User Story**
Là một khách hàng đã đăng nhập,
tôi muốn đánh dấu một đánh giá là hữu ích hoặc không hữu ích,
để giúp cộng đồng người mua nhận biết chất lượng của thông tin đánh giá.

#### Behavioral Requirement
When một khách hàng đã đăng nhập gửi yêu cầu biểu quyết với loại biểu quyết (`helpful` hoặc `unhelpful`) cho một đánh giá hợp lệ, the system shall ghi nhận biểu quyết, cập nhật lại số lượng biểu quyết (`helpfulCount`, `unhelpfulCount`) và trả về trạng thái biểu quyết mới cùng tổng số đếm cập nhật.

#### Invariants
- `INV-VOTE-01-01` — Tại mọi thời điểm, mỗi cặp `(user_id, review_id)` chỉ tồn tại tối đa một biểu quyết hợp lệ trong hệ thống.
- `INV-VOTE-01-02` — Khi người dùng chuyển đổi từ `helpful` sang `unhelpful`, `helpfulCount` giảm đúng 1 và `unhelpfulCount` tăng đúng 1; ngược lại khi chuyển từ `unhelpful` sang `helpful`, `unhelpfulCount` giảm đúng 1 và `helpfulCount` tăng đúng 1.
- `INV-VOTE-01-03` — Số lượng `helpfulCount` và `unhelpfulCount` của mỗi đánh giá luôn là số nguyên không âm (>= 0).

#### Failure / State-dependent Behavior
If mã đánh giá `reviewId` không tồn tại trong hệ thống, the system shall trả về lỗi `HTTP 404 review_not_found` kèm thông báo tiếng Việt "Không tìm thấy đánh giá".

If dữ liệu loại biểu quyết không hợp lệ (khác `helpful` và `unhelpful`), the system shall trả về lỗi `HTTP 400 validation_error` kèm thông báo chi tiết cho trường dữ liệu không hợp lệ.

#### Acceptance Criteria

**AC-VOTE-01-01**
Given khách hàng A đã đăng nhập và chưa từng biểu quyết đánh giá R (hiện có `helpfulCount: 0`, `unhelpfulCount: 0`),
when khách hàng A gửi yêu cầu biểu quyết `helpful` cho đánh giá R,
then hệ thống trả về mã thành công `HTTP 200`, ghi nhận trạng thái vote của khách hàng A là `helpful`, và tổng số lượng cập nhật thành `helpfulCount: 1`, `unhelpfulCount: 0`.

**AC-VOTE-01-02**
Given khách hàng A đã vote `helpful` cho đánh giá R (hiện có `helpfulCount: 1`, `unhelpfulCount: 0`),
when khách hàng A gửi yêu cầu biểu quyết `unhelpful` cho đánh giá R,
then hệ thống trả về mã thành công `HTTP 200`, chuyển trạng thái vote của khách hàng A thành `unhelpful`, và tổng số lượng cập nhật thành `helpfulCount: 0`, `unhelpfulCount: 1`.

---

### REQ-VOTE-02 — Hủy biểu quyết đánh giá

**User Story**
Là một khách hàng đã đăng nhập,
tôi muốn hủy bỏ biểu quyết đã thực hiện trước đó trên một đánh giá,
để thu hồi ý kiến đánh giá khi tôi thay đổi quan điểm.

#### Behavioral Requirement
When một khách hàng đã đăng nhập gửi yêu cầu hủy biểu quyết cho một đánh giá mà họ đã từng biểu quyết, the system shall xóa bản ghi biểu quyết của người dùng đó, giảm số lượng tương ứng của loại biểu quyết trước đó đúng 1 đơn vị, và trả về trạng thái biểu quyết là `null` / rỗng cùng số đếm cập nhật.

#### Invariants
- `INV-VOTE-02-01` — Thao tác hủy biểu quyết là lũy kế an toàn (idempotent); nếu người dùng chưa từng biểu quyết hoặc đã hủy biểu quyết trước đó, việc gửi lại yêu cầu hủy không làm âm số đếm và trả về trạng thái hợp lệ với vote bằng `null`.

#### Failure / State-dependent Behavior
If mã đánh giá `reviewId` không tồn tại, the system shall trả về lỗi `HTTP 404 review_not_found`.

#### Acceptance Criteria

**AC-VOTE-02-01**
Given khách hàng A đã vote `helpful` cho đánh giá R (hiện có `helpfulCount: 1`, `unhelpfulCount: 0`),
when khách hàng A gửi yêu cầu hủy biểu quyết cho đánh giá R,
then hệ thống trả về mã thành công `HTTP 200`, trạng thái vote của khách hàng A trở thành `null`, và tổng số lượng cập nhật thành `helpfulCount: 0`, `unhelpfulCount: 0`.

**AC-VOTE-02-02**
Given khách hàng A chưa từng biểu quyết cho đánh giá R (hoặc đã hủy trước đó),
when khách hàng A gửi yêu cầu hủy biểu quyết cho đánh giá R,
then hệ thống trả về mã thành công `HTTP 200` mà không làm thay đổi số đếm của đánh giá R.

---

### REQ-VOTE-03 — Cho phép tác giả biểu quyết đánh giá của chính mình

**User Story**
Là tác giả của một đánh giá,
tôi muốn có thể biểu quyết đánh giá của chính mình như mọi người dùng khác,
để ghi nhận cảm nhận về tính hữu ích của bài đánh giá.

#### Behavioral Requirement
When tác giả sở hữu đánh giá gửi yêu cầu biểu quyết hoặc hủy biểu quyết cho chính đánh giá của mình, the system shall ghi nhận và xử lý biểu quyết tương tự như các khách hàng khác, tuân theo quy tắc mỗi tài khoản có tối đa một biểu quyết hợp lệ trên mỗi đánh giá.

#### Invariants
- `INV-VOTE-03-01` — Tác giả có các quyền biểu quyết và hủy biểu quyết đối với đánh giá của chính mình hoàn toàn bình đẳng với mọi khách hàng khác; mỗi cặp `(user_id, review_id)` chỉ lưu trữ tối đa 1 biểu quyết.

#### Failure / State-dependent Behavior
If tác giả gửi loại biểu quyết không hợp lệ, the system shall trả về lỗi `HTTP 400 validation_error`.

#### Acceptance Criteria

**AC-VOTE-03-01**
Given khách hàng B là người tạo ra đánh giá R (hiện có `helpfulCount: 0`, `unhelpfulCount: 0`),
when khách hàng B gửi yêu cầu biểu quyết `helpful` cho đánh giá R,
then hệ thống ghi nhận thành công với mã `HTTP 200`, cập nhật trạng thái vote của B là `helpful`, và số đếm cập nhật thành `helpfulCount: 1`, `unhelpfulCount: 0`.

**AC-VOTE-03-02**
Given khách hàng B là người tạo ra đánh giá R và đã vote `helpful`,
when khách hàng B gửi yêu cầu hủy biểu quyết cho đánh giá R,
then hệ thống ghi nhận hủy thành công, trạng thái vote của B trở thành `null`, và `helpfulCount` giảm xuống 0.

---

### REQ-VOTE-04 — Hiển thị số lượng biểu quyết và trạng thái cá nhân trong danh sách đánh giá

**User Story**
Là một người dùng xem trang chi tiết sản phẩm,
tôi muốn nhìn thấy số lượt hữu ích, không hữu ích của từng đánh giá và biết được tôi đã vote mục nào,
để tham khảo thông tin đáng tin cậy và quản lý tương tác của bản thân.

#### Behavioral Requirement
When hệ thống truy xuất danh sách đánh giá của sản phẩm (`GET /api/v1/products/:id/reviews`), the system shall trả về thông tin `helpfulCount` và `unhelpfulCount` cho từng đánh giá; đồng thời nếu yêu cầu có phiên đăng nhập khách hàng hợp lệ, the system shall bổ sung thông tin trạng thái `viewer.vote` (`helpful`, `unhelpful`, hoặc `null`) và cờ chỉ báo khả năng biểu quyết `viewer.canVote: true`.

#### Invariants
- `INV-VOTE-04-01` — Đối với khách vãng lai (chưa đăng nhập), `viewer` trong response payload là `null` (hoặc `viewer.vote: null`, `viewer.canVote: false`).
- `INV-VOTE-04-02` — Đối với tất cả người dùng đã đăng nhập (bao gồm cả tác giả của đánh giá), `viewer.canVote` là `true` và `viewer.vote` phản ánh chính xác biểu quyết gần nhất của họ (`helpful`, `unhelpful`, hoặc `null`).

#### Failure / State-dependent Behavior
If sản phẩm chưa có đánh giá nào, the system shall trả về mảng danh sách đánh giá rỗng với tổng số lượng 0.

While người dùng chưa đăng nhập, the system shall vẫn hiển thị đầy đủ tổng số lượt `helpfulCount` và `unhelpfulCount` của từng đánh giá.

#### Acceptance Criteria

**AC-VOTE-04-01**
Given đánh giá R có 5 lượt vote hữu ích và 1 lượt vote không hữu ích,
when khách vãng lai chưa đăng nhập xem danh sách đánh giá của sản phẩm,
then hệ thống trả về đánh giá R với `helpfulCount: 5`, `unhelpfulCount: 1`, và `viewer: null`.

**AC-VOTE-04-02**
Given khách hàng A đã vote `helpful` cho đánh giá R,
when khách hàng A xem danh sách đánh giá của sản phẩm,
then hệ thống trả về đánh giá R với `helpfulCount: 5`, `unhelpfulCount: 1`, `viewer.vote: "helpful"`, và `viewer.canVote: true`.

**AC-VOTE-04-03**
Given khách hàng B là tác giả của đánh giá R và đã vote `helpful` cho chính đánh giá của mình,
when khách hàng B xem danh sách đánh giá của sản phẩm,
then hệ thống trả về đánh giá R với `viewer.canVote: true` và `viewer.vote: "helpful"`.

---

### REQ-VOTE-05 — Xác thực quyền hạn và tương tác giao diện người dùng (Storefront)

**User Story**
Là người dùng trên giao diện web,
tôi muốn nhận được phản hồi trực quan ngay lập tức khi bấm nút hữu ích hoặc không hữu ích, và được hướng dẫn đăng nhập nếu chưa đăng nhập,
để có trải nghiệm tương tác mượt mà và rõ ràng.

#### Behavioral Requirement
When người dùng nhấn nút "Hữu ích" hoặc "Không hữu ích" trên giao diện danh sách đánh giá sản phẩm:
1. If người dùng chưa đăng nhập, the system shall hiển thị thông báo yêu cầu đăng nhập và không gửi yêu cầu thay đổi dữ liệu biểu quyết.
2. If người dùng đã đăng nhập hợp lệ (bao gồm cả tác giả đánh giá):
   - Nhấn vào nút đang được chọn: the system shall thực hiện hủy biểu quyết (toggle tắt), giảm số đếm tương ứng và bỏ trạng thái active của nút.
   - Nhấn vào nút chưa được chọn: the system shall thực hiện gửi biểu quyết mới (hoặc chuyển đổi biểu quyết), cập nhật trạng thái active cho nút vừa chọn và điều chỉnh lại số đếm hiển thị.

#### Invariants
- `INV-VOTE-05-01` — Nút biểu quyết trên giao diện phải phản ánh đúng trạng thái `viewer.vote` từ máy chủ (hoặc cập nhật lạc quan - optimistic update có cơ chế hoàn tác khi gặp lỗi mạng).

#### Failure / State-dependent Behavior
If yêu cầu API biểu quyết trả về lỗi mạng hoặc lỗi máy chủ, giao diện người dùng shall hoàn tác (rollback) số đếm và trạng thái nút bấm về trạng thái trước khi thao tác, đồng thời hiển thị thông báo lỗi phù hợp.

If người dùng gửi trực tiếp yêu cầu API biểu quyết mà không kèm token xác thực hợp lệ, máy chủ shall trả về lỗi `HTTP 401 unauthorized` kèm thông báo tiếng Việt "Vui lòng đăng nhập để thực hiện biểu quyết".

#### Acceptance Criteria

**AC-VOTE-05-01**
Given người dùng chưa đăng nhập bấm nút "Hữu ích" trên một đánh giá,
when nút được bấm,
then giao diện hiển thị thông báo "Vui lòng đăng nhập để đánh giá mức độ hữu ích" mà không làm tăng số đếm.

**AC-VOTE-05-02**
Given người dùng đã đăng nhập và đang có trạng thái `viewer.vote: "helpful"` trên đánh giá R (helpfulCount: 3),
when người dùng bấm lại vào nút "Hữu ích",
then giao diện cập nhật trạng thái nút thành không chọn, `helpfulCount` giảm xuống 2, và gửi yêu cầu hủy biểu quyết thành công.

**AC-VOTE-05-03**
Given người dùng đã đăng nhập và đang có trạng thái `viewer.vote: "helpful"` trên đánh giá R (helpfulCount: 3, unhelpfulCount: 1),
when người dùng bấm vào nút "Không hữu ích",
then giao diện cập nhật nút "Không hữu ích" thành chọn, bỏ chọn nút "Hữu ích", `helpfulCount` thành 2, `unhelpfulCount` thành 2, và gửi yêu cầu chuyển đổi biểu quyết thành công.

---

### REQ-VOTE-06 — Quản lý thống kê, lọc theo sản phẩm và sắp xếp đánh giá theo độ hữu ích cho Quản trị viên (Admin)

**User Story**
Là một quản trị viên (Admin),
tôi muốn xem bảng điều khiển tổng quan với các chỉ số thống kê (tổng đánh giá, tổng hữu ích, không hữu ích, chưa phản hồi), có thể lọc đánh giá theo từng sản phẩm và sắp xếp theo độ hữu ích,
để theo dõi phản hồi của cộng đồng và tập trung xử lý các đánh giá quan trọng hoặc tiêu cực kịp thời.

#### Behavioral Requirement
When quản trị viên truy cập trang quản lý đánh giá:
1. The system shall cung cấp các chỉ số tổng quan qua `GET /api/v1/admin/reviews/stats` gồm `totalReviews`, `totalHelpful`, `totalUnhelpful`, `unansweredCount`.
2. The system shall cung cấp danh sách đánh giá qua `GET /api/v1/admin/reviews`, hỗ trợ:
   - Tham số `sort`: `latest` (mặc định), `most_helpful`, `most_unhelpful`.
   - Tham số `productId`: lọc các đánh giá thuộc một sản phẩm cụ thể.
   - Tham số `search`: tìm kiếm đánh giá theo tên sản phẩm.
   Mỗi phần tử đánh giá trả về chứa `helpfulCount` và `unhelpfulCount`.
3. Giao diện Admin (`ReviewsPage.tsx`) shall hiển thị hàng thẻ chỉ số tổng quan (Overview Metrics Cards), thanh công cụ lọc/tìm kiếm sản phẩm, bộ chọn sắp xếp, huy hiệu tương tác (👍/👎) trên từng thẻ đánh giá, và nút bấm nhanh "Lọc theo sản phẩm này".

#### Invariants
- `INV-VOTE-06-01` — Giá trị mặc định của tham số `sort` là `latest`.
- `INV-VOTE-06-02` — Thống kê `helpfulCount` và `unhelpfulCount` hiển thị cho Admin phải hoàn toàn đồng bộ và nhất quán với số liệu tính từ nguồn sự thật PostgreSQL.
- `INV-VOTE-06-03` — Khi đang lọc theo một sản phẩm cụ thể, danh sách chỉ hiển thị các đánh giá thuộc sản phẩm đó.

#### Failure / State-dependent Behavior
If tham số `sort` không thuộc `['latest', 'most_helpful', 'most_unhelpful']`, the system shall trả về lỗi `HTTP 400 validation_error`.

If tham số `productId` không phải định dạng UUID hợp lệ, the system shall trả về lỗi `HTTP 400 validation_error`.

#### Acceptance Criteria

**AC-VOTE-06-01**
Given hệ thống có 10 đánh giá (trong đó có 25 lượt hữu ích, 4 lượt không hữu ích và 3 đánh giá chưa có phản hồi),
when Admin gửi yêu cầu `GET /api/v1/admin/reviews/stats`,
then hệ thống trả về HTTP 200 với `totalReviews: 10`, `totalHelpful: 25`, `totalUnhelpful: 4`, và `unansweredCount: 3`.

**AC-VOTE-06-02**
Given hệ thống có đánh giá R1 (helpfulCount: 10, unhelpfulCount: 1) và R2 (helpfulCount: 2, unhelpfulCount: 0),
when Admin truy xuất danh sách đánh giá với tham số `sort=most_helpful`,
then hệ thống trả về danh sách trong đó đánh giá R1 xuất hiện trước đánh giá R2.

**AC-VOTE-06-03**
Given hệ thống có đánh giá R1 (unhelpfulCount: 8) và R2 (unhelpfulCount: 1),
when Admin truy xuất danh sách đánh giá với tham số `sort=most_unhelpful`,
then hệ thống trả về danh sách trong đó đánh giá R1 xuất hiện trước đánh giá R2.

**AC-VOTE-06-04**
Given hệ thống có các đánh giá thuộc sản phẩm P1 và sản phẩm P2,
when Admin truy xuất với `productId=P1`,
then hệ thống chỉ trả về các đánh giá thuộc sản phẩm P1.

**AC-VOTE-06-05**
Given Admin truy cập trang Quản lý đánh giá (`/reviews`) trên giao diện admin,
when trang được tải,
then giao diện hiển thị 4 thẻ chỉ số tổng quan (Tổng đánh giá, Hữu ích, Không hữu ích, Chưa phản hồi), thanh tìm kiếm sản phẩm, bộ chọn sắp xếp, và các huy hiệu 👍/👎 trên từng thẻ đánh giá. Khi bấm nút "Lọc theo sản phẩm này" trên một thẻ, danh sách sẽ tự động lọc chỉ hiển thị đánh giá của sản phẩm đó.
