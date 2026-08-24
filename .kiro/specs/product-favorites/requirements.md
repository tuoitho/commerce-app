# Requirements Document

## Introduction

Xây dựng tính năng **sản phẩm yêu thích** cho storefront, giúp khách hàng lưu các sản phẩm quan tâm để xem lại sau. Danh sách yêu thích thuộc về từng tài khoản và được lưu bền vững qua các phiên đăng nhập. Người dùng có thể đánh dấu hoặc bỏ đánh dấu yêu thích từ các khu vực đang hiển thị sản phẩm, đồng thời quản lý danh sách tại một trang riêng.

Phạm vi gồm storefront và backend API. Tính năng không thay đổi quy trình quản trị sản phẩm, giỏ hàng, tồn kho hoặc đặt hàng; danh sách yêu thích lưu quan hệ với sản phẩm và hiển thị thông tin sản phẩm hiện hành. Sản phẩm bị xóa bằng cơ chế soft-delete hiện có vẫn được giữ trong danh sách của người dùng với trạng thái đã bị xóa.

## Requirements

### Requirement 1 — Truy cập tính năng yêu thích

**User Story:** Với vai trò khách hàng, tôi muốn truy cập tính năng yêu thích từ những nơi đang xem sản phẩm, để có thể lưu hoặc mở lại sản phẩm mà không phải tìm kiếm lại.

#### Acceptance Criteria

1.1. KHI một sản phẩm được hiển thị trên thẻ sản phẩm ở trang chủ hoặc trang danh mục, THÌ hệ thống PHẢI hiển thị một điều khiển cho phép người dùng đánh dấu hoặc bỏ đánh dấu sản phẩm đó khỏi danh sách yêu thích.

1.2. KHI người dùng mở trang chi tiết một sản phẩm, THÌ hệ thống PHẢI hiển thị một điều khiển cho phép đánh dấu hoặc bỏ đánh dấu sản phẩm đó khỏi danh sách yêu thích.

1.3. KHI người dùng đã đăng nhập, THÌ hệ thống PHẢI cung cấp lối điều hướng đến trang "Sản phẩm yêu thích" trên cả bố cục máy tính và thiết bị di động.

1.4. KHI người dùng chưa đăng nhập kích hoạt điều khiển yêu thích hoặc truy cập trực tiếp trang "Sản phẩm yêu thích", THÌ hệ thống PHẢI chuyển người dùng đến trang đăng nhập và quay lại đúng trang ban đầu sau khi đăng nhập thành công bằng cơ chế chuyển hướng hiện có.

1.5. KHI người dùng được chuyển đến đăng nhập theo tiêu chí 1.4, THÌ hệ thống KHÔNG ĐƯỢC thay đổi danh sách yêu thích cho đến khi người dùng đã đăng nhập và chủ động kích hoạt lại điều khiển yêu thích.

### Requirement 2 — Thêm và bỏ sản phẩm yêu thích

**User Story:** Với vai trò khách hàng đã đăng nhập, tôi muốn thêm hoặc bỏ một sản phẩm yêu thích, để danh sách phản ánh đúng những sản phẩm tôi đang quan tâm.

#### Acceptance Criteria

2.1. KHI người dùng đã đăng nhập đánh dấu một sản phẩm công khai đang hoạt động là yêu thích, THÌ hệ thống PHẢI lưu sản phẩm vào danh sách của người dùng, hiển thị trạng thái đã yêu thích và thông báo thành công bằng tiếng Việt.

2.2. KHI một sản phẩm đã có trong danh sách yêu thích của người dùng và hệ thống nhận lại thao tác thêm sản phẩm đó, THÌ hệ thống PHẢI giữ đúng một mục cho sản phẩm và trả về trạng thái đã yêu thích mà không tạo bản ghi trùng lặp.

2.3. KHI người dùng bỏ đánh dấu một sản phẩm đang được yêu thích, THÌ hệ thống PHẢI xóa quan hệ yêu thích, hiển thị trạng thái chưa yêu thích và thông báo thành công bằng tiếng Việt.

