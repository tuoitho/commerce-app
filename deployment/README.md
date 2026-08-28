# Hướng dẫn khởi chạy hạ tầng (Deployment / Local Infrastructure)

Thư mục này chứa cấu hình Docker Compose cho các dịch vụ hạ tầng phụ thuộc của hệ thống (PostgreSQL & MinIO Object Storage).

## 1. Dịch vụ bao gồm

| Dịch vụ | Container Name | Port ngoài | Mục đích |
|---|---|---|---|
| **PostgreSQL 16** | `commerce-postgres` | `5432` | Cơ sở dữ liệu chính của hệ thống |
| **MinIO API** | `commerce-minio` | `9000` | S3-compatible Object Storage lưu trữ media đánh giá sản phẩm |
| **MinIO Console** | `commerce-minio` | `9001` | Giao diện quản trị Web UI của MinIO (`minioadmin` / `minioadmin`) |
| **MinIO Init** | `commerce-minio-init` | - | Khởi tạo bucket `product-reviews` tự động |

## 2. Các lệnh sử dụng

### Khởi động hạ tầng
```bash
docker compose -f deployment/docker-compose.yml up -d
```

### Kiểm tra trạng thái containers
```bash
docker compose -f deployment/docker-compose.yml ps
```

### Xem logs
```bash
docker compose -f deployment/docker-compose.yml logs -f
```

### Dừng hạ tầng
```bash
docker compose -f deployment/docker-compose.yml down
```

### Dừng hạ tầng và xóa toàn bộ dữ liệu (volumes)
```bash
docker compose -f deployment/docker-compose.yml down -v
```

## 3. Sau khi khởi chạy hạ tầng

Sau khi các container chạy thành công, chạy các lệnh sau tại thư mục gốc của dự án:

1. **Áp dụng migrations vào cơ sở dữ liệu:**
   ```bash
   make db-up
   ```

2. **Khởi tạo dữ liệu mẫu (Seed Catalog):**
   ```bash
   make seed
   ```

3. **Khởi động Backend:**
   ```bash
   make backend
   ```

4. **Khởi động Frontend Khách hàng (`:5173`):**
   ```bash
   make frontend
   ```

5. **Khởi động Frontend Quản trị Admin (`:5174`):**
   ```bash
   make admin
   ```
