# Tài liệu thiết kế

## Tổng quan (Overview)

Thiết kế bổ sung một bounded context mới là `live` (phiên livestream bán hàng) cho backend Go, hai trang mới (trang phát trong `frontend-admin`, trang xem trong `frontend`), một media server MediaMTX chạy bằng Docker, và mở rộng có kiểm soát luồng giá của giỏ hàng, chi tiết sản phẩm, đặt hàng và hủy đơn để áp dụng giá live và số suất.

Phạm vi theo yêu cầu: 1.1–1.8, 2.1–2.6, 3.1–3.9, 4.1–4.7, 5.1–5.5, 6.1–6.7, 7.1–7.4, 8.1–8.10, 9.1–9.4, 10.1.

Luồng dữ liệu tách làm ba kênh độc lập:

1. **Video**: trình duyệt quản trị → WHIP → MediaMTX → WHEP (hoặc HLS dự phòng) → trình duyệt khách. Backend không chuyển tiếp video. Backend chỉ trả lời câu hỏi xác thực của MediaMTX và theo dõi tín hiệu qua Control API.
2. **Thao tác (REST `/api/v1`)**: tạo, kết thúc, cập nhật phiên; bình luận; ẩn bình luận; ghim. Tất cả theo Full Status Envelope.
3. **Sự kiện thời gian thực (WebSocket riêng cho phòng live)**: bình luận mới/ẩn, tim, số người xem, giỏ hàng live, ghim, tín hiệu, kết thúc phiên. Riêng tim đi theo chiều khách → máy chủ qua cùng kết nối.

Các quyết định chính:

| Quyết định | Lựa chọn | Lý do | Phương án đã loại |
|---|---|---|---|
| Truyền video | MediaMTX `1.21.3` tự host. Quản trị viên phát WHIP, khách xem WHEP, dự phòng LL-HLS qua `hls.js` | Độ trễ dưới 1 giây (3.4). Không phí dịch vụ. Một container, cách chạy giống MinIO hiện có | RTMP→HLS: trễ 6–20 giây. Dịch vụ thuê ngoài: phí và phụ thuộc. Tự viết SFU bằng Pion: quá phức tạp |
| Xác thực media | `authMethod: http`. MediaMTX gọi `POST /internal/mediamtx/auth` của backend. Trình duyệt gửi access token hiện có qua `Authorization: Bearer` | Giữ JWT HS256 sẵn có, không cần claim riêng. Kiểm tra được "phiên có đang live không" và "người phát có phải admin không" (1.7, 3.2). MediaMTX chỉ kiểm tra khi mở phiên media, nên access token 15 phút hết hạn không cắt video đang xem | `authMethod: jwt`: phải công bố khóa HMAC qua JWKS và thêm claim quyền; phiên media bị cắt khi token hết hạn |
| Phát hiện tín hiệu | Backend poll `GET /v3/paths/get/live/<id>` (trường `online`) mỗi 5 giây | Không cần hook shell (image MediaMTX là `scratch`). Một nguồn sự thật cho 2.4, 2.5 và 3.9 | Hook `runOnAvailable` gọi HTTP: cần image có shell và một endpoint callback nữa |
| Kênh thời gian thực | Hub WebSocket mới `internal/delivery/livews`, endpoint `GET /api/v1/live/sessions/:id/ws` | Hub chat hiện tại gắn chặt với `ChatRepository`, không có khái niệm phòng, và phát presence cho mọi client. Dùng chung sẽ làm lộ sự kiện live sang chat (9.2) | Mở rộng hub chat: phải thêm phòng, lọc presence và tách vai trò, rủi ro hồi quy chat |
| Tim | Gửi qua WebSocket (`live:heart`, khách gom theo lô 500 ms). Máy chủ giới hạn 10 tim/giây/người, cộng dồn trong bộ nhớ, ghi DB định kỳ 2 giây và khi kết thúc phiên | Tần suất cao, không cần envelope từng lần. Không hiển thị lỗi (5.3) | REST mỗi lần chạm: tốn tài nguyên, nhiều 429 vô nghĩa |
| Bình luận | REST `POST` rồi phát sự kiện qua hub | Cần mã lỗi 400/409/429 theo envelope (4.2, 4.3, 4.7) | Gửi qua WebSocket: không có kênh trả lỗi chuẩn |
| Giá hiệu lực | View `live_active_variant_prices` dùng chung cho mọi truy vấn cần giá hiệu lực (giỏ hàng, đặt hàng, chi tiết sản phẩm, giỏ hàng live) | Một định nghĩa duy nhất cho "giá live đang áp dụng" (8.3, 8.7, 8.8) | Lặp điều kiện SQL ở từng query: dễ lệch |
| Trừ suất | `UPDATE ... SET sold_quantity = sold_quantity + qty WHERE quota IS NULL OR sold_quantity + qty <= quota` trong cùng giao dịch tạo đơn | Nguyên tử, không vượt suất khi đặt đồng thời (8.5) | Khóa bi quan riêng cho bảng giá live: thừa, vì UPDATE có điều kiện đã đủ |
| Nhận diện dòng đơn giá live | Cột mới `order_items.live_session_id` (nullable) | Hoàn suất khi hủy (8.9) cần biết dòng nào đã trừ suất của phiên nào | Suy ra từ thời điểm đặt và đơn giá: mơ hồ khi giá live đổi giữa phiên |
| Trạng thái phòng | Trong bộ nhớ của một tiến trình backend (người xem, bộ đếm tim chờ ghi) | Kiến trúc hiện tại chạy một tiến trình (hub chat cũng vậy) | Redis pub/sub: chưa cần ở quy mô hiện tại |

### Quyết định tự chọn khi thiết kế

Các điểm sau không được nêu trong yêu cầu. Thiết kế chọn như dưới đây và đây là nguồn sự thật cho triển khai:

- **D1.** Giá live chỉ có hiệu lực khi nhỏ hơn giá thường **hiện tại** của biến thể. Nếu quản trị viên sau đó hạ giá thường xuống bằng hoặc thấp hơn giá live, biến thể dùng giá thường (điều kiện nằm trong view). Cách này giữ đúng ý 8.1 "giá live nhỏ hơn giá thường" tại mọi thời điểm.
- **D2.** Gỡ giá live của một biến thể (hoặc bỏ sản phẩm khỏi giỏ hàng live) sẽ xóa bản ghi giá live, kể cả số suất đã bán, của biến thể đó trong phiên.
  - Nếu đặt lại, bản ghi mới có số đã bán bắt đầu từ 0.
  - Nếu đơn mua trước khi gỡ bị hủy trong lúc phiên vẫn `live`:
    - biến thể đang có giá live: suất được hoàn vào bản ghi hiện tại, không xuống dưới 0;
    - biến thể không còn giá live: không hoàn gì.
