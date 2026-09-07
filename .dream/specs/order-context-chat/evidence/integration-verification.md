# Integration Verification: order-context-chat

## Scope

- Feature: `order-context-chat`
- Baseline Contracts:
  - `customer-chat-api@1`
  - `admin-chat-api@1`
  - `chat-realtime-websocket@1`
  - `chat-media-api@1`
- Tasks Covered:
  - `BE-01`, `BE-02`, `BE-03`, `BE-04`, `BE-05`
  - `FE-01`, `FE-02`, `FE-03`, `FE-04`
  - `ADM-01`, `ADM-02`, `ADM-03`, `ADM-04`
  - `E2E-01`

## Verification Matrix

| Area / Boundary | Provider Check | Consumer Check | Integration Result | Evidence |
|---|---|---|---|---|
| PostgreSQL Persistence & Schema | Migration 000015 applied, sqlc queriers generated, FK constraints verified | Chat Repository unit/db tests | PASS | `chat_repository_test.go`, `chat_repository_db_test.go` |
| Customer REST API | `POST /chat/conversations`, `GET /chat/conversations`, `POST /chat/conversations/:id/messages`, `POST /chat/conversations/:id/read` | `frontend/src/api/chat.ts`, `ChatContext.tsx` | PASS | `chat_handler_test.go`, `chat.test.ts` |
| Admin REST API | `GET /admin/chat/conversations`, `POST /admin/chat/conversations/:id/messages`, `POST /admin/chat/conversations/:id/read` | `frontend-admin/src/api/chat.ts`, `AdminMessagesPage.tsx` | PASS | `admin_chat_handler_test.go`, `AdminMessagesPage.test.tsx` |
| Real-time WebSocket Hub | `/api/v1/chat/ws`, JWT handshake, mutex-synchronized client registry, broadcast on REST send | `useChatSocket.ts` (customer) & `useAdminChatSocket.ts` (admin) | PASS | `ws_handler_test.go` |
| Multimedia & Streaming Proxy | Magic-byte MIME detection, 10MB image, 50MB video, byte-range HTTP 206, ETag | Image thumbnails & video players on customer widget & admin panel | PASS | `chat_media_test.go`, `ChatWidget.test.tsx`, `AdminMessagesPage.test.tsx` |
| Storefront Order Context Trigger | Order ownership validation in UseCase | "Hỏi về đơn hàng này" on `OrderDetailPage.tsx` opens chat dialog | PASS | `OrderDetailPage.test.tsx` |
| Admin Order Context Trigger | Order detail projection in conversation view | "Xem tin nhắn hỗ trợ" on `AdminOrderDetailPage.tsx` navigates to `/messages?orderId=:id` | PASS | `AdminOrderDetailPage.test.tsx` |
| Production Builds | `backend gen` (sqlc + Wire DI) | `frontend` & `frontend-admin` Vite production bundles | PASS | `make build` |

## Findings
No breaking discrepancies or unfulfilled contract invariants found.