2.4. KHI người dùng xóa một sản phẩm ngay tại trang "Sản phẩm yêu thích", THÌ hệ thống PHẢI loại sản phẩm đó khỏi danh sách đang hiển thị sau khi thao tác thành công.

2.5. KHI sản phẩm không có trong danh sách và hệ thống nhận lại thao tác bỏ yêu thích sản phẩm đó, THÌ hệ thống PHẢI giữ sản phẩm ở trạng thái chưa yêu thích mà không tạo lỗi hoặc thay đổi mục khác.

2.6. KHI thao tác thêm hoặc bỏ yêu thích đang được xử lý, THÌ hệ thống PHẢI ngăn các lần kích hoạt lặp lại trên cùng điều khiển cho đến khi thao tác hoàn tất.

2.7. NẾU thao tác thêm hoặc bỏ yêu thích thất bại, THÌ hệ thống PHẢI giữ hoặc khôi phục trạng thái trước thao tác, hiển thị thông báo lỗi bằng tiếng Việt và cho phép người dùng thử lại.

2.8. KHI người dùng yêu cầu thêm một định danh sản phẩm sai định dạng, THÌ hệ thống KHÔNG ĐƯỢC tạo mục yêu thích và PHẢI trả về lỗi xác thực HTTP 400 với trường `productId`.

2.9. KHI sản phẩm chưa có trong danh sách yêu thích của người dùng và người dùng yêu cầu thêm sản phẩm không tồn tại hoặc không còn công khai, THÌ hệ thống KHÔNG ĐƯỢC tạo mục yêu thích và PHẢI trả về lỗi kinh doanh HTTP 404 với thông báo tiếng Việt.

### Requirement 3 — Xem danh sách sản phẩm yêu thích

**User Story:** Với vai trò khách hàng đã đăng nhập, tôi muốn xem các sản phẩm đã lưu tại một nơi, để nhanh chóng so sánh và mở lại sản phẩm quan tâm.

#### Acceptance Criteria

3.1. KHI người dùng mở trang "Sản phẩm yêu thích", THÌ hệ thống PHẢI hiển thị tất cả sản phẩm còn quan hệ yêu thích trong danh sách của chính người dùng, bao gồm sản phẩm đang hoạt động và sản phẩm đã ngừng hoạt động, theo thứ tự được thêm gần nhất trước.

3.2. KHI một sản phẩm yêu thích đang hoạt động được hiển thị, THÌ hệ thống PHẢI hiển thị tên, model, thương hiệu, danh mục, ảnh chính, khoảng giá VND hiện hành và trạng thái còn hàng hiện hành của sản phẩm.

3.3. KHI người dùng chọn một sản phẩm đang hoạt động trong danh sách yêu thích, THÌ hệ thống PHẢI chuyển đến trang chi tiết công khai của sản phẩm đó.

3.4. KHI một sản phẩm yêu thích đã bị xóa bằng cơ chế soft-delete hiện có, THÌ hệ thống PHẢI tiếp tục hiển thị tên, model, thương hiệu và ảnh hiện có của sản phẩm cùng ghi chú "Sản phẩm đã bị xóa".

3.5. KHI một sản phẩm yêu thích vẫn có trạng thái hoạt động nhưng không còn biến thể hoạt động, THÌ hệ thống PHẢI tiếp tục hiển thị tên, model, thương hiệu và ảnh hiện có của sản phẩm cùng ghi chú "Sản phẩm hiện không khả dụng".

3.6. KHI một sản phẩm yêu thích đã bị xóa hoặc hiện không khả dụng, THÌ hệ thống KHÔNG ĐƯỢC trình bày giá hoặc tồn kho của sản phẩm như thông tin có thể mua, KHÔNG ĐƯỢC chuyển người dùng đến trang chi tiết công khai không còn khả dụng và vẫn PHẢI cho phép người dùng bỏ yêu thích sản phẩm đó.