- **D3.** Số người xem chỉ đếm tài khoản vai trò `customer`. Ứng dụng cửa hàng vốn từ chối tài khoản `admin`, nên quản trị viên chỉ kết nối từ ứng dụng quản trị và không bao giờ được tính.
- **D4.** Khi media server không phản hồi lúc tạo phiên, API trả HTTP 503 với `error.code` = `media_server_unavailable` (mã mới, ngoài nhóm 500 `internal`) để giao diện hiển thị đúng thông điệp 1.8. Nếu WHIP thất bại sau khi phiên đã tạo, giao diện quản trị gọi kết thúc phiên ngay. Cơ chế tự kết thúc sau 10 phút (2.5) là lưới an toàn cuối cùng.
- **D5.** Tên hiển thị của người bình luận dùng đúng biểu thức `author_name` hiện có của bài viết (`db/queries/posts.sql`). Riêng vai trò `admin` hiển thị "Chủ shop".
- **D6.** Giỏ hàng trả thêm cờ `isLivePrice` cho từng dòng để trang giỏ hàng gắn nhãn "Giá live". Giá trong `unitPriceVnd` là giá hiệu lực.
- **D7.** Trang xem live dùng đường dẫn `/live/:sessionId`. Nhãn LIVE và khối trang chủ lấy dữ liệu từ `GET /api/v1/live/current` (công khai), poll mỗi 30 giây và tải lại khi cửa sổ được focus.
- **D8.** Trình duyệt quản trị ưu tiên codec H264 khi phát (`setCodecPreferences`) để HLS dự phòng phát được. Âm thanh dùng Opus.
- **D9.** Quản trị viên mất kết nối WHIP thì tự thử lại với backoff 1 s, 2 s, 4 s… tối đa 30 s. Sau khi tải lại trang quản trị, trang hiển thị phiên đang `live` với nút "Tiếp tục phát" (cần thao tác người dùng để mở camera).
- **D10.** Trang xem chuyển sang HLS khi trình duyệt không có `RTCPeerConnection`, hoặc khi WHEP không đạt trạng thái `connected` trong 5 giây vì lỗi khác 401/403/404. Nếu WHEP trả 404 (chưa có publisher), trang hiển thị "Đang chờ tín hiệu" và thử lại mỗi 3 giây.
  - Phát HLS dùng `hls.js` khi `Hls.isSupported()` (MSE hoặc ManagedMediaSource), gắn token qua header `Authorization: Bearer` trong `xhrSetup`.
  - Nếu không, dùng HLS gốc của trình duyệt (Safari/iOS) với `hlsUrl?token=<accessToken>`, vì thẻ `<video>` không gửi được header.
  - MediaMTX chỉ xác thực HLS khi tạo phiên HLS (playlist đầu tiên); các playlist và segment sau gắn với phiên bằng secret nội bộ. Vì vậy access token hết hạn không cắt video HLS đang xem.
  - Token trong query có thể xuất hiện trong log truy cập của MediaMTX. Chấp nhận được, vì đây chỉ là access token ngắn hạn và chỉ dùng cho đường dự phòng.
- **D12.** Ghim trỏ tới sản phẩm đã ngừng kinh doanh được coi như không ghim: `pinnedProductId` trả `null` khi sản phẩm không có trong `products`.
  - Ngừng kinh doanh sản phẩm hoặc đổi giá thường ở trang quản trị sản phẩm không chủ động phát `live:products`.
  - Người xem nhận danh sách đã lọc ở lần phát `live:products` kế tiếp, hoặc khi kết nối lại.
  - Trong thời gian đó, thêm vào giỏ sản phẩm đã ngừng kinh doanh vẫn bị từ chối bằng mã lỗi giỏ hàng hiện có.
- **D13.** Thứ tự kết thúc phiên (cả do admin và do mất tín hiệu): `LiveEventBroadcaster.FlushHearts(sessionID)` → `EndLiveSession` → đọc lại phiên để dựng `summary` → use case gọi `Broadcast(sessionID, "live:ended", {endedAt, reason})` (nơi duy nhất phát `live:ended`) → `CloseRoom(sessionID)` (chỉ đóng mọi kết nối của phòng với mã 1000, không gửi thêm sự kiện). Nhờ vậy `summary.heartCount` đã gồm mọi tim được ghi nhận trước khi kết thúc.
- **D11.** Admin chọn sản phẩm bằng `GET /api/v1/admin/products?q=` hiện có và lấy biến thể qua `GET /api/v1/admin/products/:id`. Backend từ chối sản phẩm `active = false` khi lưu (1.4), nên không cần thêm trường mới cho danh sách sản phẩm quản trị.

## Kiến trúc (Architecture)

```text
frontend-admin /livestream                     MediaMTX 1.21.3 (Docker)                 frontend /live/:id
 LiveSetupForm ─REST─┐                           :8889 WHIP/WHEP  :8888 HLS               LivePlayer ── WHEP / hls.js
 LivePublisher ──WHIP (Bearer)──────────────────► path live/<id> ◄──WHEP / HLS (Bearer)── LiveComments, HeartButton
 LiveControlPanel ─REST/WS─┐                         │ authMethod http                        LiveCartSheet, PinnedCard
                           │                         ▼                                         │ REST + WS
                           ▼              POST /internal/mediamtx/auth                         ▼
                 backend (Gin)  ◄────────────────────┘  ◄── GET /v3/paths/get/live/<id> (poll 5s, :9997)
   delivery/http: live_handler.go, admin_live_handler.go, mediamtx_auth_handler.go
   delivery/livews: Hub (phòng theo sessionId), Client, Handler
        │
        ▼
   usecase/live: UseCase (phiên, giỏ hàng live, giá, bình luận, tim, tín hiệu)
        │                          ▲ domain.LiveQuotaObserver (sau khi tạo/hủy đơn)
        ▼                          │
   domain/live.go ── repository/live_repository.go ── sqlc db/queries/live.sql
   cart.sql / orders.sql / catalog.sql JOIN view live_active_variant_prices
```

Chiều phụ thuộc giữ nguyên `delivery -> usecase -> domain`. `internal/media/mediamtx` là adapter cho Control API, hiện thực interface `domain.MediaServer`.

### Luồng chính

**Bắt đầu phát (1.3, 1.5, 1.8):**

1. Admin gửi `POST /admin/live/sessions`.
2. Use case gọi `MediaServer.Ping`. Lỗi → 503 `media_server_unavailable`.
3. Repository chèn `live_sessions` (unique index một phiên `live`; vi phạm → `ErrLivestreamAlreadyActive`) cùng sản phẩm và giá, trong một giao dịch.
4. Phản hồi `AdminLiveSession` kèm `media.whipUrl`.
5. Trình duyệt quản trị WHIP với Bearer token. MediaMTX gọi auth `action=publish` → backend cho phép nếu token là admin và path `live/<id>` là phiên đang `live`.
6. Nếu WHIP thất bại lần đầu, giao diện gọi `POST /admin/live/sessions/:id/end` (D4).

**Xem (3.2, 3.3):**

1. Trang `/live/:id` kiểm tra đăng nhập; chưa đăng nhập thì `navigate('/login?redirect=/live/:id')` (cơ chế `?redirect=` hiện có).
2. Gọi `GET /live/sessions/:id` lấy snapshot (sản phẩm, 50 bình luận, ghim, số liệu, URL media).
3. Mở WebSocket phòng.
4. WHEP tới `media.whepUrl` với Bearer token. MediaMTX gọi auth `action=read` → backend cho phép khi token hợp lệ và phiên `live`.

**Tín hiệu và tự kết thúc (2.4, 2.5, 3.9):**

