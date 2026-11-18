# Triển khai toàn trình bằng Docker Compose (`deployment/`)

Thư mục này đóng gói đầy đủ hạ tầng và ứng dụng của hệ thống thương mại điện tử:

- **PostgreSQL 16 (`postgres`):** cơ sở dữ liệu chính (`:5432`).
- **Migration & Seed tự động (`db-migrate`, `db-seed`):** tự động chạy toàn bộ SQL migrations, nạp sẵn 20 sản phẩm mẫu (khi bảng sản phẩm còn trống) và khởi tạo tài khoản khách hàng mẫu.
- **MinIO & Bucket Init (`minio`, `minio-init`):** lưu trữ đối tượng S3 (`:19000`, console `:19001`) kèm khởi tạo tự động 2 private bucket `product-review-media` và `chat-media`.
- **MediaMTX (`mediamtx`):** máy chủ phát trực tiếp WHIP/WHEP (`:8889`, `:8189/udp`) và LL-HLS (`:8888`) kết nối nội bộ với `backend`.
- **Backend API (`backend`):** Go API server (`:18080`), tự động khởi tạo tài khoản quản trị viên mẫu khi chạy lần đầu.
- **Storefront (`frontend`):** SPA khách hàng chạy trên Nginx (`:15173`), tích hợp reverse proxy `/api/` (gồm cả WebSocket) và `/media/` sang `backend`.
- **Admin (`frontend-admin`):** SPA quản trị chạy trên Nginx (`:15174`), tích hợp reverse proxy `/api/` (gồm cả WebSocket) và `/media/` sang `backend`.

## Khởi chạy nhanh trên máy bất kỳ

Từ thư mục gốc dự án (hoặc đứng trong `deployment/`):

```bash
cd deployment
# (Tùy chọn) tạo file .env riêng nếu muốn đổi port hoặc mật khẩu/secret:
# cp .env.example .env

docker compose up -d --build
```

Kiểm tra trạng thái các container:

```bash
docker compose ps
```

## Địa chỉ truy cập & Tài khoản khởi tạo sẵn

| Dịch vụ | URL mặc định | Tài khoản mẫu có sẵn ngay lần chạy đầu |
| --- | --- | --- |
| **Storefront (Khách hàng)** | `http://localhost:15173` | `customer@example.com` / `Customer123456@` |
| **Admin (Quản trị)** | `http://localhost:15174` | `admin@example.com` / `Admin123456@` |
| **Backend API** | `http://localhost:18080/api/v1/categories` | — |
| **MinIO Console** | `http://localhost:19001` | `minioadmin` / `miniopassword` |

> Dữ liệu danh mục & sản phẩm mẫu chỉ nạp khi cơ sở dữ liệu chưa có dữ liệu mẫu, đảm bảo các lần `docker compose restart` hoặc `docker compose up -d` sau đó giữ nguyên đơn hàng, tồn kho và chỉnh sửa của quản trị viên.

## Dừng hoặc làm sạch dữ liệu

```bash
# Dừng các container (giữ nguyên dữ liệu PostgreSQL & MinIO)
docker compose down

# Dừng và xóa toàn bộ volume dữ liệu để reset về trạng thái máy mới
docker compose down -v
```