3.7. KHI người dùng không còn bất kỳ quan hệ yêu thích nào, THÌ hệ thống PHẢI hiển thị trạng thái rỗng bằng tiếng Việt kèm lối điều hướng đến danh mục sản phẩm.

3.8. KHI danh sách yêu thích đang được tải, THÌ hệ thống PHẢI hiển thị trạng thái đang tải thay vì trạng thái rỗng.

3.9. NẾU tải danh sách yêu thích thất bại, THÌ hệ thống PHẢI hiển thị thông báo lỗi bằng tiếng Việt và cung cấp hành động thử lại; hệ thống KHÔNG ĐƯỢC thể hiện lỗi tải dữ liệu như một danh sách rỗng hợp lệ.

### Requirement 4 — Đồng bộ với danh mục và vòng đời sản phẩm

**User Story:** Với vai trò khách hàng, tôi muốn trạng thái yêu thích và thông tin sản phẩm nhất quán trên toàn storefront, để không gặp dữ liệu cũ hoặc trạng thái mâu thuẫn.

#### Acceptance Criteria

4.1. KHI phiên người dùng đã được khôi phục, THÌ các thẻ sản phẩm và trang chi tiết PHẢI hiển thị đúng trạng thái yêu thích hiện hành của từng sản phẩm được hiển thị.

4.2. KHI người dùng thêm hoặc bỏ yêu thích thành công tại một khu vực, THÌ hệ thống PHẢI phản ánh trạng thái mới tại các khu vực khác trong cùng phiên mà không yêu cầu đăng xuất hoặc tải lại toàn bộ ứng dụng.

4.3. KHI người dùng chưa đăng nhập duyệt danh mục hoặc trang chi tiết sản phẩm, THÌ hệ thống PHẢI giữ nguyên khả năng xem sản phẩm công khai hiện có.

4.4. KHI một sản phẩm yêu thích vẫn công khai nhưng tạm hết hàng, THÌ hệ thống PHẢI tiếp tục hiển thị sản phẩm trong danh sách yêu thích với trạng thái "Hết hàng" hiện hành và không tự động bỏ yêu thích.

4.5. KHI một sản phẩm yêu thích bị soft-delete, THÌ hệ thống PHẢI giữ quan hệ yêu thích và hiển thị sản phẩm theo trạng thái đã bị xóa quy định tại tiêu chí 3.4 và 3.6; KHI sản phẩm vẫn hoạt động nhưng không còn biến thể hoạt động, THÌ hệ thống PHẢI giữ quan hệ yêu thích và hiển thị sản phẩm theo trạng thái không khả dụng quy định tại tiêu chí 3.5 và 3.6.

4.6. KHI quản trị viên ngừng hoạt động một sản phẩm đang được người dùng yêu thích, THÌ thao tác quản trị hiện có PHẢI tiếp tục thành công mà không bị quan hệ yêu thích ngăn cản và KHÔNG ĐƯỢC tự động xóa quan hệ yêu thích đó.

4.7. KHI thông tin của sản phẩm yêu thích thay đổi, THÌ lần tải tiếp theo của danh sách yêu thích PHẢI hiển thị tên, model, thương hiệu, danh mục và ảnh hiện hành; NẾU sản phẩm đang hoạt động, THÌ hệ thống PHẢI hiển thị thêm giá và trạng thái tồn kho hiện hành thay vì dữ liệu tại thời điểm thêm yêu thích.

### Requirement 5 — Sở hữu, bảo mật và lưu bền vững

**User Story:** Với vai trò khách hàng đã đăng nhập, tôi muốn danh sách yêu thích là dữ liệu riêng của tài khoản và còn nguyên khi quay lại, để có thể sử dụng an toàn trên nhiều phiên và thiết bị.

#### Acceptance Criteria