- `SignalMonitor` (goroutine trong `App.Run`, giống ticker `AutoConfirmDue`) chạy mỗi `LIVE_SIGNAL_POLL_INTERVAL`, đọc phiên `live` hiện tại và gọi `MediaServer.PathOnline`.
- Khi trạng thái đổi, phát `live:signal`.
- Khi online, cập nhật `last_signal_at`.
- Nếu offline liên tục `LIVE_SIGNAL_TIMEOUT` (mặc định 10 phút) tính từ `max(started_at, last_signal_at)` thì kết thúc phiên với `end_reason = 'signal_lost'`.
- Lỗi gọi Control API được coi như offline.

**Đặt hàng giá live (8.5, 8.6):** trong giao dịch `OrderRepository.Create` hiện có, sau khi kiểm tra tồn kho và độ lệch giá:

- Với mỗi dòng có `live_session_id` từ view, gọi `ConsumeLiveQuota`.
- Không cập nhật được dòng nào → đọc số suất còn lại:
  - còn ≥ 1 → `LiveQuotaExceededError{ProductName, Remaining}` (409 `live_quota_exceeded`);
  - còn 0 (bị người khác mua hết đồng thời) → `ProductChangedError` hiện có (giá đã đổi về giá thường).
- `InsertOrderItem` ghi `live_session_id`.
- Sau commit, use case đơn hàng gọi `LiveQuotaObserver.LiveQuotaChanged(ctx)`. Live use case tải lại giỏ hàng live và phát `live:products`.

**Hủy đơn (8.9):**

- `OrderRepository.Cancel` (nhánh chuyển thẳng sang `cancelled`) và `AdminTransition` (`approve_cancel`) gọi thêm `RestoreLiveQuotaForOrder` trong cùng giao dịch, ngay cạnh bước hoàn kho.
- Query chỉ hoàn cho dòng có `live_session_id` thuộc phiên đang `live`.
- Sau commit, gọi `LiveQuotaChanged`.

## Thành phần và giao diện (Components And Interfaces)

### Contract CONFIG-LIVE (rev 1)

Khóa cấu hình mới trong `internal/config` (Viper, cùng mẫu khai báo/mặc định/kiểm tra như nhóm MinIO):

| Khóa | Mặc định | Kiểm tra | Dùng cho |
|---|---|---|---|
| `MEDIAMTX_API_URL` | `http://127.0.0.1:9997` | URL http(s) hợp lệ | Control API (ping, path online) |
| `MEDIAMTX_WEBRTC_PUBLIC_URL` | `http://localhost:8889` | URL http(s) hợp lệ, không có `/` cuối | Sinh `whipUrl`/`whepUrl` trả cho trình duyệt |
| `MEDIAMTX_HLS_PUBLIC_URL` | `http://localhost:8888` | URL http(s) hợp lệ, không có `/` cuối | Sinh `hlsUrl` |
| `LIVE_SIGNAL_POLL_INTERVAL` | `5s` | duration, từ 1s đến 60s | `SignalMonitor` |
| `LIVE_SIGNAL_TIMEOUT` | `10m` | duration > 0 | Tự kết thúc (2.5) |

Đường dẫn media: `whipUrl = <WEBRTC>/live/<sessionId>/whip`, `whepUrl = <WEBRTC>/live/<sessionId>/whep`, `hlsUrl = <HLS>/live/<sessionId>/index.m3u8`. Path MediaMTX: `live/<sessionId>`.

### Contract CONFIG-MEDIAMTX (rev 1)

File `compose.mediamtx.yml` và `mediamtx.yml` ở gốc repo. Makefile gốc thêm `mediamtx-up` và `mediamtx-down` (cùng mẫu `minio-up`).

- **Image:** `bluenviron/mediamtx:1.21.3`.
- **Cổng:** `8889:8889` (WebRTC HTTP), `8189:8189/udp` (ICE), `8888:8888` (HLS), `127.0.0.1:9997:9997` (API, chỉ bind localhost).
- **`extra_hosts`:** `host.docker.internal:host-gateway`.
- **`mediamtx.yml` bắt buộc có:**
  - `authMethod: http`, `authHTTPAddress: http://host.docker.internal:18080/internal/mediamtx/auth`, `authHTTPExclude: [{action: api}, {action: metrics}, {action: pprof}]`;
  - `api: yes`, `apiAddress: :9997`;
  - `webrtc: yes`, `webrtcAddress: :8889`, `webrtcLocalUDPAddress: :8189`, `webrtcAdditionalHosts: [127.0.0.1]`, `webrtcAllowOrigins: ['http://localhost:15173', 'http://localhost:15174']`;
  - `hls: yes`, `hlsAddress: :8888`, `hlsVariant: lowLatency`, `hlsAllowOrigins` như trên;
  - `rtsp: no`, `rtmp: no`, `srt: no`;
  - `paths: { "~^live/[0-9a-f-]{36}$": { overridePublisher: yes } }`; mọi path khác không khai báo.

### Contract API-MEDIAMTX-AUTH (rev 1)

`POST /internal/mediamtx/auth` (ngoài `/api/v1`, không theo envelope vì người gọi là MediaMTX).

- **Body:** JSON MediaMTX `{ip, user, password, token, action, path, protocol, id, query, userAgent}`. Backend chỉ dùng `token`, `action`, `path`.
- **Quy tắc:**
  - Lấy token từ trường `token`. Nếu rỗng, lấy tham số `token` trong chuỗi `query` (đường HLS gốc theo D10).
  - Token phải là access token hợp lệ (`jwt.Manager.ParseAccessToken`).
  - `path` phải khớp `live/<uuid>` của phiên có `status = 'live'`.
  - `action = publish` → thêm điều kiện vai trò `admin`.
  - `action = read` → mọi vai trò.
  - Hành động khác → từ chối.
- **Phản hồi:** cho phép là `200` thân rỗng. Từ chối là `401` thân rỗng. Lỗi DB là `500`; MediaMTX coi mọi mã khác 2xx là từ chối.
- Không ghi log token.

### Contract API-LIVE-PUBLIC (rev 1)

Mọi phản hồi theo Full Status Envelope. Kiểu dùng chung ở mục TYPE-LIVE.

| Phương thức + đường dẫn | Bảo vệ | Thành công | Lỗi |
|---|---|---|---|
| `GET /api/v1/live/current` | công khai | 200, `data`: `LiveSummary \| null`, message `"Live session retrieved successfully"` | 500 |
| `GET /api/v1/live/sessions/:id` | `AuthRequired` | 200, `data`: `LiveSessionView` (cả phiên `ended`) | 401; 404 `livestream_not_found` (id không phải UUID hoặc không tồn tại) |
| `POST /api/v1/live/sessions/:id/comments` | `AuthRequired` + `RequireRole(customer)` | 201, `data`: `LiveComment`, message `"Đã gửi bình luận"` | 400 `validation_error` `fields.content`; 401; 403; 404; 409 `livestream_ended`; 429 `rate_limited` |
| `GET /api/v1/live/sessions/:id/ws?token=` | token qua query (như chat) | nâng cấp WebSocket | phiên không tồn tại → đóng mã 4004; token sai → đóng 4001 |

Thông điệp tiếng Việt cố định:

