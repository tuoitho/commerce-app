# chat-media-api

Revision: 1
Status: FROZEN

Requirements:
- REQ-CHAT-02

Provider:
- backend

Consumers:
- frontend
- frontend-admin

Compatibility:
- none (first revision)

## 1. GET /media/chat/:mediaId

Tải xuống hoặc phát trực tuyến (streaming) tệp ảnh hoặc video đính kèm trong tin nhắn chat.

### Caller Context & Auth
- Truy cập bằng `mediaId` (UUID).
- Route nằm ngoài prefix `/api/v1` và trả về raw bytes (nhị phân), không bọc Full Status Envelope.

### Headers hỗ trợ
- `Range: bytes=start-end`: Hỗ trợ tua video và tải từng đoạn dữ liệu.
- `If-None-Match`: Hỗ trợ kiểm tra ETag để tận dụng browser cache.

### Success — HTTP 200 OK (Tải toàn bộ file hoặc ảnh)
- `Content-Type`: `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, hoặc `video/webm`.
- `Content-Length`: Kích thước tệp (bytes).
- `ETag`: Mã băm nhận diện tệp.
- `Cache-Control`: `public, max-age=0, must-revalidate` (hoặc thời lượng cache phù hợp).
- `Accept-Ranges`: `bytes`.
- Body: Dữ liệu nhị phân của tệp.

### Success — HTTP 206 Partial Content (Khi có header Range hợp lệ cho video)
- `Content-Range`: `bytes start-end/totalSize` (ví dụ: `bytes 0-1048575/10485760`).
- `Content-Length`: Độ dài đoạn byte trả về.
- `Content-Type`: `video/mp4` hoặc `video/webm`.
- Body: Dữ liệu nhị phân của đoạn byte yêu cầu.

### Failures
- **HTTP 404 Not Found**: `mediaId` không tồn tại trong cơ sở dữ liệu hoặc không tìm thấy object trong MinIO.
- **HTTP 416 Requested Range Not Satisfiable**: Đoạn byte yêu cầu vượt quá dung lượng tệp.
