# Thiết Kế Tính Năng Đánh Giá Sản Phẩm Đã Mua

## 1. Mục Tiêu Thiết Kế

Thiết kế bổ sung miền đánh giá sản phẩm vào hệ thống commerce hiện có, dùng dữ liệu đơn hàng làm nguồn xác minh mua hàng, PostgreSQL làm nguồn sự thật cho đánh giá và quyền công khai media, MinIO lưu nội dung nhị phân, và frontend khách hàng cung cấp luồng tạo, sửa cùng section đánh giá công khai.

Thiết kế phải bảo đảm:

- mỗi dòng hàng trong đơn `delivered` cấp tối đa một quyền đánh giá;
- hai dòng hàng khác nhau được đánh giá độc lập dù cùng sản phẩm hoặc phân loại;
- một đánh giá chỉ có một lần chỉnh sửa thành công;
- retry và yêu cầu đồng thời không tạo trùng hoặc tiêu hao thêm lượt sửa;
- đánh giá và media công khai luôn phản ánh cùng một phiên bản đã hoàn tất;
- MinIO hoặc PostgreSQL lỗi không làm lộ media mồ côi;
- tổng quan sản phẩm, section đánh giá và trạng thái trong đơn hàng dùng cùng nguồn dữ liệu;
- khách hàng có một read model phân trang để xem toàn bộ đánh giá của chính mình mà không tạo nguồn sự thật hoặc lịch sử phiên bản mới;
- không thay đổi hành vi của frontend quản trị vì kiểm duyệt đánh giá nằm ngoài phạm vi.

## 2. Kiến Trúc Tổng Thể

```text
Frontend khách hàng
  |  JSON: đọc tổng quan, danh sách, trạng thái trong đơn
  |  JSON: đọc danh sách đánh giá cá nhân
  |  multipart: tạo/sửa đánh giá + media
  v
Backend HTTP /api/v1
  |
  +--> Review application/domain
  |      |-- xác thực ownership, trạng thái đơn, edit limit
  |      |-- validation điểm, nhận xét, media manifest
  |      |-- concurrency và điều phối nhất quán
  |      v
  |    PostgreSQL
  |      |-- product_reviews
  |      |-- review_media
  |      `-- order_items + orders làm nguồn purchase eligibility
  |
  +--> Media storage adapter --> MinIO private bucket
  |
  `--> Order/Catalog read models
         |-- trạng thái review của từng order item
         |-- awaitingReview theo order item
         `-- review summary theo product

