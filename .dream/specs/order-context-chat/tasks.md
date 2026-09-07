# Order Context Support Chat Workstream Tasks

## Contract baseline

| Contract | Revision | Status |
|---|---:|---|
| customer-chat-api | 2 | FROZEN |
| admin-chat-api | 2 | FROZEN |
| chat-realtime-websocket | 2 | FROZEN |
| chat-media-api | 1 | FROZEN |

---

## Workstream: backend-chat

### BE-01 — Database migration and queries for single customer conversation, order attachment messages, and reverse pagination
```yaml
id: BE-01
owner: backend-chat
outcome: Create migration to enforce single conversation per user (UNIQUE user_id on chat_conversations), add message_type and order_id columns to chat_messages, and implement sqlc/repository queries for get-or-create single conversation, reverse message pagination (ORDER BY created_at DESC with before cursor), and order snapshot query
requirements:
  - REQ-CHAT-01
  - REQ-CHAT-02
  - REQ-CHAT-03
  - REQ-CHAT-04
  - REQ-CHAT-05
  - REQ-CHAT-06
acceptance_criteria:
  - AC-CHAT-01-01
  - AC-CHAT-01-02
  - AC-CHAT-01-03
  - AC-CHAT-03-01
  - AC-CHAT-03-02
contracts: []
depends_on: []
risk: high
verification:
  - type: integration-db
    scope: backend/internal/repository/chat_repository_test.go
status: completed
verified_against: {}
```
**Architectural constraints:**
- Migration alters/creates `chat_conversations` with `CONSTRAINT chat_conversations_user_id_unique UNIQUE (user_id)`.
- `chat_messages` contains `message_type text NOT NULL DEFAULT 'text'`, and `order_id uuid NULL REFERENCES orders(id) ON DELETE SET NULL`.
- Reverse pagination query fetches older messages before a specific timestamp or ID, limited to X messages, ordered by `created_at ASC` in output.

---

### BE-02 — Media streaming adapter and chat domain logic
```yaml
id: BE-02
owner: backend-chat
outcome: Implement domain logic, validation for messages/media (magic bytes, max 5 files, size limit 10MB image / 50MB video), MinIO storage handling, and GET /media/chat/:mediaId streaming proxy route with byte-range and ETag support
requirements:
  - REQ-CHAT-02
acceptance_criteria:
  - AC-CHAT-02-03
  - AC-CHAT-02-04
contracts:
  - id: chat-media-api
    revision: 1
    role: provider
depends_on:
  - BE-01
risk: normal
verification:
  - type: unit
    scope: backend/internal/domain/chat_test.go
  - type: provider-contract
    scenario: GET /media/chat/:mediaId byte-range and mime check
  - type: runtime-http
    scope: backend/internal/delivery/http/media_handler_test.go
status: completed
verified_against:
  chat-media-api: 1
```

---

### BE-03 — Customer chat REST endpoints
```yaml
id: BE-03
owner: backend-chat
outcome: Expose GET /api/v1/chat/conversation (get or create 1-to-1 conversation), GET /api/v1/chat/conversations/:id/messages (reverse pagination with limit & before cursor, returning hasMore), POST /api/v1/chat/conversations/:id/messages (supporting text, media, and orderId attachment), POST /api/v1/chat/conversations/:id/read, and GET /api/v1/chat/unread-count adhering to Full Status Envelope
requirements:
  - REQ-CHAT-01
  - REQ-CHAT-02
  - REQ-CHAT-03
  - REQ-CHAT-05
  - REQ-CHAT-06
acceptance_criteria:
  - AC-CHAT-01-01
  - AC-CHAT-01-02
  - AC-CHAT-01-03
  - AC-CHAT-02-01
  - AC-CHAT-02-02
  - AC-CHAT-03-01
  - AC-CHAT-03-02
  - AC-CHAT-05-02
contracts:
  - id: customer-chat-api
    revision: 2
    role: provider
depends_on:
  - BE-01
  - BE-02
risk: high
verification:
  - type: provider-contract
    scenario: customer-chat-api rev 2 endpoints
  - type: runtime-http
    scope: backend/internal/delivery/http/chat_handler_test.go
status: completed
verified_against:
  customer-chat-api: 2
```

