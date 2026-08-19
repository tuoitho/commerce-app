# Implementation Plan

Dependency order và ranh giới file: backend tuần tự 1.1 → 1.2 → 2.1 → 2.2 → 2.3 → 3.1 → 3.2 → 3.3 → 3.4 (các task chạm chung db/queries/orders.sql, order_repository.go, Wire providers); frontend tuần tự 4.1 → 5.1 → 6.1 → 6.2 (chạm chung App.tsx, 	ypes.ts). Frontend tiêu thụ hợp đồng HTTP từ design.md (canonical contract), không chờ code backend. Mỗi task backend thêm provider phải chạy Wire regen.

- [x] 1. Nền tảng backend

- [x] 1.1 Schema & bindings sqlc
  - **Produces:** migration db/migrations/000009_order_placement.up.sql / .down.sql (bảng ddresses, orders, order_items theo Data Models trong design); cập nhật sqlc.yaml (override order_items.quantity → int64); các query + binding trong db/queries/addresses.sql, db/queries/orders.sql (ListAddressesByUser, GetAddressByID, CountAddressesByUser, InsertAddress, UpdateAddress, DeleteAddress, ClearDefaultAddresses, SetAddressDefault; LockSubmittedCartItems ariant_id = ANY() FOR UPDATE, DecrementVariantStock có guard stock_quantity >= , IncrementVariantStock, InsertOrder, InsertOrderItem, RemoveSelectedCartItems, GetOrderByID, ListOrdersByUser status = ANY(), CountOrdersByStatus GROUP BY, LockOrderForUpdate, SetOrderStatus, AutoConfirmDueOrders); binding sqlc mới.
  - **Scope:** chỉ schema, query và codegen. Không viết domain type, handler hay behavior. Các query tiền cast ::text (MoneyVND), quantity theo int64.
  - **Consumes:** design Data Models và danh sách query.
  - **Acceptance:** make gen không tạo diff drift; go build/go vet sạch; migration có up/down cân đối; mọi query mới có binding khớp sqlc.yaml; ràng buộc CHECK enum trạng thái + cod + money nguyên/không âm.
  - **Verification:** make gen, go build ./..., go vet ./..., review diff sqlc.
  - _Requirements: 2.1–2.2, 6.1–6.3, 9.1_

- [x] 1.2 Hợp đồng domain, lỗi và config
  - **Produces:** internal/domain/order.go (OrderStatus enum 8 trạng thái, Order, OrderItem, ShippingInfo, OrderLineInput, OrderStatusBucket, OrderFilter, OrderStats), internal/domain/address.go (Address, AddressInput), internal/domain/area.go (Province, Ward); interface OrderRepository, AddressRepository, AreaRepository; bổ sung internal/domain/errors.go (ProductChangedError{Products}, ErrCartEmpty, ErrAddressNotFound, ErrOrderNotFound, ErrOrderNotCancellable, ErrOrderNotCancelRequested); config Viper ORDER_CONFIRM_TIMEOUT (mặc định 30m) và SHIPPING_FEE_VND (mặc định "0", validate IsCanonical); Wire scaffold cho các giá trị config.
  - **Scope:** hợp đồng và enum; không cài behavior repo/usecase.
  - **Consumes:** design (enum, interface, bảng lỗi, config).
  - **Acceptance:** gói biên dịch; enum đủ 8 trạng thái; message lỗi kinh doanh tiếng Việt đúng bảng lỗi; ShippingFeeVND từ chối giá trị không hợp lệ; OrderConfirmTimeout parse đúng.
  - **Verification:** go build ./..., go vet ./..., test config parse/validate, test các error type.
  - _Requirements: 2.1, 6.1, 7.9–7.10, 8.1, 8.4, 9.1, 9.5, 10.2–10.4_

- [x] 2. Đơn vị hành chính & sổ địa chỉ