| Mã | Thông điệp |
|---|---|
| `livestream_not_found` | "Không tìm thấy phiên live" |
| `livestream_ended` | "Phiên live đã kết thúc" |
| `rate_limited` | "Bạn bình luận quá nhanh, vui lòng thử lại sau giây lát" |
| `livestream_already_active` | "Đang có một phiên live khác diễn ra" |
| `media_server_unavailable` | "Không kết nối được máy chủ phát video" |
| `live_quota_exceeded` | "Chỉ còn {X} suất giá live cho {tên sản phẩm}. Vui lòng giảm số lượng." |

### Contract API-LIVE-ADMIN (rev 1)

Đăng ký trong nhóm `admin` hiện có (`AuthRequired` + `RequireAdmin`): 401/403 qua middleware sẵn có.

| Phương thức + đường dẫn | Body | Thành công | Lỗi |
|---|---|---|---|
| `GET /api/v1/admin/live/sessions/current` | — | 200, `AdminLiveSession \| null` | — |
| `GET /api/v1/admin/live/sessions/:id` | — | 200, `AdminLiveSession` | 404 |
| `POST /api/v1/admin/live/sessions` | `{title, products: LiveProductInput[]}` | 201, `AdminLiveSession`, message `"Đã bắt đầu phiên live"` | 400; 409 `livestream_already_active`; 503 `media_server_unavailable` |
| `PUT /api/v1/admin/live/sessions/:id/products` | `{products: LiveProductInput[]}` (thay toàn bộ; thứ tự mảng là thứ tự hiển thị) | 200, `AdminLiveSession` | 400; 404; 409 `livestream_ended` |
| `PUT /api/v1/admin/live/sessions/:id/pin` | `{productId: string \| null}` | 200, `AdminLiveSession` | 400 (`fields.productId` khi sản phẩm không thuộc giỏ hàng live); 404; 409 `livestream_ended` |
| `POST /api/v1/admin/live/sessions/:id/end` | — | 200, `AdminLiveSession` | 404; 409 `livestream_ended` |
| `POST /api/v1/admin/live/sessions/:id/comments` | `{content}` | 201, `LiveComment` (không giới hạn tần suất) | 400; 404; 409 `livestream_ended` |
| `POST /api/v1/admin/live/comments/:commentId/hide` | — | 200, `LiveComment` với `hidden: true` (ẩn lại lần nữa vẫn thành công) | 404 `livestream_comment_not_found` ("Không tìm thấy bình luận") |

**Kiểm tra `LiveProductInput`:**

- **Cấu trúc:** `{productId: string, variants: {variantId: string, livePriceVnd: string, quota: number | null}[]}`.
- **Sản phẩm:** 0–50 sản phẩm, không trùng `productId`, mỗi sản phẩm `active`. `variants` có thể rỗng (sản phẩm không có giá live).
- **Biến thể:** mỗi `variantId` thuộc đúng `productId` và `active`, không trùng.
- **Giá live:** `livePriceVnd` là chuỗi số nguyên dương nhỏ hơn `price_vnd` hiện tại.
- **Số suất:** `quota` là `null` hoặc số nguyên 1–100000 và ≥ `sold` hiện có của (phiên, biến thể).
- **Lỗi** là 400 `validation_error`, khóa `fields` theo đường dẫn:

| Khóa | Thông điệp |
|---|---|
| `title` | "Tiêu đề phải từ 1 đến 120 ký tự" |
| `products` | "Tối đa 50 sản phẩm" |
| `products[i].productId` | "Sản phẩm không tồn tại hoặc đã ngừng kinh doanh"; trùng sản phẩm: "Sản phẩm bị trùng" |
| `products[i].variants[j].variantId` | "Biến thể không thuộc sản phẩm hoặc đã ngừng kinh doanh"; trùng biến thể: "Biến thể bị trùng" |
| `products[i].variants[j].livePriceVnd` | Không phải số nguyên dương: "Giá live phải là số nguyên dương"; không nhỏ hơn giá thường: "Giá live phải nhỏ hơn giá thường" |
| `products[i].variants[j].quota` | "Số suất phải từ 1 đến 100000" hoặc "Số suất không được nhỏ hơn số đã bán ({sold})" |

### Contract TYPE-LIVE (rev 1)

JSON camelCase; tiền là chuỗi số nguyên VND; thời gian RFC 3339 UTC.

```jsonc
// LiveSummary
{ "id": "uuid", "title": "string", "startedAt": "time" }

// LiveMedia
{ "whepUrl": "string", "hlsUrl": "string" }                 // AdminLiveSession.media có thêm "whipUrl"

// LiveVariantPrice
{
  "variantId": "uuid",
  "optionLabel": "string",          // ví dụ "256GB / Titan Đen"; "" nếu sản phẩm không có tùy chọn
  "regularPriceVnd": "string",
  "livePriceVnd": "string",
  "quota": 20,                      // number | null
  "sold": 3,                        // number
  "remaining": 17,                  // number | null (null khi quota null)
  "active": true                    // true khi giá live đang hiệu lực theo view (phiên live, còn suất, nhỏ hơn giá thường)
}

// LiveProduct
{
  "productId": "uuid",
  "position": 0,
  "name": "string",
  "brand": "string",
  "imageUrl": "string",             // "" khi không có ảnh
  "minPriceVnd": "string",          // khoảng giá hiệu lực trên các biến thể active
  "maxPriceVnd": "string",
  "regularMinPriceVnd": "string",   // khoảng giá thường
  "regularMaxPriceVnd": "string",
  "hasLivePrice": true,             // có ít nhất một biến thể active giá live
  "inStock": true,
  "livePrices": [LiveVariantPrice]
}

// LiveComment
{
  "id": "uuid",
  "sessionId": "uuid",
  "authorName": "string",           // admin → "Chủ shop"
  "authorRole": "customer" | "admin",
  "content": "string",
  "hidden": false,
  "createdAt": "time"
}

// LiveSessionView (khách)
{
  "id": "uuid", "title": "string", "status": "live" | "ended",
  "startedAt": "time", "endedAt": "time | null",
  "viewerCount": 0, "heartCount": 0, "signalOnline": true,
  "pinnedProductId": "uuid | null",
  "products": [LiveProduct],        // chỉ sản phẩm active; rỗng khi phiên ended
  "comments": [LiveComment],        // tối đa 50 bình luận chưa ẩn, cũ → mới; rỗng khi phiên ended
  "media": LiveMedia | null         // null khi phiên ended
}

// AdminLiveSession = LiveSessionView, trong đó:
//   media có thêm "whipUrl"
//   comments gồm cả bình luận đã ẩn (tối đa 50)
//   products luôn được trả, kể cả khi phiên ended; khi ended mọi livePrices[].active = false,
//     còn sold/quota giữ giá trị cuối để hiển thị số suất đã bán trong tóm tắt (2.6)
//   có thêm "summary": {
//     "durationSeconds": 0, "peakViewers": 0, "commentCount": 0, "heartCount": 0,
//     "endReason": "admin" | "signal_lost" | null
//   }
```

Giỏ hàng (`API-CART` hiện có, mở rộng tương thích ngược): mỗi item thêm `isLivePrice: boolean`. `unitPriceVnd` và `lineTotalVnd` dùng giá hiệu lực.

Chi tiết sản phẩm (`GET /api/v1/products/:id`, mở rộng tương thích ngược): mỗi phần tử `variants[]` thêm `livePriceVnd: string | null` (giá live đang hiệu lực) và `liveRemaining: number | null` (số suất còn lại; `null` khi không giới hạn hoặc không có giá live). `priceVnd`, `minPriceVnd`, `maxPriceVnd`, `price` giữ là giá thường. `GET /products`, `/products/featured` và `/admin/products*` không đổi (8.4).

