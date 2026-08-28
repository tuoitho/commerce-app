# Tài liệu thiết kế

## Tổng quan

Tính năng được triển khai như một miền `review` mới ở backend và một module API/UI tương ứng ở frontend khách hàng. Review được tạo từ dòng hàng chưa refund thuộc order `delivered` hoặc `partially_returned`; `orders`/`order_items` và canonical refunded-item predicate của prerequisite `order-returns` là nguồn sự thật cho ownership và eligibility. Review công khai được tải độc lập với catalog để lỗi review không làm hỏng trang sản phẩm.

Thiết kế bổ sung:

- API công khai để đọc điểm tổng hợp và danh sách review theo sản phẩm.
- API xác thực, lồng dưới dòng hàng của đơn, để tạo và sửa review đúng một lần.
- Metadata review trong phản hồi đơn hàng để frontend biết trạng thái `eligible`, `reviewed`, `refunded` hoặc `ineligible` mà không tự suy luận từ ID nội bộ.
- Kho object MinIO private do ứng dụng quản lý, với URL media cùng origin được backend proxy.
- Giao diện review trên lịch sử/chi tiết đơn và khu vực review thật trên trang sản phẩm.

Thiết kế bao phủ toàn bộ yêu cầu 1.1-7.7.

## Kiến trúc

### Ranh giới backend

Luồng phụ thuộc giữ nguyên `delivery -> usecase -> domain`, repository và storage adapter thực thi interface thuộc domain:

```text
HTTP review handler ─┐
                     ├─> review use case ─> ReviewRepository ─> PostgreSQL/sqlc
HTTP media handler ──┘                   └> ReviewMediaStore  ─> MinIO

order handler ─> order use case ─> OrderRepository ─> orders/order_items/reviews
```

- `domain`: sở hữu model review, media, trạng thái review của dòng hàng, lỗi nghiệp vụ và interface `ReviewRepository`, `ReviewMediaStore`.
- `usecase/review`: xác thực rating/comment/media, điều phối object media, transaction tạo/sửa review, che email và trả dữ liệu công khai hoặc riêng tư.
- `repository`: dùng sqlc cho review, liên kết review vào order item, aggregate/pagination và thống kê đơn chờ review.
- `storage/reviewmedia`: dùng `minio-go/v7` để lưu object trong bucket private, mở object theo key đã được database xác nhận và không nhận object key từ client.
- `delivery/http`: parse multipart có giới hạn, dùng Full Status Envelope cho `/api/v1`, stream binary riêng cho `/media/reviews/:mediaId`.
- `config` và Wire: sở hữu cấu hình MinIO, khởi tạo client/storage/repository/use case và inject vào router.

### Luồng tạo review

1. Frontend lấy `orderId`, `itemId`, phân loại và trạng thái review từ API đơn hàng; người dùng không phải tự cung cấp `productId`, `userId` hay variant nội bộ.
2. Handler nhận multipart, áp giới hạn tổng request, parse rating/comment và danh sách file.
3. Use case preflight order/item/ownership/eligibility, gồm order `delivered`/`partially_returned` và item không matching refunded-item predicate, sinh review/media UUID và object key ngẫu nhiên, sau đó chuẩn hóa comment, xác minh số lượng, kích thước, chữ ký file và MIME thực tế; file hợp lệ được upload bằng `PutObject` vào bucket private.
4. Repository bắt đầu transaction, khóa order tương ứng theo shared lock order của `order-returns`, kiểm tra lại ownership/current order status/refunded-item predicate, rồi tạo review và metadata media trỏ đến các object đã upload. Unique constraint trên `order_item_id` là hàng rào cuối cho hai yêu cầu create đồng thời.
5. Database commit là điểm công khai: media route chỉ resolve object key từ metadata đã commit. Nếu upload hoặc transaction lỗi, object mới được xóa best-effort và không có review chưa hoàn chỉnh được công khai.
6. Frontend nhận review đã tạo, cập nhật dòng hàng và refetch thống kê đơn mà không reload tài liệu trình duyệt.