- [x] 2.1 Endpoint đơn vị hành chính (vertical slice)
  - **Produces:** dataset ackend/internal/area/data/admin_divisions.json (từ https://provinces.open-api.vn/api/v2, 34 tỉnh + phường/xã, go:embed); AreaRepository (ListProvinces, ListWards, Resolve); usecase internal/usecase/area; handler GET /provinces, GET /provinces/:code/wards; đăng ký route public; Wire; test tập trung.
  - **Scope:** toàn bộ slice đọc dataset tĩnh, không đụng DB; dùng cho validate địa chỉ sau này.
  - **Consumes:** 1.2 (domain area); dữ liệu nguồn provinces.open-api.vn/api/v2.
  - **Acceptance:** tỉnh hợp lệ trả đúng danh sách phường/xã theo envelope; mã tỉnh không tồn tại → 404 với message tiếng Việt; Resolve trả lỗi khi tỉnh/xã không khớp.
  - **Verification:** test usecase + handler.
  - _Requirements: 3.1–3.4, 2.3, 2.4_

- [x] 2.2 Endpoint sổ địa chỉ (vertical slice)
  - **Produces:** AddressRepository (dùng binding từ 1.1); usecase internal/usecase/address (tạo đầu tiên tự mặc định; SetDefault/đổi is_default trong Update chạy 1 tx dùng LockUser rồi xóa cờ cũ + set mới — mỗi user chỉ 1 mặc định kể cả khi gọi đồng thời; validate phone ^0\d{9,10}$ và tỉnh/xã qua AreaRepository.Resolve); handler GET /addresses, POST /addresses, PUT /addresses/:id, PATCH /addresses/:id/default, DELETE /addresses/:id; route auth; Wire; test tập trung.
  - **Scope:** CRUD + mặc định; không liên quan đơn hàng.
  - **Consumes:** 1.1 (binding), 1.2 (domain/errors), 2.1 (Resolve).
  - **Acceptance:** CRUD đúng contract; địa chỉ đầu tiên auto-default; mỗi user chỉ 1 mặc định; xóa mặc định không tự thăng cấp; phone/tỉnh/xã sai → 400 alidation_error kèm fields; truy cập địa chỉ của user khác → 404; lỗi kinh doanh tiếng Việt.
  - **Verification:** test usecase + handler.
  - _Requirements: 2.1–2.7, 4.3_

- [x] 2.3 Hợp đồng phí vận chuyển trong giỏ hàng
  - **Produces:** domain.Cart + cartResponse thêm shippingFeeVnd (additive); cart usecase nhận ShippingFeeVND từ config và gán lên cart trả về (repo giữ nguyên, không đưa config vào tầng DB).
  - **Scope:** mở rộng contract GET /cart; không đổi luồng giỏ hàng hiện có.
  - **Consumes:** 1.2 (config).
  - **Acceptance:** GET /cart trả shippingFeeVnd đúng giá trị cấu hình; payload giỏ hàng cũ không thay đổi ngoài trường thêm; test giỏ hàng cũ vẫn xanh.
  - **Verification:** test cart usecase/handler hiện có + test mới cho trường thêm.
  - _Requirements: 4.2, 4.3, 6.5_

- [x] 3. Engine đặt hàng

- [x] 3.1 Tạo đơn hàng (transaction + POST /orders)
  - **Produces:** OrderRepository.Create (1 tx: LockUser → LockSubmittedCartItems khóa dòng giỏ của các variant trong yêu cầu FOR UPDATE (bất kể selected) → ReconcileCart → RefreshCartSnapshots → phân loại từng dòng yêu cầu theo dòng đã khóa: không tồn tại → ProductChangedError; NOT active hoặc stock < quantity → ErrOutOfStock/ErrStockLimit; selected=false khi sản phẩm khả dụng → ProductChangedError; lệch tên/giá/số lượng → ProductChangedError → GetAddressByID snapshot → tính subtotal/total (MoneyVND, giá DB hiện tại, 	otal = subtotal + shippingFeeVND) → InsertOrder/InsertOrderItem → DecrementVariantStock từng dòng (guard, rollback nếu hết hàng) → RemoveSelectedCartItems (chỉ dòng selected) → commit, mọi lỗi rollback); usecase internal/usecase/order Create (validate UUID, lines rỗng → ErrCartEmpty); handler POST /orders → 201 Order; Wire; test tập trung.
  - **Scope:** tạo đơn + toàn vẹn transaction; phân loại đúng mã lỗi theo R5.2 (product_changed) và R5.6 (out_of_stock/stock_limit); chống bán quá dựa trên khóa FOR UPDATE + guard trừ kho (thiết kế đã duyệt).
  - **Consumes:** 1.1 (binding/lock queries), 1.2 (domain/errors), config ShippingFeeVND.
  - **Acceptance:** yêu cầu hợp lệ → 201 với shape Order (status pending_confirmation, cod, snapshot, số tiền) và dòng giỏ được chọn bị xóa; cạn kho tại thời điểm tạo (inactive hoặc stock < quantity) → out_of_stock/stock_limit (không phải product_changed); drift tên/giá/số lượng hoặc dòng không tồn tại → 409 product_changed kèm tên sản phẩm lệch; không có dòng chọn → cart_empty; địa chỉ không tồn tại/không thuộc user → 404; tồn kho trừ đúng một lần và xóa dòng giỏ xảy ra trong cùng transaction (fail → không có đơn/trừ kho nào).
  - **Verification:** test usecase (fake repo) cho validate/drift mapping, test handler; review transaction & guard qua make gen + go vet.
  - _Requirements: 5.1–5.6, 6.1–6.8, 4.4–4.6_

- [x] 3.2 Đọc đơn hàng: chi tiết, danh sách, thống kê
  - **Produces:** OrderRepository.GetByID (order + items + cancellableUntil khi pending_confirmation), ListByUser (bucket → mảng trạng thái, status = ANY), StatsByUser (CountOrdersByStatus → OrderStats theo bucket); usecase GetByID (owner → ErrOrderNotFound), List (validate bucket), Stats; handler GET /orders/:id, GET /orders?status, GET /orders/stats (đăng ký trước /:id); Wire; test tập trung.
  - **Scope:** đọc; không ghi trạng thái.
  - **Consumes:** 1.1, 1.2.
  - **Acceptance:** chi tiết trả đầy đủ projection (items + snapshot giao hàng + số tiền); cancellableUntil chỉ hiện khi pending_confirmation; đơn của user khác → 404 (không lộ tồn tại); lọc theo bucket khớp mapping (Chờ lấy hàng = confirmed + preparing + cancel_requested); thống kê 4 số đúng (pending / pickup / delivery / awaiting-review = delivered).
  - **Verification:** test usecase + handler.
  - _Requirements: 9.1–9.7, 10.2–10.4, 10.5_

- [x] 3.3 Hủy đơn & hoàn tác yêu cầu hủy
  - **Produces:** OrderRepository.Cancel (LockOrderForUpdate; pending_confirmation/confirmed → cancelled + cancelled_at + hoàn kho IncrementVariantStock từng dòng; preparing → cancel_requested không hoàn kho; cancel_requested → ErrOrderNotCancellable; shipped/delivered/cancelled/eturned → ErrOrderNotCancellable) và UndoCancelRequest (chỉ cancel_requested → preparing, khác → ErrOrderNotCancelRequested); usecase cancel/undo; handler POST /orders/:id/cancel, POST /orders/:id/cancel/undo; Wire; test tập trung.
  - **Scope:** chuyển tiếp trạng thái + hoàn kho; tuần tự hóa bằng khóa dòng order.
  - **Consumes:** 1.1, 1.2, 3.2 (tái dùng GetOrderByID).
  - **Acceptance:** chuyển tiếp đúng theo bảng trạng thái (hủy ngay hoàn kho; yêu cầu hủy không hoàn kho); hủy ở shipped/delivered/cancelled → order_not_cancellable; hủy lại ở cancel_requested → lỗi; hoàn tác chỉ từ cancel_requested → preparing, ngoài ra → order_not_cancel_request; đơn của user khác → 404; message tiếng Việt qua envelope.
  - **Verification:** test usecase (từng trạng thái) + handler.
  - _Requirements: 7.1–7.10, 9.5_

- [x] 3.4 Tự động xác nhận đơn
  - **Produces:** OrderRepository.AutoConfirmDue(cutoff) (dùng AutoConfirmDueOrders); usecase AutoConfirmDue; goroutine trong cmd/server (App.Run, tick 1 phút, ngưỡng 
ow - cfg.OrderConfirmTimeout); Wire config OrderConfirmTimeout; test tập trung.
  - **Scope:** tự xác nhận nền; goroutine chạy suốt vòng đời tiến trình (main dùng context.Background(), không có graceful shutdown).
  - **Consumes:** 1.1, 1.2.
  - **Acceptance:** đơn pending_confirmation cũ hơn timeout chuyển confirmed + confirmed_at; đơn trạng thái khác không bị chạm; goroutine khởi động cùng app và chạy định kỳ; ngưỡng lấy từ config.
  - **Verification:** test usecase (cutoff), review wiring App.Run.
  - _Requirements: 8.1–8.5_

- [x] 4. Nền tảng frontend

- [x] 4.1 Primitive shadcn, types & API modules
  - **Produces:** storefront thêm shadcn/ui dialog, select, label (theo chuẩn shadcn hiện có trong repo); src/api/types.ts thêm Address, Province, Ward, OrderStatus, Order, OrderItem, OrderStats, OrderStatusBucket và Cart.shippingFeeVnd; module API src/api/areas.ts, src/api/addresses.ts, src/api/orders.ts (typed client theo contract HTTP trong design, dùng request helper hiện có).
  - **Scope:** dùng chung cho mọi trang; không cài page.
  - **Consumes:** contract HTTP approved từ design; quy ước src/api hiện có.
  - **Acceptance:** modules build; hàm API map đúng path/payload; primitive render được.
  - **Verification:** 
pm run lint, 
pm test, 
pm run build.
  - _Requirements: (hỗ trợ) toàn bộ requirements frontend_

- [x] 5. Luồng checkout

- [x] 5.1 Trang checkout + cập nhật CartPage
  - **Produces:** src/pages/CheckoutPage.tsx (route /checkout trong App.tsx): xem trước từ dòng selected của giỏ hàng; chọn địa chỉ (mặc định được chọn sẵn) + quản lý địa chỉ ngay tại trang (tạo/sửa/xóa/đặt mặc định qua Dialog với Select tỉnh/phường-xã phụ thuộc tầng); hiển thị tạm tính + phí vận chuyển (cart.shippingFeeVnd) + tổng thanh toán; COD cố định; "Đặt hàng" → POST /orders (gửi ddressId + lines[] snapshot đang xem) → điều hướng /orders/:id; xử lý product_changed bằng Dialog "Sản phẩm X vừa được cập nhật" (nút **Tải lại** refetch giỏ+địa chỉ, **Thoát** về /cart); empty state khi không có dòng được chọn; loading/error qua ToastContext; CartPage: CTA → /checkout, dòng "Phí vận chuyển" hiển thị cart.shippingFeeVnd (0 → "Miễn phí"), bỏ modal placeholder; test tập trung.
  - **Scope:** trọn luồng checkout 1 luồng; gồm phần sửa nhỏ ở CartPage (downstream impact).
  - **Consumes:** 4.1; contract GET /cart, /addresses, /provinces, /provinces/:code/wards, POST /orders.
  - **Acceptance:** hiển thị đúng dòng selected + phí + tổng; đặt hàng gửi đúng payload snapshot và thành công → điều hướng chi tiết; nút "Đặt hàng" bị vô hiệu khi đang gửi (chống double-submit); product_changed → modal với Tải lại/Thoát đúng hành vi; out_of_stock/stock_limit → toast lỗi tiếng Việt từ server; CTA giỏ hàng đi /checkout và hiển thị phí cấu hình.
  - **Verification:** vitest component tests + 
pm run lint + 
pm run build.
  - _Requirements: 1.1–1.4, 2.1–2.7, 3.1–3.4, 4.1–4.6, 5.1–5.6, 6.1–6.3, 7.4_

- [x] 6. Trang đơn hàng

- [x] 6.1 Trang chi tiết đơn hàng
  - **Produces:** src/pages/OrderDetailPage.tsx (route /orders/:id): hiển thị đầy đủ thông tin đơn (items, snapshot giao hàng, số tiền, trạng thái); hành động theo trạng thái — pending_confirmation: nút "Hủy đơn" + đếm ngược cancellableUntil; confirmed: "Hủy đơn"; preparing: "Yêu cầu hủy"; cancel_requested: "Hoàn tác yêu cầu hủy" + dòng "chờ người bán xác nhận hủy"; trạng thái khác: không nút hủy; gọi POST /orders/:id/cancel / cancel/undo và refresh; test tập trung.
  - **Scope:** chi tiết + hành động theo trạng thái; không quản lý danh sách.
  - **Consumes:** 4.1; contract GET /orders/:id, POST /orders/:id/cancel, POST /orders/:id/cancel/undo.
  - **Acceptance:** mỗi trạng thái render đúng hành động; thao tác cancel/undo gọi endpoint và cập nhật UI; đếm ngược chỉ hiện khi pending_confirmation.
  - **Verification:** vitest tests + 
pm run lint + 
pm run build.
  - _Requirements: 7.1–7.8, 9.1–9.7_

- [x] 6.2 Trang lịch sử mua hàng + link header
  - **Produces:** src/pages/OrderHistoryPage.tsx (route /orders): tabs Tất cả / Chờ xác nhận / Chờ lấy hàng / Chờ giao hàng / Đã giao / Trả hàng / Đã hủy (mapping bucket từ contract GET /orders?status; Chờ lấy hàng = confirmed + preparing + cancel_requested); thống kê 4 số (chờ xác nhận, chờ lấy hàng, chờ giao hàng, chờ đánh giá) từ GET /orders/stats; card đơn liên kết /orders/:id; empty states; Header thêm link "Lịch sử mua hàng" khi đã đăng nhập; test tập trung.
  - **Scope:** danh sách + thống kê + entry point header.
  - **Consumes:** 4.1; contract GET /orders?status, GET /orders/stats.
  - **Acceptance:** tab hiển thị đúng bucket; thống kê hiển thị 4 số; điều hướng tới chi tiết hoạt động; link header chỉ hiện khi đăng nhập.
  - **Verification:** vitest tests + 
pm run lint + 
pm run build.
  - _Requirements: 10.1–10.6_