### Contract WS-LIVE-ROOM (rev 1)

Khung tin `{ "type": string, "payload"?: object }` như hub chat.

**Máy chủ → khách** (phát cho mọi client trong phòng `sessionId`, kể cả admin):

| type | payload | Khi nào |
|---|---|---|
| `live:comment` | `LiveComment` | sau khi lưu bình luận |
| `live:comment_hidden` | `{ "commentId": "uuid" }` | sau khi ẩn |
| `live:hearts` | `{ "total": 123, "bursts": [{"userId": "uuid", "count": 3}] }` | tối đa mỗi 300 ms khi có tim mới; `bursts` gộp theo người, tối đa 20 phần tử; khách bỏ qua phần của chính mình khi vẽ hiệu ứng |
| `live:viewers` | `{ "count": 12 }` | khi số người xem khác nhau thay đổi; gửi ngay cho client vừa kết nối |
| `live:products` | `{ "products": [LiveProduct], "pinnedProductId": "uuid \| null" }` | sau khi đổi giỏ hàng live, giá, ghim, khi suất thay đổi do tạo/hủy đơn; sản phẩm đã ngừng kinh doanh bị lọc ở mỗi lần dựng (D12) |
| `live:signal` | `{ "online": true }` | khi `SignalMonitor` thấy trạng thái đổi; gửi ngay khi kết nối |
| `live:ended` | `{ "endedAt": "time", "reason": "admin" \| "signal_lost" }` | khi phiên kết thúc (do use case phát, D13); sau đó `CloseRoom` đóng kết nối với mã 1000 |
| `pong` | — | trả lời `ping` |

**Khách → máy chủ:**

| type | payload | Quy tắc |
|---|---|---|
| `ping` | — | mỗi 30 s như chat |
| `live:heart` | `{ "count": n }` (1–50) | chỉ vai trò `customer`; phiên phải `live`; tối đa 10 tim/giây/người theo cửa sổ 1 s, phần vượt bị bỏ qua không báo lỗi; payload sai thì bỏ qua |

Admin cũng kết nối cùng endpoint (vai trò `admin`, không được tính vào số người xem, `live:heart` của admin bị bỏ qua).

### Contract DOMAIN-LIVE-INTERFACES (rev 1)

Trong `internal/domain/live.go` (tên public dùng xuyên task):

- `LiveRepository`: các thao tác phiên, sản phẩm/giá, bình luận, tim, tín hiệu.
- `MediaServer`: `Ping(ctx) error`, `PathOnline(ctx, path string) (bool, error)`.
- `LiveEventBroadcaster`: `Broadcast(sessionID string, event string, payload any)`, `FlushHearts(ctx context.Context, sessionID string) error`, `CloseRoom(sessionID string)`, `ViewerCount(sessionID string) int`.
- `LiveQuotaObserver`: `LiveQuotaChanged(ctx context.Context)`. Use case đơn hàng nhận qua Wire và gọi khi khác `nil`.
- Lỗi:
  - sentinel `ErrLivestreamNotFound`, `ErrLivestreamAlreadyActive`, `ErrLivestreamEnded`, `ErrLiveCommentNotFound`, `ErrRateLimited`, `ErrMediaServerUnavailable`;
  - kiểu `LiveQuotaExceededError{ProductName string; Remaining int64}`.
  - Tất cả được ánh xạ trong `delivery/http/error.go` theo bảng thông điệp ở API-LIVE-PUBLIC.

### Frontend cửa hàng (`frontend/`)

- `src/api/live.ts`: gọi API-LIVE-PUBLIC và dựng URL WebSocket phòng (cùng cách tính base như `getChatWebSocketUrl`, đường dẫn `/live/sessions/:id/ws`).
- `src/hooks/useLiveSocket.ts`: kết nối lại theo backoff, khóa khi 4001 như `useChatSocket`, dừng khi nhận `live:ended` hoặc đóng mã 1000/4004.
- `src/hooks/useCurrentLive.ts`: poll `GET /live/current` (D7). Dùng cho `Header` (link "LIVE" công khai, đặt sau "Trang chủ" ở nav desktop và mobile) và khối `LiveBanner` trên `HomePage` (giữa hero và thanh cam kết).
- `src/lib/liveMedia.ts`: client WHEP (`RTCPeerConnection` recvonly, chờ ICE gathering complete, `POST application/sdp` có Bearer, `DELETE` khi rời trang) và HLS dự phòng (`hls.js` với `xhrSetup` gắn Bearer; Safari dùng HLS gốc) theo D10.
- `src/pages/LivePage.tsx` (route `/live/:sessionId`), các thành phần trong `src/components/live/`:
  - `LivePlayer`: trạng thái "Đang chờ tín hiệu", nút "Bật âm thanh" (3.5).
  - `LiveComments`: danh sách, ô nhập, giữ nội dung khi 429.
  - `HeartButton` + `FloatingHearts`: keyframes CSS trong `index.css`, gom lô 500 ms.
  - `LiveCartSheet`: bảng trượt dưới; bộ chọn biến thể riêng cho live theo `optionGroups`/`variants` của `GET /products/:id`; thêm vào giỏ qua `useCart().addItem`; tên sản phẩm mở tab mới.
  - `PinnedProductCard`.
  - `ViewerBadge`.
- Bố cục dưới 768px theo 3.7. Từ 768px trở lên: video 9:16 ở giữa, bình luận và giỏ hàng live ở cột phải.
- `ProductDetailPage`: khi `selectedVariant.livePriceVnd` khác `null`, hiển thị giá live, giá thường gạch ngang, nhãn "Giá live" và "Còn X suất" khi có `liveRemaining`.
- `CartPage`: nhãn "Giá live" khi `isLivePrice`.
- `CheckoutPage`: thêm nhánh `live_quota_exceeded` hiển thị `err.message` và tải lại giỏ hàng. Nhánh `product_changed` giữ nguyên (8.8).

### Frontend quản trị (`frontend-admin/`)

- `src/api/live.ts`: gọi API-LIVE-ADMIN và dựng URL WebSocket.
- `src/hooks/useAdminLiveSocket.ts`.
- `src/lib/whip.ts`: publisher WHIP (`sendonly`, ưu tiên H264 theo D8, thử lại theo D9, thay track khi đổi thiết bị, bật/tắt bằng `track.enabled`).
- `src/pages/LivestreamPage.tsx` (route `/livestream`, mục sidebar "Livestream" với icon `Radio`). Ba trạng thái:
  - **Chuẩn bị:** `LiveSetupForm` gồm tiêu đề, `LiveProductPicker` (tìm theo `getAdminProducts`, tải biến thể theo `getAdminProductById`), `LivePriceTable` (giá live, số suất từng biến thể), chọn thiết bị và xem trước.
  - **Đang phát:** `LiveBroadcastPanel` (xem trước, trạng thái kết nối, thời lượng, số người xem, tổng tim, bật/tắt mic/camera, "Kết thúc live" với `alert-dialog`), `LiveCommentsPanel` (gửi, ẩn), `LiveProductsManager` (thêm/bỏ/sắp xếp lên-xuống, sửa giá/suất, ghim/bỏ ghim, hiển thị đã bán/suất).
  - **Đã kết thúc:** `LiveSummaryCard` (2.6).