Trình duyệt <--- GET /media/reviews/:mediaId --- Backend media proxy --- MinIO
```

Dependency direction của backend vẫn là `delivery -> usecase -> domain`; adapter PostgreSQL và MinIO hiện thực các interface do domain/application sở hữu. Cấu hình MinIO đi qua `internal/config` và composition root của Wire, không đọc environment trực tiếp trong package đánh giá hoặc storage.

## 3. Quyết Định Kỹ Thuật

### 3.1 Đánh Giá Thuộc Dòng Hàng, Tổng Hợp Thuộc Sản Phẩm

`order_item` là đơn vị cấp quyền và khóa duy nhất của đánh giá. `product_id` và `variant_id` của đánh giá được lấy từ dòng hàng nguồn, không nhận như dữ liệu có thẩm quyền từ client. Điều này cho phép từng phân loại trong đơn được đánh giá riêng và ngăn đánh giá nhầm sản phẩm.

Danh sách công khai và điểm trung bình được truy vấn theo `product_id`, nên mọi đánh giá từ các dòng hàng khác nhau của sản phẩm đều đóng góp vào cùng section sản phẩm. Thông tin phân loại hiển thị lấy từ snapshot `options` bất biến của dòng hàng nguồn thay vì dữ liệu catalog hiện tại.

### 3.2 PostgreSQL Là Nguồn Sự Thật Công Khai

MinIO chỉ sở hữu bytes. Một object chỉ được phục vụ công khai khi có bản ghi `review_media` đang tham chiếu tới object đó. Media proxy luôn tra bản ghi trước khi đọc MinIO; object không có tham chiếu không thể được truy cập qua URL công khai của ứng dụng.

Thiết kế không dùng bucket public và không cho frontend upload trực tiếp. Backend stream multipart tới MinIO để không giữ toàn bộ video trong bộ nhớ.

### 3.3 Concurrency Và Retry Đơn Giản

Khóa duy nhất ở database trên `order_item_id` bảo đảm chỉ một create thành công. Update có điều kiện khi `edited_at IS NULL` bảo đảm chỉ một edit thành công. Không dùng idempotency journal, lease hoặc fencing token.

Nếu frontend mất kết nối hoặc timeout trước khi biết kết quả, nó không tự động gửi lại mutation. Frontend tải lại order-item review state đối với create hoặc owned review đối với edit. Chỉ khi trạng thái có thẩm quyền cho thấy mutation chưa xảy ra, người dùng mới được phép thử lại. Cách này giữ concurrency đúng mà không thêm state machine vận hành riêng.

### 3.4 Media Manifest Cho Một Lần Sửa Nguyên Tử

Mutation multipart chứa dữ liệu đánh giá, các file mới và một media manifest có thứ tự. Mỗi phần tử manifest tham chiếu một media hiện có thuộc đánh giá hoặc chỉ số của file mới trong request. Backend xác minh ownership, không cho lặp media ID, không cho tham chiếu media của đánh giá khác và kiểm tra trạng thái cuối cùng tối đa 5 media/2 video.

Manifest cho phép giữ, bỏ, sắp xếp media cũ và chèn media mới ở vị trí bất kỳ trong đúng một thao tác. Schema multipart và manifest chi tiết thuộc executable API contract.

### 3.5 Phục Vụ Video Qua Backend

Media được đọc qua route công khai ngoài `/api/v1` để trả raw bytes thay vì Full Status Envelope. Route hỗ trợ `Range`, `Content-Range`, `Accept-Ranges`, `Content-Length`, MIME đã xác minh và ETag. Cache phải revalidate ở mỗi lần dùng (`max-age=0, must-revalidate`) để database gate có thể thu hồi media ngay sau edit; không dùng `immutable` hoặc freshness lifetime dương.

Tên tệp gốc và MinIO object key không xuất hiện trong URL công khai. URL chỉ chứa media ID không mang thông tin người dùng.

## 4. Sở Hữu Dữ Liệu

### 4.1 Product Review

Thực thể đánh giá sở hữu tối thiểu:

- review ID;
- order item ID duy nhất;
- user ID, product ID và variant ID được suy ra từ dòng hàng;
- rating từ 1 đến 5;
- comment đã trim;
- created at, updated at và edited at.

`order_item_id` là unique và foreign key. `user_id`, `product_id`, `variant_id` được lưu để kiểm tra ownership và truy vấn/tổng hợp hiệu quả, nhưng phải nhất quán với dòng hàng nguồn khi tạo và không được thay đổi sau đó.

### 4.2 Review Media

Mỗi media sở hữu tối thiểu:

- media ID;
- review ID;
- MinIO object key duy nhất;
- loại `image` hoặc `video`;
- MIME đã xác minh;
- byte size;
- position duy nhất trong phạm vi review;
- created at.

Database không lưu bytes, URL có chữ ký hoặc tên tệp gốc. Thứ tự được chuẩn hóa liên tiếp khi tạo hoặc sửa.

### 4.3 Không Denormalize Tổng Quan

Điểm trung bình và tổng số được tính từ `product_reviews` ở lần đọc. Phạm vi ban đầu chưa cần bảng aggregate hoặc cache riêng; cách này loại bỏ rủi ro lệch số sau một lần chỉnh sửa. Index theo `product_id` và thứ tự `(updated_at DESC, id DESC)` phục vụ summary cùng pagination ổn định.

### 4.4 Thay Đổi Read Model Đơn Hàng

Read model mỗi order item bổ sung review state cá nhân hóa:

- chưa đủ điều kiện;
- đủ điều kiện và chưa đánh giá;
- đã đánh giá, kèm review ID và `canEdit`.

`awaitingReview` giữ tên field API hiện có nhưng đổi semantics có chủ đích từ số đơn `delivered` sang số order item chưa đánh giá trong các đơn đang `delivered`. Frontend hiện tại đã đọc field này nên không cần field song song.

### 4.5 Read Model Lịch Sử Đánh Giá Cá Nhân

Lịch sử cá nhân là projection chỉ đọc từ `product_reviews` theo `user_id`, không phải thực thể hoặc bảng audit mới. Truy vấn dùng thứ tự `(updated_at DESC, id DESC)` và phân trang cùng quy tắc ổn định với danh sách công khai.

Mỗi mục dùng trạng thái review hiện tại và bổ sung thông tin nhận biết sản phẩm cần cho trang tài khoản. Tên sản phẩm phải lấy từ dữ liệu mua hàng đã lưu để đánh giá vẫn nhận biết được khi catalog không còn công khai; trạng thái hiển thị công khai hiện tại của sản phẩm chỉ quyết định có cung cấp liên kết tới trang chi tiết hay không. Viewer state luôn là state của owner và là nguồn quyết định hành động chỉnh sửa.

## 5. Luồng Hành Vi

### 5.1 Đọc Trang Chi Tiết Sản Phẩm

1. Catalog trả product detail và review summary thật thay cho số liệu tĩnh.
2. Frontend render summary và trạng thái "Chưa có đánh giá" khi count bằng 0.
3. Section đánh giá gọi collection phân trang công khai, optional customer auth để nhận viewer state cho review của chính người xem.
4. Mỗi review hiển thị nhãn tác giả trung lập, phân loại đã mua, rating, comment, thời gian và media.
5. Pagination dùng `updated_at DESC, id DESC` để không đổi thứ tự khi timestamp bằng nhau.

### 5.2 Tạo Đánh Giá

1. Frontend mở form từ đúng order item và gửi mutation multipart.
2. Backend xác minh user, order ownership, order item thuộc order và trạng thái `delivered` trước khi nhận các tệp lớn.
3. Backend kiểm tra rating/comment, số part, kích thước khai báo và manifest.
4. Backend stream từng file tới object key sinh bởi server dưới prefix operation, đồng thời giới hạn bytes và xác minh MIME thực tế.
5. Trong một transaction, backend khóa dòng hàng liên quan, kiểm tra lại eligibility, tạo review và các media reference có thứ tự.
6. Sau commit, response `201` trả review. Lần đọc order stats và product summary tiếp theo phản ánh dữ liệu mới.
7. Nếu transaction thất bại, backend xóa object vừa upload; nếu xóa tức thời thất bại, reconciler sẽ xóa object không được database tham chiếu.

### 5.3 Chỉnh Sửa Đúng Một Lần

1. Frontend cảnh báo đây là lượt sửa duy nhất và gửi toàn bộ trạng thái mong muốn bằng multipart manifest.
2. Backend kiểm tra owner và `edited_at` trước khi upload mới.
3. File mới được stream tới MinIO; media cũ chỉ được đánh dấu giữ hoặc bỏ trong manifest, chưa xóa khỏi MinIO.
4. Transaction cập nhật rating/comment, thay toàn bộ media rows/positions cần thiết và ghi `edited_at` với điều kiện chưa từng sửa.
5. Chỉ sau commit, backend yêu cầu xóa các object đã bị loại. Chúng không còn truy cập được ngay vì media proxy không còn tìm thấy tham chiếu database.
6. Nếu transaction thua cạnh tranh hoặc thất bại, object mới được dọn, media cũ và review không đổi, `edited_at` vẫn trống.

### 5.4 Đọc Media

1. Trình duyệt yêu cầu media ID qua route proxy.
2. Backend chỉ tiếp tục nếu media ID có bản ghi thuộc review hiện có.
3. Backend đọc object từ MinIO, chuyển tiếp MIME, length và range semantics.
4. Media ID không tồn tại trả `404`; MinIO tạm thời lỗi trả `503` mà không lộ endpoint, bucket hoặc object key.

### 5.5 Reconciliation

Object key do tính năng tạo có operation prefix và timestamp có thể suy ra từ metadata do hệ thống quản lý. Backend luôn thử xóa ngay sau failure hoặc sau khi media mất reference. Một reconciler chạy mỗi 15 phút và chỉ xử lý object không tham chiếu đã qua grace period 60 phút:

- xóa object không còn được bất kỳ `review_media` nào tham chiếu;
- giữ object còn tham chiếu;
- retry xóa media đã bị loại khi MinIO từng lỗi;
- chỉ log media/operation ID và loại lỗi, không log credential, URL có secret hoặc nội dung người dùng.

Reconciler là cơ chế khôi phục sau crash giữa hai hệ thống; tính công khai vẫn nhất quán ngay lập tức nhờ database gate.

Khi MinIO hoạt động liên tục, mọi object không tham chiếu phải hội tụ về trạng thái đã xóa trong tối đa 90 phút từ khi mất reference. Nếu MinIO gián đoạn, object phải được xóa trong tối đa 90 phút từ khi kết nối phục hồi. Runtime verification dùng thời gian cấu hình rút ngắn nhưng giữ cùng quan hệ grace period, interval và convergence bound.

### 5.6 Đọc Lịch Sử Đánh Giá Cá Nhân

1. Route tài khoản yêu cầu customer auth và giữ safe return URL khi chuyển sang đăng nhập.
2. Frontend gọi collection đánh giá cá nhân phân trang; backend luôn suy ra owner từ phiên xác thực, không nhận user ID có thẩm quyền từ client.
3. Backend đọc review hiện tại theo owner, ghép thông tin nhận biết sản phẩm và trạng thái catalog để quyết định product link, rồi trả owner viewer state không null.
4. Frontend hiển thị content/media hiện tại, trạng thái chỉnh sửa, empty/error/retry và liên kết về lịch sử đơn hàng khi chưa có đánh giá.
5. Sau khi chỉnh sửa thành công, frontend thay mục tương ứng bằng review mới hoặc tải lại trang hiện tại; không thêm một mục lịch sử mới.

## 6. Validation Và Bảo Mật

- Rating phải là integer 1-5; comment sau trim tối đa 1000 ký tự.
- Trạng thái cuối tối đa 5 media, trong đó tối đa 2 video.
- Ảnh chấp nhận JPEG, PNG, WebP tối đa 5 MiB = 5.242.880 bytes/tệp.
- Video chấp nhận MP4, WebM tối đa 50 MiB = 52.428.800 bytes/tệp.
- Backend giới hạn tổng request theo các giới hạn miền cộng overhead multipart và ngắt stream khi vượt giới hạn.
- MIME được xác minh từ nội dung; tên file và `Content-Type` của client chỉ là gợi ý.
- Object key do server sinh, không ghép trực tiếp tên file hoặc user input.
- MinIO bucket private; credential chỉ đến từ Viper config, không trả về API và không ghi log.
- Ownership được kiểm tra lại trong transaction, không tin product ID, variant ID, user ID hoặc media ID từ client.
- Review công khai không chứa email, user ID, original filename hoặc MinIO location.
- Comment render dạng text; image có accessible description sinh từ ngữ cảnh sản phẩm/vị trí, video dùng native controls và keyboard semantics.
- Route mutation yêu cầu customer auth; route danh sách và media là public; optional auth chỉ bổ sung viewer state, không đổi dữ liệu intrinsic.

## 7. Cấu Hình Và Vận Hành

Backend config boundary bổ sung cấu hình MinIO tối thiểu: endpoint, access key, secret key, bucket, TLS mode và giới hạn thời gian request. Giá trị môi trường override `.env` theo cơ chế Viper hiện có. Secret bắt buộc trong môi trường chạy tính năng và không có default không an toàn.

Môi trường local/test cần MinIO service và bucket private được provision bằng cấu hình thực thi. Backend kiểm tra kết nối/bucket khi khởi động và fail startup với lỗi đã che secret nếu storage bắt buộc nhưng không sẵn sàng.

Database thay đổi bằng migration up/down mới; sqlc được regenerate. MinIO không chứa metadata nghiệp vụ duy nhất nên backup/restore phải coi PostgreSQL là index có thẩm quyền và MinIO là nội dung đi kèm.

## 8. Failure Boundaries

| Failure | Hành vi thiết kế |
|---|---|
| Validation metadata thất bại | Không upload, trả field errors |
| File sai MIME hoặc vượt size trong stream | Dừng request, dọn object đã nhận, không mutation DB |
| MinIO upload thất bại | Không mutation DB, giữ form phía client để retry |
| DB create/update thất bại sau upload | Không công khai object; dọn tức thời và reconciler fallback |
| MinIO delete thất bại sau update commit | Media bị loại không còn public; reconciler retry xóa bytes |
| Hai create đồng thời cùng order item | Unique constraint cho một thành công; yêu cầu còn lại nhận duplicate business error |
| Hai edit đồng thời | Conditional update cho một thành công; yêu cầu còn lại nhận `review_edit_limit_reached` |
| Client timeout hoặc mất kết nối | Tải lại state có thẩm quyền; chỉ cho retry nếu mutation chưa xảy ra |
| MinIO lỗi khi đọc media | `503`, review metadata vẫn đọc được và UI hiển thị media unavailable/retry |
| Product soft-deleted | Review được giữ; catalog visibility hiện có không thay đổi |
| Order chuyển `returned` sau review | Review và quyền sửa còn lại được giữ; order item không review trước đó không còn eligible |

## 9. Ranh Giới Thành Phần

### Boundary ID: BND-REVIEW-HTTP

**Producer / provider:** Backend review/order/catalog HTTP delivery  
**Consumer(s):** Frontend khách hàng  
**Purpose:** Tạo/sửa review multipart, đọc collection review, mở rộng product summary và order-item review state  
**Authentication / caller context:** Customer auth cho mutation và order state; public với optional customer auth cho product reviews  
**Material state or failure semantics:** Eligibility theo order item, concurrency, one-edit limit, validation media, pagination, Full Status Envelope
**Contract artifact required:** Yes  
**Requirement IDs traced to boundary:** REQ-REVIEW-01, REQ-REVIEW-02, REQ-REVIEW-03, REQ-REVIEW-04, REQ-REVIEW-05, REQ-REVIEW-06, REQ-REVIEW-07, REQ-REVIEW-08, REQ-REVIEW-09
**Verification / Proof level:** provider-contract, runtime-http, component, browser

### Boundary ID: BND-REVIEW-MEDIA-CONTENT

**Producer / provider:** Backend media proxy  
**Consumer(s):** Browser frontend khách hàng  
**Purpose:** Phục vụ image/video bytes cho media đã được database công khai  
**Authentication / caller context:** Public  
**Material state or failure semantics:** Raw content, stable opaque media ID, MIME/length/range headers, 404 và 503  
**Contract artifact required:** Yes  
**Requirement IDs traced to boundary:** REQ-REVIEW-02, REQ-REVIEW-04, REQ-REVIEW-05, REQ-REVIEW-08  
**Verification / Proof level:** provider-contract, runtime-http, browser

### Boundary ID: BND-REVIEW-PERSISTENCE

**Producer / provider:** PostgreSQL review repository  
**Consumer(s):** Backend review, order stats và catalog read use cases  
**Purpose:** Sở hữu review metadata, unique order-item invariant, edit limit, media references, aggregate queries và truy vấn lịch sử theo owner
**Authentication / caller context:** Internal backend context với user ID đã xác thực  
**Material state or failure semantics:** Transaction lock/conditional update, deterministic pagination, no partial metadata  
**Contract artifact required:** No  
**Requirement IDs traced to boundary:** REQ-REVIEW-01, REQ-REVIEW-03, REQ-REVIEW-04, REQ-REVIEW-06, REQ-REVIEW-07, REQ-REVIEW-09
**Verification / Proof level:** unit, integration-db

### Boundary ID: BND-REVIEW-MINIO

**Producer / provider:** MinIO private bucket  
**Consumer(s):** Backend media storage adapter và reconciler  
**Purpose:** Lưu, đọc range và xóa review media bytes  
**Authentication / caller context:** Backend service credentials only  
**Material state or failure semantics:** Streaming size limits, private objects, generated keys, retryable upload/read/delete errors  
**Contract artifact required:** No, dùng MinIO/S3 protocol chuẩn qua adapter nội bộ  
**Requirement IDs traced to boundary:** REQ-REVIEW-02, REQ-REVIEW-04, REQ-REVIEW-05, REQ-REVIEW-08  
**Verification / Proof level:** unit, runtime-http

### Boundary ID: BND-REVIEW-UI

**Producer / provider:** Frontend review UI  
**Consumer(s):** Khách hàng và người xem sản phẩm  
**Purpose:** Form tạo/sửa, preview media, one-edit warning, order-item actions, product review section, lịch sử đánh giá cá nhân và responsive media viewer
**Authentication / caller context:** Authenticated mutations; public read; safe login return  
**Material state or failure semantics:** Loading/empty/error/success, preserve form on retry, accessible controls, desktop/mobile layout  
**Contract artifact required:** No, tiêu thụ BND-REVIEW-HTTP và BND-REVIEW-MEDIA-CONTENT  
**Requirement IDs traced to boundary:** REQ-REVIEW-01, REQ-REVIEW-02, REQ-REVIEW-04, REQ-REVIEW-05, REQ-REVIEW-06, REQ-REVIEW-07, REQ-REVIEW-08, REQ-REVIEW-09
**Verification / Proof level:** component, browser, visual

## 10. Chiến Lược Chứng Minh

| Requirement | Hành vi cần chứng minh | Mức proof tối thiểu | Cơ chế xác minh |
|---|---|---|---|
| REQ-REVIEW-01 | Ownership, delivered eligibility, order-item derivation | unit + integration-db + provider-contract | Domain/usecase tests, PostgreSQL integration, API scenarios |
| REQ-REVIEW-02 | Validation rating/comment/media, proxy upload, cleanup khi lỗi | unit + provider-contract + runtime-http | Validator tests, multipart contract tests, backend + MinIO runtime checks |
| REQ-REVIEW-03 | Một review/order item dưới concurrency và retry sau state reload | integration-db + component + runtime-http | Concurrent repository test, frontend retry-state test và HTTP concurrency check |
| REQ-REVIEW-04 | Một edit thành công, atomic media manifest, failed edit không tiêu hao | integration-db + provider-contract + runtime-http + component | Conditional update tests, contract scenarios, MinIO failure injection, form tests |
| REQ-REVIEW-05 | Public pagination, neutral author, variant snapshot, ordered media | provider-contract + component + browser | API contract tests, section render tests, browser pagination/media interaction |
| REQ-REVIEW-06 | Count/average đúng và cập nhật sau edit | integration-db + provider-contract + component | Aggregate query tests, response contract, summary rendering |
| REQ-REVIEW-07 | Review state theo từng order item và awaitingReview semantics | integration-db + component + browser | Join/count tests, order page tests, create-review user flow |
| REQ-REVIEW-08 | Auth, envelope, safe return, keyboard, retry state | provider-contract + component + browser + visual | Auth/error contract tests, keyboard tests, full login-return/upload flow, desktop/mobile inspection |
| REQ-REVIEW-09 | Collection chỉ thuộc owner, phân trang ổn định, product identity/link state, edit và empty/error/login-return | integration-db + provider-contract + component + browser | Owner-filtered query tests, API contract, account-page render tests và authenticated routing/edit flow |

Không dùng browser test để chứng minh unique constraint, aggregate math hoặc transaction semantics vì integration test ở boundary tương ứng đủ mạnh. Browser automation chỉ bao phủ các flow thực sự cần routing, file input, native media và tương tác responsive.

## 11. Runtime Integration Scenarios

Các scenario cần backend, PostgreSQL và MinIO thật:

1. Tạo review có 3 ảnh + 2 video, đọc lại metadata và bytes/range của video.
2. MinIO lỗi ở file giữa request, xác nhận không có review/media public và retry thành công.
3. DB từ chối duplicate sau upload, xác nhận object của request thua không public và được reconciler dọn.
4. Edit giữ một media cũ, bỏ một, reorder và thêm media mới; xác nhận state công khai chỉ là trước hoặc sau.
5. Hai edit đồng thời; đúng một thành công, request còn lại nhận edit-limit, sau đó frontend tải lại review có thẩm quyền.
6. Đơn có hai order item cùng product nhưng variant khác; tạo hai review và summary count tăng hai.
7. Media proxy trả range đúng, 404 cho media không tham chiếu và 503 không lộ thông tin MinIO khi storage dừng.
8. Hai khách hàng có nhiều review, xác nhận lịch sử của mỗi người chỉ trả review thuộc owner theo thứ tự ổn định; review của sản phẩm đã ẩn vẫn nhận biết được nhưng không có product link.

## 12. Tác Động Và Tương Thích

- Backend cần migration mới, sqlc regeneration, MinIO adapter/config, Wire provider và route review/media.
- Product detail response được mở rộng bằng review summary; thay số `5.0 / 128` tĩnh bằng dữ liệu thật.
- Order item response được mở rộng bằng review state; `awaitingReview` giữ field nhưng đổi semantics có chủ đích.
- Frontend API client cần hỗ trợ `FormData` mà không tự đặt JSON `Content-Type`, đồng thời vẫn giữ auth refresh và envelope handling.
- Frontend chi tiết đơn thêm form/action theo từng dòng; trang sản phẩm thêm section public có pagination và media viewer.
- Backend bổ sung collection có customer auth cho lịch sử review cá nhân; frontend bổ sung route và điểm truy cập "Đánh giá của tôi" trong khu vực tài khoản.
- Frontend admin không thay đổi vì moderation và quản trị review ngoài phạm vi.
- Existing product, order, return, favorite và catalog visibility behavior phải được giữ ngoài các phần mở rộng đã nêu.

## 13. Ranh Giới Contract Cần Đóng Băng

Tính năng có shared boundary giữa backend và frontend nên phải author executable contracts sau khi design được phê duyệt. Contract set cần bao phủ:

- product review summary;
- public paginated review collection;
- order-item review state và semantics `awaitingReview`;
- multipart create/update và media manifest;
- validation fields, business error codes và retry scenarios;
- raw media content route, Range/404/503 semantics;
- scenarios cho duplicate, one-edit limit, returned order và nhiều order item cùng product.
- collection lịch sử review cá nhân, owner isolation, pagination, product identity/link availability và owner edit state.

Chi tiết field, endpoint, status, example và scenario ID không được coi là ổn định cho tới khi contract được review và chuyển sang `FROZEN`.