---

### BE-04 — Admin chat REST endpoints
```yaml
id: BE-04
owner: backend-chat
outcome: Expose GET /api/v1/admin/chat/conversations (customer-based conversation list with unread count), GET /api/v1/admin/chat/conversations/:id/messages (reverse pagination), POST /api/v1/admin/chat/conversations/:id/messages, and POST /api/v1/admin/chat/conversations/:id/read
requirements:
  - REQ-CHAT-02
  - REQ-CHAT-03
  - REQ-CHAT-04
  - REQ-CHAT-06
acceptance_criteria:
  - AC-CHAT-03-01
  - AC-CHAT-03-02
  - AC-CHAT-04-01
  - AC-CHAT-04-02
  - AC-CHAT-04-03
contracts:
  - id: admin-chat-api
    revision: 2
    role: provider
depends_on:
  - BE-01
  - BE-02
risk: normal
verification:
  - type: provider-contract
    scenario: admin-chat-api rev 2 endpoints
  - type: runtime-http
    scope: backend/internal/delivery/http/admin_chat_handler_test.go
status: completed
verified_against:
  admin-chat-api: 2
```

---

### BE-05 — Realtime WebSocket Hub and order attachment message broadcast
```yaml
id: BE-05
owner: backend-chat
outcome: Upgrade GET /api/v1/chat/ws, manage connection lifecycle with presence tracking, handle actions (join_conversation, send_message with optional orderId, mark_read, ping), and broadcast new_message with full orderSummary snapshot, read_receipt, presence_update, and pong
requirements:
  - REQ-CHAT-01
  - REQ-CHAT-02
  - REQ-CHAT-03
  - REQ-CHAT-04
  - REQ-CHAT-05
  - REQ-CHAT-06
acceptance_criteria:
  - AC-CHAT-01-02
  - AC-CHAT-02-01
  - AC-CHAT-03-03
  - AC-CHAT-03-05
  - AC-CHAT-04-01
  - AC-CHAT-04-03
  - AC-CHAT-06-01
  - AC-CHAT-06-03
contracts:
  - id: chat-realtime-websocket
    revision: 2
    role: provider
depends_on:
  - BE-01
  - BE-03
risk: high
verification:
  - type: contract
    scenario: chat-realtime-websocket rev 2 events and actions
  - type: runtime-http
    scope: backend/internal/delivery/http/ws_handler_test.go
status: completed
verified_against:
  chat-realtime-websocket: 2
```

---

## Workstream: frontend-chat

### FE-01 — Customer chat API client and WebSocket hook update
```yaml
id: FE-01
owner: frontend-chat
outcome: Update frontend/src/api/chat.ts to consume customer-chat-api rev 2 (getOrCreateConversation, fetchMessages with limit & before cursor returning hasMore, sendMessage with orderId), and update useChatSocket hook to handle order attachment message broadcasts
requirements:
  - REQ-CHAT-01
  - REQ-CHAT-02
  - REQ-CHAT-03
  - REQ-CHAT-05
acceptance_criteria:
  - AC-CHAT-01-01
  - AC-CHAT-02-01
  - AC-CHAT-03-01
contracts:
  - id: customer-chat-api
    revision: 2
    role: consumer
  - id: chat-realtime-websocket
    revision: 2
    role: consumer
depends_on: []
risk: normal
verification:
  - type: unit
    scope: frontend/src/api/chat.test.ts
status: completed
verified_against:
  customer-chat-api: 2
  chat-realtime-websocket: 2
```

---