Việc khóa order đồng bộ với transaction refund. Nếu refund commit trước, create thấy item refunded và bị từ chối; nếu create commit trước, review được giữ khi refund xảy ra sau. File đã upload nhưng thua race được cleanup best-effort.

### Luồng sửa review

1. Client gửi toàn bộ rating/comment mới, danh sách ID media cũ muốn giữ và file mới.
2. Use case preflight ownership và quyền edit còn lại; file mới chỉ được validate và upload vào bucket private sau khi preflight thành công.
3. Transaction khóa review, order và item; xác nhận ownership, `edit_count = 0`, các media ID giữ lại thuộc review và tổng media cũ+mới không vượt giới hạn.
4. Transaction thay thế nội dung, cập nhật tập metadata media trỏ đến object mới và đặt `edit_count = 1`.
5. Object cũ bị loại được xóa khỏi MinIO sau commit theo best-effort. Chúng không còn URL hợp lệ vì metadata đã bị xóa; lỗi xóa chỉ tạo orphan private nội bộ, không làm hỏng review đã commit.

Yêu cầu cập nhật lỗi hoặc cạnh tranh thua không tăng `edit_count`. Item refunded và trạng thái order `partially_returned`/`returned` không chặn sửa review đã tồn tại.

### Lựa chọn lưu trữ media

