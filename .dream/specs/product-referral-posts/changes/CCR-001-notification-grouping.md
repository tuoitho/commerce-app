# CCR-001: Gom nhóm thông báo chưa đọc theo đối tượng tương tác (Unread Notification Rollup)

Status: APPLIED
Trigger: user request

## Change
Chuyển cơ chế lưu trữ và hiển thị thông báo tương tác bài viết/bình luận từ thông báo đơn lẻ sang **gom nhóm thông báo chưa đọc (Unread Notification Rollup)** theo khóa `(recipient_id, group_key)` khi `is_read = false`:

1. **Khóa gom nhóm (`group_key`):**
   - Bày tỏ cảm xúc trên bài viết: `post_reaction:<post_id>`
   - Bày tỏ cảm xúc trên bình luận: `comment_reaction:<comment_id>`
   - Bình luận mới trên bài viết: `post_comment:<post_id>`
   - Phản hồi trên nhánh bình luận: `comment_reply:<parent_comment_id>`
2. **Quy tắc Gộp & Cập nhật (Rollup Upsert):**
   - Khi phát sinh tương tác mới cùng `(recipient_id, group_key)` mà đã có bản ghi thông báo chưa đọc (`is_read = false`), hệ thống cập nhật trực tiếp vào bản ghi thông báo chưa đọc hiện có thay vì tạo dòng mới:
     - Cập nhật `actor_id` thành người tương tác mới nhất, `reaction_type` / `excerpt` theo tương tác mới nhất, `updated_at = now()`.
     - Cập nhật `actor_count` là tổng số người dùng duy nhất (`DISTINCT`) đã tương tác trong nhóm thông báo này và lưu danh sách tối đa 2 người tương tác gần nhất vào `metadata.recentActors` (`[{ id, name, role }]`).
   - Nếu thông báo trước đó của nhóm đã được đánh dấu đã đọc (`is_read = true`), tương tác mới sẽ tạo một bản ghi thông báo chưa đọc mới.
   - Khi người dùng gỡ cảm xúc (`reaction = null`), nếu thông báo chưa đọc của nhóm `post_reaction:<post_id>` hoặc `comment_reaction:<comment_id>` chỉ có duy nhất người đó tương tác thì xóa thông báo chưa đọc đó; nếu còn người khác thì cập nhật lại `actor_count`, `actor_id` và `metadata.recentActors` theo những người còn lại.
3. **Hiển thị & Đồng bộ WebSocket trên Giao diện (`frontend` & `frontend-admin`):**
   - Khi nhận sự kiện `notification:new` qua WebSocket: nếu trong danh sách đã có thông báo cùng `id`, thay thế nội dung thông báo đó và đưa lên đầu danh sách mà không cộng trùng `unreadCount` (chỉ tăng `unreadCount` khi thông báo là mới hoặc chuyển từ đã đọc sang chưa đọc).
   - Hiển thị nội dung thông báo tiếng Việt theo số lượng người tương tác (`actorCount` và `metadata.recentActors`):
     - `actorCount === 1`: **"{Actor 1}"** đã bày tỏ cảm xúc / bình luận / trả lời...
     - `actorCount === 2`: **"{Actor 1} và {Actor 2}"** đã bày tỏ cảm xúc / bình luận / trả lời...
     - `actorCount >= 3`: **"{Actor 1}, {Actor 2} và {actorCount - 2} người khác"** đã bày tỏ cảm xúc / bình luận / trả lời...

## Contracts
| Contract | Revision | Compatibility | Change |
|---|---|---|---|
| DB-POSTS | 1 → 2 | additive | Thêm migration `000018_add_notification_grouping` bổ sung cột `group_key`, `actor_count`, `updated_at` (có giá trị mặc định) và unique partial index `idx_notifications_unread_group` (`WHERE is_read = false AND group_key <> ''`) trên bảng `notifications` |
| TYPE-POST-DOMAIN | 1 → 2 | additive | Mở rộng `NotificationItem` thêm các trường tùy chọn `groupKey?: string`, `actorCount?: number`, `updatedAt?: string` và `metadata.recentActors?: NotificationActorSummary[]` |
| API-POSTS-PUBLIC | 1 → 2 | additive | Giữ nguyên cấu trúc HTTP request/response; cập nhật hiệu ứng phụ tạo/gộp/thu hồi thông báo chưa đọc khi bày tỏ cảm xúc hoặc bình luận |
| API-NOTIFICATIONS | 1 → 2 | semantic | `GET /api/v1/notifications` trả về danh sách thông báo đã gom nhóm sắp xếp theo `updated_at DESC, id DESC` kèm `actorCount`, `groupKey`, `updatedAt` và `metadata.recentActors` |
| WS-NOTIFICATIONS | 1 → 2 | semantic | Sự kiện `notification:new` phát bản ghi thông báo sau khi upsert; client hợp nhất theo `id` và đẩy lên đầu danh sách mà không tăng trùng `unreadCount` |

## Artifact Updates
- requirements.md: Cập nhật tiêu chí `6.1`, `6.2`, `6.3`, `6.5`, `6.6` để phản ánh cơ chế gom nhóm thông báo chưa đọc theo đối tượng tương tác và định dạng hiển thị `"A, B và X người khác"`.
- design.md: Cập nhật `Contract DB-POSTS (rev 2)`, `Contract TYPE-POST-DOMAIN (rev 2)`, `Contract API-POSTS-PUBLIC (rev 2)`, `Contract API-NOTIFICATIONS (rev 2)`, `Contract WS-NOTIFICATIONS (rev 2)` và bảng truy vết yêu cầu.
- tasks.md: Mở lại (reopen) các task `1.1`, `1.2`, `2.2`, `3.2`, `4.1`, `4.2`; nâng tham chiếu contract lên `@2` cho các task `2.1` và `3.1`.

## Impact
| Task | Role | Reference | Action |
|---|---|---|---|
| 1.1 | provider | DB-POSTS@1, TYPE-POST-DOMAIN@1 | reopen |
| 1.2 | consumer | DB-POSTS@1, TYPE-POST-DOMAIN@1 | reopen |
| 2.1 | consumer | DB-POSTS@1, TYPE-POST-DOMAIN@1 | bump to @2 |
| 2.2 | provider, consumer | API-POSTS-PUBLIC@1, API-NOTIFICATIONS@1, WS-NOTIFICATIONS@1, DB-POSTS@1, TYPE-POST-DOMAIN@1 | reopen |
| 3.1 | consumer | API-POSTS-PUBLIC@1, TYPE-POST-DOMAIN@1 | bump to @2 |
| 3.2 | consumer | API-POSTS-PUBLIC@1, API-NOTIFICATIONS@1, WS-NOTIFICATIONS@1, TYPE-POST-DOMAIN@1 | reopen |
| 4.1 | consumer | API-POSTS-PUBLIC@1, API-NOTIFICATIONS@1, WS-NOTIFICATIONS@1, TYPE-POST-DOMAIN@1 | reopen |
| 4.2 | verifier | API-POSTS-PUBLIC@1, API-NOTIFICATIONS@1, WS-NOTIFICATIONS@1, TYPE-POST-DOMAIN@1 | reopen |

## Migration And Release Notes
- Thêm migration mới `backend/db/migrations/000018_add_notification_grouping.up.sql` và `.down.sql` (không sửa migration `000017` đã áp dụng).
- Chạy `make db-up` và `make -C backend gen` khi thực thi lại Task 1.1.