5.1. KHI người dùng thêm hoặc bỏ sản phẩm yêu thích thành công rồi đăng xuất và đăng nhập lại cùng tài khoản, THÌ hệ thống PHẢI khôi phục đúng danh sách đã lưu.

5.2. KHI người dùng đăng nhập cùng tài khoản trên một thiết bị hoặc trình duyệt khác, THÌ hệ thống PHẢI cung cấp cùng danh sách yêu thích đã lưu của tài khoản đó.

5.3. KHI người dùng xem hoặc thay đổi danh sách yêu thích, THÌ hệ thống CHỈ ĐƯỢC đọc hoặc thay đổi dữ liệu thuộc tài khoản đã được xác thực của người dùng đó.

5.4. KHI một người dùng thao tác với danh sách yêu thích, THÌ hệ thống KHÔNG ĐƯỢC tiết lộ sự tồn tại hoặc nội dung danh sách của người dùng khác.

5.5. KHI một yêu cầu API yêu thích không có thông tin xác thực hợp lệ, THÌ hệ thống PHẢI từ chối yêu cầu theo cơ chế xác thực hiện có và KHÔNG ĐƯỢC đọc hoặc thay đổi dữ liệu yêu thích.

5.6. KHI client thực hiện thao tác thêm hoặc bỏ yêu thích, THÌ định danh sản phẩm công khai đã có trong dữ liệu danh mục hoặc chi tiết sản phẩm PHẢI đủ để hoàn thành thao tác; client KHÔNG ĐƯỢC buộc phải biết một định danh quan hệ yêu thích nội bộ.

5.7. KHI người dùng đăng xuất, THÌ hệ thống PHẢI xóa trạng thái yêu thích cá nhân khỏi giao diện của phiên vừa kết thúc; dữ liệu đã lưu của tài khoản vẫn được giữ để khôi phục ở lần đăng nhập sau.

### Requirement 6 — Trạng thái giao diện và khả năng tiếp cận

**User Story:** Với vai trò khách hàng sử dụng nhiều loại thiết bị hoặc phương thức nhập liệu, tôi muốn thao tác yêu thích rõ ràng và tiếp cận được, để có thể sử dụng tính năng một cách tin cậy.

#### Acceptance Criteria

6.1. KHI điều khiển yêu thích được hiển thị, THÌ hệ thống PHẢI thể hiện rõ hai trạng thái "Đã yêu thích" và "Chưa yêu thích" bằng dấu hiệu không chỉ phụ thuộc vào màu sắc.

6.2. KHI người dùng sử dụng bàn phím, THÌ hệ thống PHẢI cho phép đưa tiêu điểm đến và kích hoạt mọi điều khiển thêm, bỏ hoặc thử tải lại danh sách yêu thích.

6.3. KHI công nghệ hỗ trợ đọc điều khiển yêu thích, THÌ hệ thống PHẢI cung cấp tên truy cập mô tả hành động hiện tại và trạng thái được bật hoặc tắt.

6.4. KHI điều khiển yêu thích nhận tiêu điểm bàn phím, THÌ hệ thống PHẢI hiển thị chỉ báo tiêu điểm rõ ràng.

6.5. KHI trang "Sản phẩm yêu thích" được hiển thị trên kích thước màn hình được storefront hỗ trợ, THÌ hệ thống PHẢI giữ nội dung, trạng thái và các hành động chính có thể đọc và thao tác mà không gây cuộn ngang ngoài ý muốn.

## Ràng buộc hợp đồng

- Mọi endpoint mới dưới `/api/v1` phải tuân theo Full Status Envelope hiện có; phản hồi thành công dùng HTTP 200 hoặc 201 và mang dữ liệu chính trực tiếp trong thuộc tính `data`.
- Mọi thông báo lỗi kinh doanh hiển thị cho người dùng phải bằng tiếng Việt.
- Các endpoint danh mục và chi tiết sản phẩm công khai hiện có phải tiếp tục hoạt động mà không yêu cầu xác thực.