### FE-02 — Reverse infinite scroll and jump-to-bottom new message indicator
```yaml
id: FE-02
owner: frontend-chat
outcome: Implement reverse infinite scroll in chat message list (load initial 20 messages, fetch older messages on scroll-to-top while preserving exact scroll position), and smart new message notification indicator (when scrolled away from bottom, display 'Có X tin mới' floating button that smoothly scrolls to bottom when clicked, auto-hiding when scrolled to bottom)
requirements:
  - REQ-CHAT-03
acceptance_criteria:
  - AC-CHAT-03-01
  - AC-CHAT-03-02
  - AC-CHAT-03-03
  - AC-CHAT-03-04
  - AC-CHAT-03-05
contracts:
  - id: customer-chat-api
    revision: 2
    role: consumer
  - id: chat-realtime-websocket
    revision: 2
    role: consumer
depends_on:
  - FE-01
risk: high
verification:
  - type: component
    scope: frontend/src/components/chat/ChatMessageList.test.tsx
status: completed
verified_against:
  customer-chat-api: 2
  chat-realtime-websocket: 2
```

---

### FE-03 — Order context attachment and OrderMessageCard component
```yaml
id: FE-03
owner: frontend-chat
outcome: Implement OrderMessageCard component inside the chat timeline, add 'Đính kèm đơn hàng' button and selector modal to the chat input area, and integrate 'Hỏi về đơn hàng này' button from OrderDetailPage (/orders/:id) to open the single chat conversation with the order attached as a message
requirements:
  - REQ-CHAT-01
acceptance_criteria:
  - AC-CHAT-01-01
  - AC-CHAT-01-02
  - AC-CHAT-01-03
contracts:
  - id: customer-chat-api
    revision: 2
    role: consumer
depends_on:
  - FE-01
risk: normal
verification:
  - type: component
    scope: frontend/src/components/chat/OrderMessageCard.test.tsx
status: completed
verified_against:
  customer-chat-api: 2
```

---

### FE-04 — Single customer conversation floating widget and presence header
```yaml
id: FE-04
owner: frontend-chat
outcome: Refactor Floating Chat Widget to open directly into the single customer conversation, auto mark-as-read on open, display unread badge counter, and display admin presence status in header
requirements:
  - REQ-CHAT-01
  - REQ-CHAT-05
  - REQ-CHAT-06
acceptance_criteria:
  - AC-CHAT-04-01
  - AC-CHAT-05-01
  - AC-CHAT-05-02
  - AC-CHAT-06-03
contracts:
  - id: customer-chat-api
    revision: 2
    role: consumer
  - id: chat-realtime-websocket
    revision: 2
    role: consumer
depends_on:
  - FE-02
  - FE-03
risk: normal
verification:
  - type: component
    scope: frontend/src/components/chat/ChatWidget.test.tsx
status: completed
verified_against:
  customer-chat-api: 2
  chat-realtime-websocket: 2
```

---

## Workstream: admin-chat

### ADM-01 — Admin chat API client and WebSocket hook update
```yaml
id: ADM-01
owner: admin-chat
outcome: Update frontend-admin/src/api/chat.ts to consume admin-chat-api rev 2 (customer-based conversation list, reverse pagination messages, order attachment send), and update admin WebSocket client
requirements:
  - REQ-CHAT-02
  - REQ-CHAT-03
  - REQ-CHAT-04
acceptance_criteria:
  - AC-CHAT-04-01
contracts:
  - id: admin-chat-api
    revision: 2
    role: consumer
  - id: chat-realtime-websocket
    revision: 2
    role: consumer
depends_on: []
risk: normal
verification:
  - type: unit
    scope: frontend-admin/src/api/chat.test.ts
status: completed
verified_against:
  admin-chat-api: 2
  chat-realtime-websocket: 2
```

---

