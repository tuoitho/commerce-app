# Feature Verification: order-context-chat

**Status:** Verified  
**Contract Baseline:** Revision 2 (FROZEN)  
**Verification Date:** 2026-09-07  

## Requirement Traceability Matrix (RTM)

| Requirement | Acceptance Criteria | Implementation | Tests / Evidence | Result |
|---|---|---|---|---|
| REQ-CHAT-01 | AC-CHAT-01-01 (Single Conversation with Order Attachment) | `backend/internal/repository/chat_repository.go`, `frontend/src/context/ChatContext.tsx`, `frontend/src/pages/OrderDetailPage.tsx` | `tests/e2e/order_context_chat.spec.ts`, `frontend/src/pages/OrderDetailPage.test.tsx`, `frontend/src/components/chat/ChatWidget.test.tsx` | PASS |
| REQ-CHAT-01 | AC-CHAT-01-02 (Order Card in Message Timeline) | `frontend/src/components/chat/OrderMessageCard.tsx`, `backend/internal/delivery/http/chat_handler.go` | `frontend/src/components/chat/OrderMessageCard.test.tsx`, `backend/internal/delivery/http/chat_handler_test.go` | PASS |
| REQ-CHAT-01 | AC-CHAT-01-03 (Ownership Validation & Error) | `backend/internal/usecase/chat/usecase.go:60-75` | `backend/internal/delivery/http/chat_handler_test.go:TestCustomerChat_Endpoints` | PASS |
| REQ-CHAT-02 | AC-CHAT-02-01 (Text Message & Role Attribution) | `backend/internal/delivery/http/chat_handler.go`, `frontend/src/components/chat/ChatMessageList.tsx` | `frontend/src/components/chat/ChatMessageList.test.tsx`, `backend/internal/delivery/http/chat_handler_test.go` | PASS |
| REQ-CHAT-02 | AC-CHAT-02-02 (Clipboard Paste & Preview) | `frontend/src/components/chat/ChatWidget.tsx:39-65`, `frontend-admin/src/pages/chat/AdminChatView.tsx:100-115` | `frontend/src/components/chat/ChatWidget.test.tsx`, `frontend-admin/src/pages/chat/AdminChatView.test.tsx` | PASS |
| REQ-CHAT-02 | AC-CHAT-02-03 (Media Rendering & Streaming) | `backend/internal/delivery/http/media_handler.go`, `backend/internal/usecase/chat/mime.go` | `backend/internal/delivery/http/chat_media_test.go:TestChatMedia_StreamingProxy` | PASS |
| REQ-CHAT-02 | AC-CHAT-02-04 (File Validation & Vietnamese Error) | `backend/internal/usecase/chat/mime.go` | `backend/internal/delivery/http/chat_handler_test.go` | PASS |
| REQ-CHAT-03 | AC-CHAT-03-01 (Initial Load 20 Messages) | `frontend/src/components/chat/ChatMessageList.tsx`, `backend/internal/repository/chat_repository.go` | `frontend/src/components/chat/ChatMessageList.test.tsx`, `backend/internal/repository/chat_repository_db_test.go` | PASS |
| REQ-CHAT-03 | AC-CHAT-03-02 (Reverse Scroll Offset Preservation) | `frontend/src/components/chat/ChatMessageList.tsx`, `frontend-admin/src/pages/chat/AdminChatView.tsx` | `frontend/src/components/chat/ChatMessageList.test.tsx`, `frontend-admin/src/pages/chat/AdminChatView.test.tsx` | PASS |
| REQ-CHAT-03 | AC-CHAT-03-03 (Smart "Có X tin mới" Indicator) | `frontend/src/components/chat/ChatMessageList.tsx`, `frontend-admin/src/pages/chat/AdminChatView.tsx` | `frontend/src/components/chat/ChatMessageList.test.tsx`, `frontend-admin/src/pages/chat/AdminChatView.test.tsx`, `tests/e2e/order_context_chat.spec.ts` | PASS |
| REQ-CHAT-03 | AC-CHAT-03-04 (Jump to Bottom on Pill Click) | `frontend/src/components/chat/ChatMessageList.tsx`, `frontend-admin/src/pages/chat/AdminChatView.tsx` | `frontend/src/components/chat/ChatMessageList.test.tsx`, `frontend-admin/src/pages/chat/AdminChatView.test.tsx`, `tests/e2e/order_context_chat.spec.ts` | PASS |
| REQ-CHAT-03 | AC-CHAT-03-05 (Auto-scroll When Near Bottom) | `frontend/src/components/chat/ChatMessageList.tsx`, `frontend-admin/src/pages/chat/AdminChatView.tsx` | `frontend/src/components/chat/ChatMessageList.test.tsx`, `tests/e2e/order_context_chat.spec.ts` | PASS |
| REQ-CHAT-04 | AC-CHAT-04-01 (Customer List with Unread Badge) | `frontend-admin/src/pages/chat/AdminConversationList.tsx`, `backend/internal/delivery/http/admin_chat_handler.go` | `frontend-admin/src/pages/chat/AdminConversationList.test.tsx`, `backend/internal/delivery/http/admin_chat_handler_test.go` | PASS |
| REQ-CHAT-04 | AC-CHAT-04-02 (Order Detail Navigation from Chat & Detail) | `frontend-admin/src/pages/chat/OrderMessageCard.tsx`, `frontend-admin/src/pages/AdminOrderDetailPage.tsx` | `frontend-admin/src/pages/orders/AdminOrderDetailChatButton.test.tsx`, `frontend-admin/src/pages/chat/AdminChatView.test.tsx` | PASS |
| REQ-CHAT-04 | AC-CHAT-04-03 (Admin Real-time Reply) | `frontend-admin/src/pages/chat/AdminChatView.tsx`, `backend/internal/delivery/http/wshub.go` | `frontend-admin/src/pages/chat/AdminChatView.test.tsx`, `backend/internal/delivery/http/ws_handler_test.go` | PASS |
| REQ-CHAT-05 | AC-CHAT-05-01 (Floating Chat Bubble & Unread Badge) | `frontend/src/components/chat/ChatWidget.tsx` | `frontend/src/components/chat/ChatWidget.test.tsx` | PASS |
| REQ-CHAT-05 | AC-CHAT-05-02 (Open Direct Single Conv & Auto Read) | `frontend/src/components/chat/ChatWidget.tsx`, `frontend/src/context/ChatContext.tsx` | `frontend/src/components/chat/ChatWidget.test.tsx` | PASS |
| REQ-CHAT-05 | AC-CHAT-05-03 (Authorization Boundary) | `backend/internal/delivery/http/chat_handler.go` | `backend/internal/delivery/http/chat_handler_test.go` | PASS |
| REQ-CHAT-06 | AC-CHAT-06-01 (Admin Views Customer Online Presence) | `frontend-admin/src/pages/chat/AdminConversationList.tsx`, `backend/internal/domain/chat.go` | `frontend-admin/src/pages/chat/AdminConversationList.test.tsx`, `backend/internal/domain/chat_test.go` | PASS |
| REQ-CHAT-06 | AC-CHAT-06-02 (Offline / Relative Time Formatting) | `frontend-admin/src/pages/chat/AdminConversationList.tsx`, `backend/internal/domain/chat.go` | `frontend-admin/src/pages/chat/AdminConversationList.test.tsx` | PASS |
| REQ-CHAT-06 | AC-CHAT-06-03 (Customer Views Admin Presence) | `frontend/src/components/chat/ChatWidget.tsx`, `backend/internal/delivery/http/ws_handler.go` | `frontend/src/components/chat/ChatWidget.test.tsx`, `backend/internal/delivery/http/ws_handler_test.go` | PASS |

## Verification Commands & Artifacts
- Backend:
  - `make -C backend test` (PASS - all packages)
- Frontend:
  - `npm --prefix frontend test` (PASS - 36 test files, 214 tests)
  - `npm --prefix frontend run build` (PASS)
- Frontend Admin:
  - `npm --prefix frontend-admin test` (PASS - 29 test files, 210 tests)
  - `npm --prefix frontend-admin run build` (PASS)
- E2E Integration:
  - `tests/e2e/order_context_chat.spec.ts` (PASS - 5 scenarios)
- Root:
  - `make test` (PASS)
  - `make build` (PASS)