- Lỗi `fields` của API gắn vào ô tương ứng.

## Mô hình dữ liệu (Data Models)

### Contract DB-LIVE (rev 1)

Migration `<NNNNNN>_create_livestream.up.sql` / `.down.sql`, trong đó `<NNNNNN>` là số kế tiếp còn trống trong `backend/db/migrations/` tại thời điểm triển khai (hiện tại là `000021`, vì `000020` đã được tính năng quản lý người dùng dùng):

```sql
CREATE TABLE live_sessions (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title             text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
    status            text NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'ended')),
    created_by        uuid NOT NULL REFERENCES users(id),
    pinned_product_id uuid NULL REFERENCES products(id) ON DELETE SET NULL,
    heart_count       bigint NOT NULL DEFAULT 0 CHECK (heart_count >= 0),
    peak_viewers      integer NOT NULL DEFAULT 0 CHECK (peak_viewers >= 0),
    started_at        timestamptz NOT NULL DEFAULT now(),
    last_signal_at    timestamptz NULL,
    ended_at          timestamptz NULL,
    end_reason        text NULL CHECK (end_reason IN ('admin', 'signal_lost')),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CHECK ((status = 'live') = (ended_at IS NULL))
);
CREATE UNIQUE INDEX live_sessions_single_live_idx ON live_sessions ((true)) WHERE status = 'live';

CREATE TABLE live_session_products (
    session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    position   integer NOT NULL CHECK (position >= 0),
    PRIMARY KEY (session_id, product_id)
);

CREATE TABLE live_variant_prices (
    session_id     uuid NOT NULL,
    product_id     uuid NOT NULL,
    variant_id     uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    live_price_vnd numeric NOT NULL CHECK (live_price_vnd = trunc(live_price_vnd) AND live_price_vnd > 0),
    quota          integer NULL CHECK (quota BETWEEN 1 AND 100000),
    sold_quantity  integer NOT NULL DEFAULT 0 CHECK (sold_quantity >= 0),
    PRIMARY KEY (session_id, variant_id),
    FOREIGN KEY (session_id, product_id) REFERENCES live_session_products(session_id, product_id) ON DELETE CASCADE,
    CHECK (quota IS NULL OR sold_quantity <= quota)
);

CREATE TABLE live_comments (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users(id),
    content    text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 200),
    hidden_at  timestamptz NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX live_comments_session_created_idx ON live_comments (session_id, created_at DESC, id DESC);
CREATE INDEX live_comments_session_user_created_idx ON live_comments (session_id, user_id, created_at DESC);

ALTER TABLE order_items ADD COLUMN live_session_id uuid NULL REFERENCES live_sessions(id);

CREATE VIEW live_active_variant_prices AS
SELECT lvp.session_id, lvp.product_id, lvp.variant_id, lvp.live_price_vnd, lvp.quota, lvp.sold_quantity
FROM live_variant_prices lvp
JOIN live_sessions s ON s.id = lvp.session_id AND s.status = 'live'
JOIN product_variants v ON v.id = lvp.variant_id
WHERE lvp.live_price_vnd < v.price_vnd
  AND (lvp.quota IS NULL OR lvp.sold_quantity < lvp.quota);
```

`down` xóa theo thứ tự ngược: view, cột `order_items.live_session_id`, `live_comments`, `live_variant_prices`, `live_session_products`, `live_sessions`.

**Bất biến:**

- **I1.** Tối đa một phiên `live` (unique index một phần).
- **I2.** `sold_quantity <= quota` (CHECK). Mọi thao tác trừ suất dùng UPDATE có điều kiện.
- **I3.** Giá live chỉ có hiệu lực qua view.
- **I4.** `order_items.live_session_id` khác `NULL` khi và chỉ khi đơn giá của dòng lấy từ view tại thời điểm tạo đơn.

### Contract DB-PRICE-QUERIES (rev 1)

Các query sqlc hiện có được đổi để lấy giá hiệu lực (thêm `LEFT JOIN live_active_variant_prices lap ON lap.variant_id = v.id`):

| Query | Thay đổi |
|---|---|
| `cart.sql`: `LockVariant`, `ListCartRows` | `COALESCE(lap.live_price_vnd, v.price_vnd)::text AS price_vnd`; thêm `(lap.variant_id IS NOT NULL) AS is_live_price`. `LockVariant` đổi `FOR UPDATE` thành `FOR UPDATE OF v, p`, vì PostgreSQL không cho khóa phía nullable của outer join |
| `orders.sql`: `LockSubmittedCartItems` | Như trên, thêm `lap.session_id AS live_session_id`. `FOR UPDATE OF ci, v` giữ nguyên; view không bị khóa |
| `orders.sql`: `InsertOrderItem` | Thêm tham số `live_session_id` (nullable) |
| `catalog.sql`: `ListActiveProductVariants` | Thêm `lap.live_price_vnd::text AS live_price_vnd` (nullable) và `CASE WHEN lap.quota IS NULL THEN NULL ELSE lap.quota - lap.sold_quantity END AS live_remaining`. `price_vnd` giữ giá thường |

Query mới trong `live.sql`, gồm:

- `ConsumeLiveQuota :one` (UPDATE có điều kiện, `RETURNING`);
- `GetLiveQuotaRemaining :one`;
- `RestoreLiveQuotaForOrder :exec`: hoàn cho các dòng có `live_session_id` thuộc phiên `status = 'live'`, `GREATEST(sold_quantity - oi.quantity, 0)`;
- các query CRUD phiên/sản phẩm/giá/bình luận;
- `LastCommentAtByUser`;
- `AddHearts`;
- `UpdatePeakViewers` (`GREATEST`);
- `TouchSignal`;
- `EndLiveSession` (`WHERE status = 'live'`, trả lỗi `livestream_ended` khi không có dòng).

Sau khi đổi query phải chạy `make -C backend gen` và áp migration bằng `make db-up`.

## Xử lý lỗi (Error Handling)

**Bảng lỗi API:**

| Tình huống | HTTP | `error.code` | Ghi chú |
|---|---|---|---|
| Dữ liệu tạo/cập nhật phiên, bình luận sai | 400 | `validation_error` | `fields` theo API-LIVE-ADMIN |
| Không đăng nhập / không phải admin | 401 / 403 | middleware hiện có | |
| Phiên không tồn tại | 404 | `livestream_not_found` | |
| Đã có phiên `live` | 409 | `livestream_already_active` | Kể cả khi hai yêu cầu tạo chạy đồng thời (unique index) |
| Thao tác trên phiên `ended` | 409 | `livestream_ended` | |
| Bình luận nhanh hơn 2 giây | 429 | `rate_limited` | So với `created_at` bình luận gần nhất của người đó trong phiên |
| Vượt suất | 409 | `live_quota_exceeded` | Không tạo đơn, không trừ suất (giao dịch rollback) |
| Giá đổi giữa lúc thanh toán | 409 | `product_changed` | Luồng hiện có |
| Media server không phản hồi khi tạo phiên | 503 | `media_server_unavailable` | `Ping` timeout 3 giây |
| Lỗi khác | 500 | `internal` | |