### ADM-02 — Admin conversation list by customer
```yaml
id: ADM-02
owner: admin-chat
outcome: Implement customer-centric conversation list in /admin/messages with unread badge, last message snippet, and customer online presence indicator
requirements:
  - REQ-CHAT-04
  - REQ-CHAT-06
acceptance_criteria:
  - AC-CHAT-04-01
  - AC-CHAT-06-01
  - AC-CHAT-06-02
contracts:
  - id: admin-chat-api
    revision: 2
    role: consumer
depends_on:
  - ADM-01
risk: normal
verification:
  - type: component
    scope: frontend-admin/src/pages/chat/AdminConversationList.test.tsx
status: completed
verified_against:
  admin-chat-api: 2
```

---

### ADM-03 — Admin reverse infinite scroll, jump-to-bottom indicator, and OrderMessageCard
```yaml
id: ADM-03
owner: admin-chat
outcome: Implement reverse infinite scroll in admin chat panel, smart 'Có X tin mới' jump-to-bottom indicator, and render OrderMessageCard with quick link to /admin/orders/:id
requirements:
  - REQ-CHAT-03
  - REQ-CHAT-04
acceptance_criteria:
  - AC-CHAT-03-01
  - AC-CHAT-03-02
  - AC-CHAT-03-03
  - AC-CHAT-03-04
  - AC-CHAT-04-02
  - AC-CHAT-04-03
contracts:
  - id: admin-chat-api
    revision: 2
    role: consumer
  - id: chat-realtime-websocket
    revision: 2
    role: consumer
depends_on:
  - ADM-01
risk: normal
verification:
  - type: component
    scope: frontend-admin/src/pages/chat/AdminChatView.test.tsx
status: completed
verified_against:
  admin-chat-api: 2
  chat-realtime-websocket: 2
```

---

### ADM-04 — Admin quick chat transition from Order Detail
```yaml
id: ADM-04
owner: admin-chat
outcome: In AdminOrderDetailPage (/admin/orders/:id), provide 'Nhắn tin cho khách hàng' button that navigates to the customer's single conversation with the current order pre-attached
requirements:
  - REQ-CHAT-04
acceptance_criteria:
  - AC-CHAT-04-02
contracts:
  - id: admin-chat-api
    revision: 2
    role: consumer
depends_on:
  - ADM-02
  - ADM-03
risk: normal
verification:
  - type: component
    scope: frontend-admin/src/pages/orders/AdminOrderDetailChatButton.test.tsx
status: completed
verified_against:
  admin-chat-api: 2
```

---

## Workstream: integration-chat

### E2E-01 — End-to-end integration for single conversation, order attachment message, and reverse scroll
```yaml
id: E2E-01
owner: integration-chat
outcome: Verify full integration flow: customer attaches order from order detail, order message appears in the single conversation timeline, admin sees the conversation and responds in realtime, customer scrolls up to load older messages, customer receives new message while reading old messages and sees 'Có X tin mới' indicator, clicking jumps smoothly to bottom
requirements:
  - REQ-CHAT-01
  - REQ-CHAT-02
  - REQ-CHAT-03
  - REQ-CHAT-04
  - REQ-CHAT-05
  - REQ-CHAT-06
acceptance_criteria:
  - AC-CHAT-01-01
  - AC-CHAT-01-02
  - AC-CHAT-02-01
  - AC-CHAT-03-01
  - AC-CHAT-03-02
  - AC-CHAT-03-03
  - AC-CHAT-03-04
  - AC-CHAT-04-01
  - AC-CHAT-04-02
  - AC-CHAT-05-01
  - AC-CHAT-05-02
contracts:
  - id: customer-chat-api
    revision: 2
    role: verifier
  - id: admin-chat-api
    revision: 2
    role: verifier
  - id: chat-realtime-websocket
    revision: 2
    role: verifier
depends_on:
  - BE-03
  - BE-04
  - BE-05
  - FE-04
  - ADM-04
risk: high
verification:
  - type: browser
    scope: tests/e2e/order_context_chat.spec.ts
status: completed
verified_against:
  customer-chat-api: 2
  admin-chat-api: 2
  chat-realtime-websocket: 2
```