Chọn MinIO qua SDK chính thức `github.com/minio/minio-go/v7`, theo API S3-compatible được tài liệu SDK hỗ trợ cho `PutObject`, `GetObject`, `StatObject` và `RemoveObject` ([MinIO Go SDK](https://github.com/minio/minio-go), [API reference](https://pkg.go.dev/github.com/minio/minio-go/v7)).

- Bucket luôn private, không có anonymous/public policy. Client browser không nhận endpoint, credential, bucket hay object key.
- Object key do server tạo theo `reviews/<reviewUUID>/<mediaUUID>`; tên file client không tham gia key.
- Database metadata là capability map duy nhất từ public media ID sang bucket/object key. Object upload trước nhưng chỉ truy cập được qua media proxy sau database commit.
- `ReviewMediaStore` bọc các operation put/stat/open-range/remove cần thiết, để use case và handler không phụ thuộc trực tiếp MinIO SDK.
- Backend proxy media thay vì presigned URL để URL review ổn định, cùng origin, không hết hạn và có thể thu hồi ngay khi metadata bị loại. Đổi lại, backend chịu băng thông stream; đây là trade-off được chấp nhận cho phạm vi hiện tại.

Viper sở hữu các biến bắt buộc:

| Biến | Quy tắc |
|---|---|
| `MINIO_ENDPOINT` | Host và port không kèm scheme, ví dụ `localhost:19000` |
| `MINIO_ACCESS_KEY` | Bắt buộc, không rỗng |
| `MINIO_SECRET_KEY` | Bắt buộc, không rỗng và không được log |
| `MINIO_BUCKET` | Mặc định `product-review-media` |
| `MINIO_USE_SSL` | Boolean, mặc định `false` ở development; production phải đặt rõ ràng |

Startup tạo client với static V4 credentials, kiểm tra kết nối, bucket tồn tại và bucket không cho anonymous read; ứng dụng không tự tạo bucket hoặc thay bucket policy. Backend không khởi động nếu cấu hình sai, MinIO không truy cập được, bucket chưa được provision hoặc policy làm media public ngoài proxy.

Development bổ sung `compose.minio.yml` với MinIO API tại `localhost:19000`, console tại `localhost:19001`, named volume và init service tạo bucket private. Root Makefile có `minio-up`/`minio-down`; `.env.example` cung cấp giá trị development không phải production secret. Production phải provision MinIO/bucket/credential ngoài ứng dụng.

Không chọn PostgreSQL `bytea` vì video lớn làm phình database/backup và giữ connection lâu. Không dùng browser upload trực tiếp hoặc presigned PUT vì flow hiện tại cần backend xác minh chữ ký file trước khi object được chấp nhận.

## Thành phần và giao diện

### API đọc review công khai

`GET /api/v1/products/:id/reviews?page=1&limit=10`

- Không yêu cầu đăng nhập.
- `page` mặc định 1; `limit` mặc định 10 và chỉ nhận 1-10.
- Chỉ trả review cho sản phẩm đang có trang catalog công khai, tương thích quy tắc active hiện tại.
- Sắp xếp `createdAt DESC, id DESC` để phân trang ổn định.
- Dùng `writePaginatedSuccess`; `meta.pagination.total` bằng `summary.totalReviews`.

Payload `data`:

```json
{
  "summary": {
    "averageRating": 4.6,
    "totalReviews": 128
  },
  "reviews": [
    {
      "id": "uuid",
      "rating": 5,
      "comment": "Sản phẩm tốt",
      "reviewerEmailMasked": "t***@gmail.com",
      "verifiedPurchase": true,
      "purchasedOptions": [
        { "groupLabel": "Màu", "valueLabel": "Đen" }
      ],
      "media": [
        {
          "id": "uuid",
          "type": "image",
          "url": "/media/reviews/uuid",
          "mimeType": "image/webp",
          "position": 0
        }
      ],
      "createdAt": "2026-08-27T10:00:00Z",
      "updatedAt": "2026-08-27T10:00:00Z"
    }
  ]
}
```

`averageRating` là số làm tròn một chữ số thập phân khi có review và là `null` khi `totalReviews = 0`. `comment` luôn là string, dùng `""` khi không có nội dung. `verifiedPurchase` luôn là `true` vì không có đường tạo review ngoài order item.

Canonical `ReviewMedia` element dùng chung cho public list, create/update response và private `OrderItem.review.media`: `id`, `type` (`image|video`), `url`, `mimeType`, `position` đều bắt buộc, không nullable; array sắp xếp `type/position` ổn định. Đây là ID mà PUT gửi trong `retainedMediaIds`.

Email chỉ được che trong use case/delivery; contract công khai không có field email đầy đủ. Backend dùng `net/mail.ParseAddress` trên stored value, mask canonical `Address` theo ký tự đầu local-part + `***` + domain. `reviewerEmailMasked` là `string|null`; parse thất bại trả null và frontend hiển thị `Khách hàng đã mua`, không trả stored raw value.

### API tạo và sửa review

Các route sau dùng `AuthRequired`:

- `POST /api/v1/orders/:id/items/:itemId/review`: tạo, thành công `201`.
- `PUT /api/v1/orders/:id/items/:itemId/review`: thay thế review lần đầu và duy nhất, thành công `200`.
- Không đăng ký route `DELETE`.

Hai operation nhận `multipart/form-data`:

| Field | Tạo | Sửa | Contract |
|---|---|---|---|
| `rating` | Bắt buộc | Bắt buộc | Chuỗi biểu diễn số nguyên 1-5 |
| `comment` | Tùy chọn | Tùy chọn | Trim hai đầu, tối đa 1.000 ký tự Unicode; chỉ whitespace thành rỗng |
| `images` | Tùy chọn, lặp | Tùy chọn, lặp | File mới; JPEG/PNG/WebP, tối đa 5.000.000 byte/file |
| `video` | Tùy chọn | Tùy chọn | Một file mới; MP4/WebM, tối đa 50.000.000 byte |
| `retainedMediaIds` | Không nhận | Tùy chọn, lặp | UUID media hiện tại cần giữ; thiếu ID nghĩa là loại media đó |

Tổng media sau sửa không quá 5 ảnh và 1 video. Media được giữ lại duy trì thứ tự tương đối cũ; file mới được nối theo thứ tự chọn của client. Request multipart bị giới hạn 80.000.000 byte để có overhead nhưng giới hạn từng file vẫn là chuẩn nghiệp vụ. `Content-Type` khai báo phải khớp MIME xác định từ chữ ký file. Tên file client không được dùng làm storage key hoặc trả công khai.

Canonical validation keys:

| Invalid input | `error.fields` key |
|---|---|
| Rating thiếu/sai range/integer | `rating` |
| Comment quá 1.000 ký tự | `comment` |
| Image count/type/signature/size | `images` |
| Video count/type/signature/size | `video` |
| Retained UUID sai/không thuộc review/sai media set | `retainedMediaIds` |
| Malformed multipart hoặc request vượt 80.000.000 byte trước khi parse field | `body` |

Mỗi key có một message mô tả giới hạn bị vi phạm. Frontend bind năm field keys vào control tương ứng; `body` hiển thị form-level alert. Validation không consume edit quota.

Payload thành công là review riêng tư của chủ sở hữu:

```json
{
  "id": "uuid",
  "rating": 5,
  "comment": "Sản phẩm tốt",
  "media": [],
  "createdAt": "2026-08-27T10:00:00Z",
  "updatedAt": "2026-08-27T10:00:00Z",
  "edited": false,
  "canEdit": true
}
```

`media` trong payload trên là canonical `ReviewMedia[]`, không phải shape riêng. Sau lần sửa thành công, `edited = true`, `canEdit = false`. Một PUT lỗi không thay đổi hai field này.

### Contract đơn hàng mở rộng

Mỗi `OrderItem` trong `GET /api/v1/orders`, `GET /api/v1/orders/:id` và phản hồi tạo/thay đổi đơn được thêm hai field additive:

```json
{
  "reviewStatus": "eligible",
  "review": null
}
```

- `eligible`: item chưa review, chưa refunded và order hiện là `delivered` hoặc `partially_returned`.
- `reviewed`: item có review, bất kể current order/refund state; `review` chứa payload riêng tư ở trên.
- `refunded`: item chưa review và matching canonical refunded-item predicate.
- `ineligible`: item chưa review, chưa refunded nhưng current order không phải `delivered`/`partially_returned`.

`review` bắt buộc khác `null` khi `reviewStatus = reviewed`, ngược lại là `null`. Đây là nguồn trạng thái duy nhất cho frontend; frontend không tự ghép review từ API công khai.

`OrderStats.awaitingReview` giữ kiểu và field hiện tại nhưng đổi cách tính thành số distinct order `delivered`/`partially_returned` có ít nhất một item chưa review và chưa refunded. Thêm `OrderStatusBucket=reviewable` với cùng predicate để stats card và tab `Chờ đánh giá` trả đúng supported source. Bucket `delivered` vẫn trả mọi order `delivered`; bucket `returns` vẫn trả `partially_returned`/`returned` theo prerequisite.

### Media HTTP contract

`GET|HEAD /media/reviews/:mediaId` nằm ngoài `/api/v1`, vì phản hồi là binary chứ không phải Full Status Envelope.

- Chỉ media còn metadata gắn với review mới được phục vụ.
- Trả đúng `Content-Type`, `Content-Length`, `Accept-Ranges: bytes`, hỗ trợ `Range`/`206` cho video và `Content-Disposition: inline`.
- Dùng `X-Content-Type-Options: nosniff` và không phục vụ loại MIME ngoài allowlist.
- Media ID là immutable; response dùng `Cache-Control: public, no-cache` để browser có thể lưu nhưng phải revalidate. Media bị thay trong lần sửa trả `404` theo URL cũ sau revalidation.
- ID sai, metadata không tồn tại hoặc object bị thiếu trả `404` không có JSON envelope; object bị thiếu được log như lỗi nhất quán dữ liệu. MinIO tạm thời không truy cập được trả `503`; mọi trường hợp đều không lộ endpoint, bucket hay object key.

Frontend Vite thêm proxy `/media` đến cùng backend như `/api`. Production contract là reverse proxy giữ `/api` và `/media` cùng origin với SPA.

### Frontend

- `src/api/client.ts`: khi `body` là `FormData`, chuyển thẳng body cho `fetch` và không tự đặt `Content-Type`; giữ nguyên bearer token, credential và một lần refresh/retry.
- `src/api/reviews.ts`: sở hữu wire types và ba operation list/create/update review.
- `ReviewFormDialog`: dùng chung cho create/edit, hiển thị snapshot sản phẩm/phân loại, star radio group, textarea, file picker, preview/remove, client validation và progress/disabled state. Object URL preview phải được revoke khi file bị bỏ hoặc dialog unmount.
- `OrderItemReviewControls`: render `Đánh giá`, nội dung đã review hoặc `Chỉnh sửa` từ `reviewStatus`/`canEdit`, dùng lại ở Order History và Order Detail.
- `ProductReviewsSection`: tải độc lập, render summary, empty/error/retry, pagination, email che, badge `Đã mua hàng`, gallery ảnh và video native `controls`, không autoplay, `preload="metadata"`.
- Header rating hard-code `5.0 (128 đánh giá)` trên Product Detail được thay bằng summary thật; trạng thái không review không hiển thị điểm giả.

Sau create/edit, page cập nhật order item từ response và gọi lại order stats/list review liên quan. Đây là data refresh cục bộ, không reload toàn trang.

## Mô hình dữ liệu

Migration mới `000013_create_product_reviews.up.sql` và `.down.sql` tạo hai bảng sau prerequisite `000012_expand_order_returns`:

### `product_reviews`

| Cột | Ràng buộc |
|---|---|
| `id` | UUID PK, random default |
| `order_item_id` | UUID NOT NULL, UNIQUE, FK `order_items(id)` ON DELETE RESTRICT |
| `rating` | SMALLINT NOT NULL, CHECK 1-5 |
| `comment` | TEXT NOT NULL DEFAULT `''`, CHECK `char_length(comment) <= 1000` |
| `edit_count` | SMALLINT NOT NULL DEFAULT 0, CHECK 0-1 |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() |

Review không lặp `user_id`, `product_id` hay variant: ownership và sản phẩm được truy vết qua `order_item_id -> order_id/product_id`; options dùng snapshot JSONB đã có trên order item. Unique `order_item_id` thực thi quy tắc một review mỗi dòng hàng.

Index bổ sung trên `(created_at DESC, id DESC)` hỗ trợ thứ tự ổn định; truy vấn theo product dùng index `order_items_product_id_idx` hiện có và unique/index review trên `order_item_id`.

### `review_media`

| Cột | Ràng buộc |
|---|---|
| `id` | UUID PK, random default |
| `review_id` | UUID NOT NULL, FK `product_reviews(id)` ON DELETE CASCADE |
| `media_type` | TEXT NOT NULL, CHECK `image` hoặc `video` |
| `mime_type` | TEXT NOT NULL, CHECK đúng allowlist JPEG/PNG/WebP/MP4/WebM |
| `object_key` | TEXT NOT NULL UNIQUE, key MinIO ngẫu nhiên do server tạo |
| `size_bytes` | BIGINT NOT NULL CHECK > 0 và không vượt trần theo loại |
| `position` | SMALLINT NOT NULL CHECK >= 0 |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() |

Unique `(review_id, media_type, position)` giữ thứ tự ổn định. Giới hạn 5 ảnh/1 video được kiểm tra trong transaction vì CHECK constraint không thể đếm nhiều row.

Migration không backfill: không có review cũ. Down migration xóa `review_media` trước `product_reviews`; object trong MinIO là operational data và không tự xóa bởi rollback schema.

Sau migration, chạy `make db-up`, `make gen` để sinh sqlc models/queriers và `make wire` để cập nhật `wire_gen.go`; generated files chỉ được sửa qua generator.

## Xử lý lỗi

API JSON tiếp tục dùng `writeError` và Full Status Envelope:

| HTTP/code | Khi nào | Message nghiệp vụ |
|---|---|---|
| `400 validation_error` | rating/comment/page/limit/images/video/retained ID/body sai | Canonical field errors, không dùng lần edit |
| `401 invalid_token` | Chưa đăng nhập hoặc token lỗi | Contract auth hiện có |
| `404 product_not_found` | Sản phẩm không public khi đọc review | `Không tìm thấy sản phẩm` |
| `404 order_item_not_found` | Order/item không tồn tại, không khớp hoặc không thuộc user | `Không tìm thấy sản phẩm trong đơn hàng` |
| `404 review_not_found` | PUT khi item chưa có review | `Không tìm thấy đánh giá` |
| `409 review_not_eligible` | Order không còn `delivered`/`partially_returned` hoặc item đã refunded khi POST | `Sản phẩm chưa đủ điều kiện đánh giá` |
| `409 review_already_exists` | Item đã có review hoặc thua unique race | `Sản phẩm trong đơn hàng đã được đánh giá` |
| `409 review_edit_limit_reached` | Review đã sửa thành công một lần | `Đánh giá chỉ được chỉnh sửa một lần` |
| `500 internal` | Database/storage lỗi ngoài validation | `Lỗi máy chủ nội bộ` |

Validation file đọc MIME thực tế, không chỉ extension/header. Handler không log comment, nội dung file, token, email đầy đủ, MinIO credential, bucket hay object key; lỗi nội bộ log category, review/media ID khi có và error. Object mới được xóa best-effort khi request bị hủy hoặc transaction thất bại; validation phải hoàn tất trước `PutObject` nên file sai định dạng không được lưu.

Frontend giữ text/rating và danh sách file đã chọn trong dialog khi lỗi có thể retry; lỗi field hiển thị cạnh control, lỗi nghiệp vụ hiển thị thông báo tiếng Việt. Nếu browser không thể giữ lại file handle sau một failure ngoài vòng đời dialog, UI giữ preview hiện tại và chỉ yêu cầu chọn lại khi `File` object thực tế không còn.

Lỗi list review không ảnh hưởng catalog data. Lỗi từng media render placeholder; video không tự phát. Media handler không chuyển tiếp endpoint, bucket, object key hoặc lỗi MinIO cho client.

## Chiến lược kiểm thử

### Backend

- Domain/use case unit tests: rating/comment boundaries, canonical multipart field keys, số lượng/kích thước/MIME, whitespace, bare/display-name/invalid email masking, delivered/partial/refunded eligibility, create duplicate, edit exactly once, failed edit không dùng quota, retained media ownership và aggregate rounding.
- Concurrency repository tests: unique create cho cùng item; hai PUT đồng thời chỉ một thành công; shared order lock và refund/create race theo cả hai commit orders.
- Storage unit tests với fake MinIO client: put/stat/open-range/remove, cleanup lỗi, object key không phụ thuộc filename và client không thể chèn key.
- Storage integration test với MinIO container: upload/read Range/remove, private bucket và startup bucket check.
- HTTP handler tests: multipart create/update, field errors, auth/ownership, Full Status Envelope, pagination, empty summary và public route.
- Media handler tests: GET/HEAD, MIME headers, `nosniff`, byte Range `206`, missing ID/file `404` và file không allowlist.
- Order repository/use case/handler regression: four-value `reviewStatus`, canonical private media payload, `awaitingReview`/`reviewable` đếm distinct delivered/partial order còn item chưa review/chưa refund, delivered/returns buckets không đổi.
- Migration/sqlc integration: FK, unique/check constraints, aggregate/list ordering và product active boundary.

### Frontend

- API client tests xác nhận FormData không bị JSON stringify/đặt Content-Type và vẫn retry sau refresh token.
- Review dialog tests: keyboard star selection, screen-reader labels, 1-5 sao, comment 1.000/1.001, 5/6 ảnh, 1/2 video, size/type, preview/remove, submit disabled/progress và giữ state khi lỗi.
- Order History/Detail tests: eligible/reviewed/refunded/ineligible, reviewable filter, create success cập nhật item/stats, edit một lần sau refund, canonical retained media và không có delete.
- Product Detail tests: summary thật thay hard-code, empty, list/pagination, masked email, media rendering, retry list độc lập và broken-media fallback.
- Kiểm tra trực quan ở desktop và mobile tối thiểu 320 CSS px; keyboard/focus và video controls.

### Verification commands

- MinIO: chạy `make minio-up` ở root, xác nhận health/bucket private trước storage integration; chạy `make minio-down` sau verification.
- Backend: focused `go test`, config tests, `make db-up`, `make gen`, `make wire`, `make test`, `make test-integration`, `make vet` từ `backend/`.
- Frontend: focused Vitest, `npm run lint`, `npm test`, `npm run build` từ `frontend/`.
- Root: `make build` và `make test` sau khi từng package đã pass.

## Truy vết yêu cầu

| Requirement IDs | Thành phần thiết kế | Bằng chứng xác minh |
|---|---|---|
| 1.1-1.5 | Four-value `reviewStatus`; nested order-item review API; unique order item | Order handler/UI và delivered/partial eligibility tests |
| 1.6-1.7 | Refunded-item predicate; review tồn tại độc lập refund sau đó | Refunded create/review visibility tests |
| 2.1-2.4 | ReviewFormDialog; multipart contract; validation use case | Dialog + handler boundary tests |
| 2.5-2.8 | Media allowlist/limits, MinIO object upload, preview và database-gated publish | Validation/storage/failure tests |
| 2.9-2.11 | Unique constraint, local state refresh, persisted media mapping | Concurrency, UI success và repeat-read tests |
| 3.1-3.4 | Private review payload, ownership, PUT replacement | Order UI/API ownership tests |
| 3.5-3.8 | `edit_count`, transaction/cleanup, no DELETE, returned edit allowed | Failure/concurrency/route/returned tests |
| 4.1-4.3 | Public composite review page và aggregate | Empty/average/count tests |
| 4.4-4.6, 4.11 | Canonical masked email/fallback, purchase snapshot, media endpoint/UI | Bare/display-name/invalid privacy and media tests |
| 4.7-4.10 | DB pagination/order, isolated loading/error, refreshed aggregate | Pagination/error/update tests |
| 5.1-5.6 | `awaitingReview`/`reviewable` predicate; unchanged delivered/returns buckets | Order stats/list regression tests |
| 6.1-6.5 | Public GET, guarded writes, canonical order/refunded-item sources, constraints/shared locks | Auth, tampering và refund/create race tests |
| 6.6-6.8 | Product-active read boundary, signature validation, envelope errors | Catalog compatibility/security/response tests |
| 7.1-7.4 | Accessible dialog and asynchronous states | Keyboard/a11y/responsive UI tests |
| 7.5-7.7 | Additive order contract, isolated review domain, media accessibility | Full regression, visual and media-control checks |

## Tích hợp hệ thống hiện có

### Phụ thuộc hỗ trợ

- `orders`/`order_items`: nguồn duy nhất cho ownership, status, product, variant options và lần mua; order query/response cần mở rộng review state.
- `order-returns`: migration `000012`, `partially_returned`, canonical refunded-item predicate và order-first lock ordering là prerequisite bắt buộc; review không duplicate return state.
- `users.email`: nguồn email công khai đã che; không thêm profile hoặc tên hiển thị.
- Catalog active-product rule: public review endpoint dùng cùng boundary với `GetProductByID`; review của sản phẩm inactive vẫn lưu nhưng không có trang công khai riêng.
- Auth guard/JWT: tái sử dụng nguyên trạng cho write routes.
- Full Status Envelope/pagination: tái sử dụng helper hiện có cho JSON; media binary cố ý nằm ngoài `/api/v1`.
- Viper/Wire/sqlc: mở rộng theo convention hiện có; không đọc env trực tiếp và không sửa generated output thủ công.
- Media storage: capability mới bắt buộc vì repository hiện không có upload/storage; MinIO private bucket là nguồn object, database metadata và `/media` proxy kiểm soát truy cập.

### Tác động downstream và tương thích

- `OrderStats.awaitingReview` đổi từ đếm mọi order `delivered` sang đếm order `delivered`/`partially_returned` còn ít nhất một item chưa review/chưa refund. Field/type/API route không đổi.
- `OrderItem` thêm field additive; các field snapshot và luồng đặt/hủy/chuyển trạng thái không đổi.
- Thêm `reviewable` bucket cho stats card/tab; delivered bucket tiếp tục trả mọi order delivered và returns bucket tiếp tục trả partial/full returns.
- Product Detail bỏ số liệu giả `5.0 (128 đánh giá)` và dùng API review thật; catalog vẫn tải độc lập.
- Frontend admin không cần thay đổi vì moderation và quản trị review nằm ngoài phạm vi.
- Vite development proxy thêm `/media`; `/api` và cổng backend hiện tại không đổi.
- MinIO bucket là runtime data và phải có backup/retention phù hợp cùng database trong vận hành production; credential chỉ đi qua Viper và secret management của môi trường.