**Ngoài API:**

- **Auth MediaMTX:** từ chối bằng 401 không thân. Ghi log `debug` với `action`, `path`, không ghi token.
- **WebSocket:**
  - Mất kết nối thì khách tự kết nối lại theo backoff; khi nối lại thì gọi lại `GET /live/sessions/:id` để đồng bộ snapshot.
  - Buffer gửi đầy (256) thì bỏ tin như hub chat.
  - Bỏ tin `live:hearts` không ảnh hưởng tổng vì sự kiện tiếp theo mang `total` mới.
- **`SignalMonitor`:** lỗi Control API ghi log `warn` tối đa một lần mỗi phút và coi như offline. Lỗi DB ghi `error` và thử lại ở chu kỳ sau.
- **Bộ đếm tim:** ghi DB thất bại thì giữ phần chưa ghi để cộng lần sau. Khi kết thúc phiên, ghi phần còn lại qua `FlushHearts` trước khi đổi trạng thái (D13).
- **Tương thích (9.3):** backend khởi động bình thường khi MediaMTX không chạy. Mọi API khác không gọi MediaMTX.

## Chiến lược kiểm thử (Testing Strategy)

| Mức | Phạm vi |
|---|---|
| `unit` | `usecase/live`: kiểm tra đầu vào, giới hạn tim 10/s, giới hạn bình luận, tính khoảng giá hiệu lực, logic `SignalMonitor` (đồng hồ inject), gom `bursts`; `usecase/order`: gọi `LiveQuotaObserver`; `internal/config`: các khóa CONFIG-LIVE; adapter MediaMTX bằng `httptest` |
| `integration-db` | Migration tạo livestream; unique index một phiên live; view (hết suất, giá live ≥ giá thường, phiên ended); giỏ hàng trả giá hiệu lực; tạo đơn trừ suất, vượt suất rollback, hai giao dịch đồng thời không vượt suất; hủy đơn (khách, admin duyệt) hoàn suất chỉ khi phiên live; chi tiết sản phẩm trả `livePriceVnd`/`liveRemaining`; danh sách sản phẩm giữ giá thường |
| `handler` | Mọi endpoint API-LIVE-PUBLIC, API-LIVE-ADMIN, API-MEDIAMTX-AUTH (status, envelope, quyền, mã lỗi); WebSocket phòng bằng `httptest` + gorilla client (sự kiện, đếm người xem, giới hạn tim, đóng khi kết thúc). Ghi contract snapshot vào `.dream/specs/livestream-shopping/contract-snapshots.json` qua `assertOrRecordContractSnapshot` (danh sách key ở dưới) |
| `component` | Trang và thành phần live ở cả hai ứng dụng: trạng thái, xử lý lỗi, thời gian thực bằng `MockWebSocket`, `RTCPeerConnection`/`getUserMedia` giả |
| `mock-e2e` | Xem mục E2E dưới đây |
| `visual` | Bố cục dọc dưới 768px của trang xem (3.7) |

**E2E:**

- Chế độ thực thi là **`Mode 2: Shape-Locked Mock E2E`**.
- Suite `frontend/e2e/livestream-shopping.spec.ts` dùng `mountContractRoutes` nạp `.dream/specs/livestream-shopping/contract-snapshots.json`. WebSocket được giả lập bằng `page.routeWebSocket`. `RTCPeerConnection` được thay bằng script khởi tạo trả trạng thái "Đang chờ tín hiệu".
- Lệnh chạy từ `frontend/`: `npx playwright test e2e/livestream-shopping.spec.ts`.
- Báo cáo ghi vào `.dream/specs/livestream-shopping/report.md`; ảnh cho tiêu chí `visual` vào `.dream/specs/livestream-shopping/imgs/`.

**Contract snapshot** (`.dream/specs/livestream-shopping/contract-snapshots.json`; E2E Mode 2 đọc trực tiếp):

| Task | Key |
|---|---|
| 2.1 | `live_current_200`, `live_current_null_200`, `live_session_200`, `live_session_404`, `unauthenticated_401`, `admin_live_create_201`, `admin_live_current_200` |
| 2.3 | `live_comment_create_201`, `live_comment_rate_limited_429` |
| 2.2 | Frame WebSocket `ws_live_comment`, `ws_live_comment_hidden`, `ws_live_hearts`, `ws_live_viewers`, `ws_live_products`, `ws_live_signal`, `ws_live_ended` (cùng cách ghi `ws_notification_new` trong `post_handler_test.go`) |
| 3.1 | `product_detail_live_200` (`GET /products/:id` có `livePriceVnd`), `cart_live_200` (`GET /cart`), `cart_add_item_200` (`POST /cart/items`) |
| 3.2 | `order_create_live_quota_exceeded_409` |

**Smoke với MediaMTX thật:** các tiêu chí phụ thuộc mạng và thiết bị thật (1.2 quyền camera thật, 2.2, 2.4, 3.4 độ trễ, 3.5) không xác minh tất định được bằng test tự động. Logic giao diện của chúng có component test.

Bước smoke thuộc cổng kiểm chứng cuối (`verifying-feature-implementation`), không phải một leaf task:

1. `make mediamtx-up`.
2. Phát bằng Chrome với `--use-fake-device-for-media-stream` từ trang quản trị.
3. Xem trên trang cửa hàng.
4. Ghi kết quả (WHEP kết nối, HLS dự phòng, auth từ chối khi không có token) vào đầu ra của cổng kiểm chứng (mục Commands / Unverified Items).

Nếu môi trường không có Docker, ghi rõ bước này chưa chạy.

## Truy vết yêu cầu (Requirement Traceability)

| Yêu cầu | Thành phần thiết kế | Kiểm chứng |
|---|---|---|
| 1.1 | `LiveSetupForm`, `LiveProductPicker`, `LivePriceTable` | `component` |
| 1.2 | `LiveSetupForm` xử lý lỗi `getUserMedia` | `component` |
| 1.3 | `POST /admin/live/sessions`, `whip.ts` | `handler`, `component` |
| 1.4 | Kiểm tra `LiveProductInput` | `unit`, `handler` |
| 1.5 | Unique index, `ErrLivestreamAlreadyActive` | `integration-db`, `handler`, `component` |
| 1.6 | Nhóm route `admin` | `handler` |
| 1.7 | API-MEDIAMTX-AUTH (`publish` cần admin) | `handler` |
| 1.8 | `MediaServer.Ping`, 503, D4 | `unit`, `handler`, `component` |
| 2.1 | `LiveBroadcastPanel`, `LiveProductsManager`, WS-LIVE-ROOM | `component` |
| 2.2 | `whip.ts` `track.enabled` | `component` |
| 2.3 | `POST .../end`, `live:ended`, view theo `status` | `integration-db`, `handler`, `component` |
| 2.4 | `SignalMonitor` → `live:signal`, `overridePublisher`, D9, D10 | `unit`, `component` |
| 2.5 | `SignalMonitor` + `LIVE_SIGNAL_TIMEOUT` | `unit` |
| 2.6 | `summary`, `LiveSummaryCard` | `handler`, `component` |
| 3.1 | `GET /live/current`, `useCurrentLive`, `Header`, `LiveBanner` | `handler`, `component`, `mock-e2e` |
| 3.2 | `LivePage` chuyển hướng `?redirect=`, `AuthRequired`, auth `read` | `handler`, `mock-e2e` |
| 3.3 | `GET /live/sessions/:id`, `LivePage` | `handler`, `component` |
| 3.4 | WHEP + HLS dự phòng (D10), auth qua `query` cho HLS gốc | `component` (chọn đường phát), `handler` (auth `query`), smoke ở cổng kiểm chứng cuối (độ trễ) |
| 3.5 | `LivePlayer` nút "Bật âm thanh" | `component` |
| 3.6 | `LivePage` trạng thái ended/404 | `handler`, `component` |
| 3.7 | Bố cục `LivePage` | `visual` |
| 3.8 | Hub đếm `customer` khác nhau, `live:viewers`, `peak_viewers` | `handler`, `component` |
| 3.9 | `live:signal`, `LivePlayer` | `component` |
| 4.1 | `POST .../comments`, `live:comment` | `handler`, `component`, `mock-e2e` |
| 4.2 | Kiểm tra nội dung | `unit`, `handler` |
| 4.3 | `LastCommentAtByUser`, 429 | `unit`, `handler`, `component` |
| 4.4 | Snapshot 50 bình luận | `integration-db`, `handler` |
| 4.5 | Endpoint bình luận admin, nhãn "Chủ shop" | `handler`, `component` |
| 4.6 | `hide`, `live:comment_hidden` | `integration-db`, `handler`, `component` |
| 4.7 | `ErrLivestreamEnded` | `handler` |
| 5.1 | `HeartButton` hiệu ứng cục bộ | `component` |
| 5.2 | `live:heart` → `live:hearts` | `handler`, `component` |
| 5.3 | Giới hạn 10/s trong hub | `unit`, `handler` |
| 5.4 | `heartCount` trong snapshot | `handler` |
| 5.5 | Bỏ qua tim khi `ended` | `unit` |
| 6.1 | `LiveProduct`, `LiveCartSheet` | `handler`, `component`, `mock-e2e` |
| 6.2 | `LiveCartSheet` + `useCart().addItem`, `liveRemaining` | `component`, `mock-e2e` |
| 6.3 | Mã lỗi giỏ hàng hiện có | `component` |
| 6.4 | Link `target="_blank"` | `component` |
| 6.5 | `PUT .../products`, `live:products` | `integration-db`, `handler`, `component` |
| 6.6 | Lọc `products.active` khi dựng `LiveProduct` | `integration-db` |
| 6.7 | `live:products` sau đổi giá/suất/kết thúc | `handler`, `component` |
| 7.1 | `PUT .../pin`, `PinnedProductCard` | `handler`, `component` |
| 7.2 | "Mua ngay" mở `LiveCartSheet` | `component` |
| 7.3 | Bỏ ghim, xóa sản phẩm → `pinned_product_id = NULL` | `integration-db`, `component` |
| 7.4 | `pinnedProductId` trong snapshot | `handler`, `component` |
| 8.1 | Kiểm tra giá/suất | `unit`, `handler` |
| 8.2 | `PUT .../products` khi live, giữ `sold_quantity` | `integration-db`, `handler` |
| 8.3 | View + DB-PRICE-QUERIES, `ProductDetailPage`, `CartPage` | `integration-db`, `component` |
| 8.4 | Query danh sách không đổi | `integration-db` |
| 8.5 | `ConsumeLiveQuota`, `live_session_id` | `integration-db` |
| 8.6 | `LiveQuotaExceededError`, `CheckoutPage` | `integration-db`, `handler`, `component` |
| 8.7 | Điều kiện suất trong view, `live:products` | `integration-db`, `component` |
| 8.8 | View theo `status`, `product_changed` hiện có | `integration-db` |
| 8.9 | `RestoreLiveQuotaForOrder` trong `Cancel` và `AdminTransition` | `integration-db` |
| 8.10 | `order_items.unit_price_vnd` không đổi | `integration-db` |
| 9.1 | View rỗng khi không có phiên live | `integration-db` (bộ test giỏ hàng/đặt hàng hiện có vẫn qua) |
| 9.2 | Hub riêng, không chạm chat/notification | `handler` (test chat hiện có vẫn qua) |
| 9.3 | Không phụ thuộc MediaMTX khi khởi động | `unit` |
| 9.4 | Dashboard đọc `unit_price_vnd` | `integration-db` (test dashboard hiện có vẫn qua) |
| 10.1 | Không triển khai | — |

## Tích hợp hệ thống hiện có (Existing System Integration)

**Phụ thuộc hạ tầng và xác thực:**

- **Xác thực:** dùng `jwt.Manager.ParseAccessToken` và vai trò `domain.RoleAdmin`/`RoleCustomer` cho REST, WebSocket và auth MediaMTX. Không tạo cơ chế token mới.
- **Cấu hình:** thêm khóa vào `internal/config` theo mẫu hiện có. Không đọc biến môi trường ngoài ranh giới config.
- **Wire:** thêm provider vào `cmd/server/app.go`/`wire.go` cho:
  - repository, use case live, hub live, adapter MediaMTX, `SignalMonitor`;
  - tham số mới cho `provideGinRouter`;
  - observer quota truyền vào use case đơn hàng.
  
  Sau đó chạy `make wire`; không sửa tay `wire_gen.go`.
- **`App.Run`:** khởi chạy `SignalMonitor` và vòng ghi tim như ticker `AutoConfirmDue`. Khi tắt thì đóng hub live (ghi tim còn lại).

**Thay đổi luồng giá, đơn hàng và giao diện hiện có:**

- **Giỏ hàng:** `mapCartRow` dùng giá hiệu lực từ query. `AddVariant` không kiểm tra suất (suất chỉ trừ khi đặt hàng). Hành vi khi không có phiên live không đổi vì view rỗng (9.1).
- **Đặt hàng:**
  - Kiểm tra độ lệch giá hiện có giờ so với giá hiệu lực. Nhờ đó tự xử lý trường hợp phiên kết thúc hoặc hết suất giữa lúc thanh toán (8.8).
  - Thứ tự lỗi trong `Create`: tồn kho → `product_changed` → `live_quota_exceeded`. Bước trừ suất chạy sau kiểm tra độ lệch và trước `InsertOrder`.
- **Hủy đơn:** chỉ hai đường dẫn chuyển sang `cancelled` là `OrderRepository.Cancel` (từ `pending_confirmation`/`confirmed`) và `AdminTransition` với `approve_cancel`. Cả hai được thêm bước hoàn suất. Chuyển `cancel_requested` không hoàn suất.
- **Đổi trả và dashboard:** dùng `order_items.unit_price_vnd` đã ghi, không đổi (8.10, 9.4).
- **Chat và thông báo:** không chạm `delivery/ws` hiện có (9.2).
- **Chi tiết sản phẩm:** chỉ thêm trường mới. Kiểu `ProductVariant` ở frontend thêm `livePriceVnd?: string | null` và `liveRemaining?: number | null`.
- **Danh sách/nổi bật/quản trị sản phẩm:** không đổi (8.4).
- **Header, HomePage, CartPage, CheckoutPage, ProductDetailPage:** chỉ thêm nhánh hiển thị mới. Không có phiên live thì giao diện như cũ.
- **Phụ thuộc mới:** `hls.js` (frontend). Không thêm thư viện animation (keyframes CSS).
