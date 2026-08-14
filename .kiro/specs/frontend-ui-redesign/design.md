# Design Document

## Overview

Thiết kế tái tạo toàn bộ lớp trình bày của storefront điện thoại theo hướng **precision retail**: bố cục sáng, có cấu trúc biên tập và các nhãn thông tin kỹ thuật rõ ràng. Hướng này giúp catalogue điện thoại trông đáng tin cậy, đồng thời ưu tiên việc so sánh giá, tồn kho và lựa chọn biến thể. Thiết kế đáp ứng Requirements 1-14 mà không thay đổi route, dữ liệu, API, quy tắc xác thực hoặc luồng nghiệp vụ.

Quyết định thiết kế chính:

- **Stack chuyển sang Tailwind CSS v4 + shadcn/ui** theo lựa chọn của người dùng. Tailwind tích hợp qua plugin `@tailwindcss/vite` (CSS-first, dùng `@theme`, không dùng `tailwind.config.ts`). shadcn/ui được khởi tạo bằng CLI với `components.json`, components đặt trong `src/components/ui/`, dùng `cn()` trong `src/lib/utils.ts` và path alias `@/*`.
- **Theme light precision-retail** theo design.md đã duyệt trước đây, nay được biểu diễn bằng các semantic token của shadcn/ui (`background`, `foreground`, `muted`, `primary`, `secondary`, `accent`, `destructive`, `border`, `input`, `ring`).
- Không tải font bên thứ ba. Font display dùng nhóm serif có sẵn của hệ điều hành; font nội dung dùng nhóm sans-serif có sẵn; nhãn kỹ thuật dùng nhóm monospace có sẵn. Không thêm dependency ngoài phần cần cho Tailwind/shadcn.
- Giữ nguyên ba breakpoint hiện có (`900px` tablet, dải `601px–767px` detail/cart tablet hẹp, `600px` mobile) bằng custom screens trong `@theme` và một media query dành riêng cho dải tablet hẹp; bổ sung quy tắc desktop rộng từ `1440px` để giới hạn độ dài dòng.

### Ngôn ngữ trực quan

| Vai trò | Giá trị | Mục đích |
|---|---|---|
| Ink | `#10243B` | chữ chính, header và điểm neo thị giác |
| Cloud | `#F5F7FA` | nền trang |
| Paper | `#FFFFFF` | bề mặt card, form và panel |
| Signal blue | `#0757C9` | hành động chính và link |
| Signal blue dark | `#06439A` | hover/active của hành động chính |
| Mint | `#0B6E4F` | trạng thái còn hàng/thành công |
| Alert | `#B42318` | lỗi/hết hàng/hành động huỷ |
| Line | `#C8D2DE` | đường phân tách và viền |

Màu Ink trên Paper/Cloud, Signal blue trên Paper, Mint trên Paper và Alert trên Paper phải đạt mức tương phản chữ thường tối thiểu 4.5:1. Các giá trị trên được map vào semantic token của shadcn/ui trong `src/index.css` (dạng `@theme inline` với biến màu `hsl(...)`), để mọi component dùng token thay vì hard-code.

Typography: display headings dùng `Iowan Old Style, Georgia, serif`; body dùng `system-ui, "Segoe UI", sans-serif`; nhãn kỹ thuật dùng `ui-monospace, "Cascadia Code", monospace`. Chữ serif chỉ dùng cho heading/hero; thông tin giao dịch và điều khiển luôn dùng sans-serif hoặc monospace để dễ quét. Một type scale dùng chung được khai báo trong `@theme` (`--text-*`).

Yếu tố nhận diện duy nhất là **technical label**: brand/model, tồn kho, giá và bộ lọc được trình bày bằng nhãn chữ hoa nhỏ, tracking rộng và các đường kẻ mảnh. Nó mang lại cảm giác catalogue thiết bị chính xác, không thêm minh hoạ hay hiệu ứng trang trí không liên quan. Chữ hoa nhỏ, tracking rộng và hairline dùng chừng mực, không lặp ở mọi khối.

## Architecture

Không thay đổi ranh giới dữ liệu hiện hữu:

```text
BrowserRouter
  AppRoutes
    SiteHeader
    Route pages
      existing AuthProvider / CartProvider hooks
      existing API modules and URL search params
```

`App.tsx` tiếp tục là chủ sở hữu route, shared header và provider tree. Không thêm route hoặc thay đổi URL. Các page tiếp tục sở hữu việc tải dữ liệu, mutation và trạng thái UI. Các request tiếp tục đi qua API modules, còn bộ lọc catalogue tiếp tục được đọc/ghi bằng `useSearchParams`.

Styling chuyển từ các class semantic thủ công trong `src/index.css` sang Tailwind utilities + shadcn/ui:

- `vite.config.ts`: thêm plugin `tailwindcss()` và alias `@` → `./src` (kèm `@types/node`).
- `tsconfig.app.json` và `tsconfig.json`: thêm `baseUrl` + `paths` `@/*` → `./src/*`.
- `src/index.css`: bắt đầu bằng `@import "tailwindcss";`, định nghĩa `:root` semantic color tokens, `@theme inline` để map token thành Tailwind colors, khai báo custom screens và type scale, thêm `@layer base` cho các rule nền tảng (focus ring, reduced motion, container chung).
- `src/lib/utils.ts`: export `cn()` (clsx + tailwind-merge).
- `src/components/ui/*`: các shadcn component được cài bằng CLI, chọn bộ tối thiểu (xem mục Components).
- Các component/page sử dụng shadcn primitives và Tailwind utilities; `src/index.css` chỉ giữ token, base styles và vài quy tắc bố cục tái sử dụng (container, technical label) thay vì toàn bộ styling component.

Luồng responsive:

```text
>= 1440px: centered reading container, bounded text measures, multi-column layouts
768-1439px: existing tablet/desktop grid behavior, fluid columns
601-767px: existing narrow-tablet detail/cart grid behavior (media query riêng giữ nguyên)
320-600px: stacked navigation, filters, detail and cart actions; no page overflow
```

`prefers-reduced-motion: reduce` vô hiệu hoá transition không cần thiết. Mọi focusable control dùng một focus ring có độ tương phản rõ (token `ring`); không thay đổi native keyboard order hay semantics hiện tại.

## Components And Interfaces

### Shared shell

**SiteHeader** giữ nguyên link destinations, cart count, email, login/register và logout behavior, và trạng thái active của navigation (dấu hiệu không chỉ dựa vào màu). Desktop: brand, primary navigation, nhóm account actions, cart link có badge số lượng, và ô tìm kiếm nổi bật điều hướng tới `/products?q=...` (tái sử dụng tham số `q` hiện có). Mobile: navigation và search bọc sang hàng riêng thay vì bị che hoặc tạo horizontal scroll (đã có contract tại 600px, giữ nguyên). Nhóm tài khoản trên mobile giữ thứ tự thao tác hiện có.

**SiteFooter** (mới): hiển thị thương hiệu, các đường điều hướng hiện có (Home, Phones, Cart) và dòng bản quyền đơn giản (năm hiện tại + tên cửa hàng). KHÔNG tạo nội dung nghiệp vụ giả như hỗ trợ khách hàng, chính sách vận chuyển/đổi trả vì chưa tồn tại trong codebase. Footer không che khuất hoặc chồng lấn nội dung ở mọi breakpoint.

Các page dùng chung page container và page heading thống nhất (class `.page-container`, `.page-heading`, `.technical-label` trong `@layer components`).

### Product presentation

`ProductCard`, `ProductImage`, `ProductDetailPage` và `VariantSelector` giữ nguyên props, link, alt text, giá, logic tồn kho và logic chọn biến thể. Card được cấu trúc thành vùng ảnh, nhãn kỹ thuật, tên/link, giá và availability, bằng `Card` + Tailwind utilities:

- Ảnh dùng tỷ lệ khung hình nhất quán (`aspect-square`) và `object-cover`.
- Tên dài dùng `line-clamp-2` để không phá vỡ bố cục; các card cùng lưới có chiều cao và căn chỉnh hành động nhất quán (`flex flex-col`, hành động `mt-auto`).
- Hover chỉ tinh tế: đổi border-color sang token primary + shadow rất nhẹ; không dùng `translateY` mạnh hay zoom ảnh quá mức.
- Toàn bộ card không chứa link lồng nhau; giữ các link hiện tại như các target độc lập, một tab order và semantics hợp lệ.

Trang chi tiết dùng desktop split layout cho media và purchase panel; mobile xếp media trước thông tin. Price, availability, feedback và primary action ở cùng purchase panel. Các button lựa chọn biến thể phải có trạng thái selected/disabled khác biệt bằng viền, nền và `aria-pressed` hiện hữu, không chỉ bằng màu.

### Catalogue and home

`HomePage` giữ hero, CTA, featured data loading/error/empty states và link hiện có. Hero dùng headline display serif và một dải/nhãn technical-label làm điểm nhận diện; hero không chiếm gần như toàn bộ viewport (điều chỉnh `min-height` và padding về mức vừa phải). CTA là primary action duy nhất.

`CatalogPage` giữ nguyên mọi input, label, fieldset, URL parameter và nút reset. Filters được trình bày như một panel có search nổi bật, nhóm filter có legend rõ và reset là secondary action. Trên desktop, filters nằm ở sidebar hoặc panel inline; trên mobile, các nhóm filter (brand, price, stock) được đưa vào `Sheet` mở từ một nút "Filters" — search và nút reset vẫn ở ngoài sheet, URL behavior không đổi. Result count vẫn là live status. Product grid dùng CSS grid linh hoạt (custom screen Tailwind): 1–2 cột trên mobile, 2–3 tablet, 3+ desktop; minimum card width cho phép mỗi card và text co lại an toàn từ `320px`.

### Authentication, cart, recovery states

`LoginPage` và `RegisterPage` giữ validation, API error, submit state, return location và link qua lại. Chúng dùng `Card` làm auth surface có tiêu đề, form field và primary submit treatment thống nhất; lỗi trường hiển thị ngay dưới trường tương ứng.

`CartPage` giữ selection, quantity, remove, reload và checkout message. Summary được tách thành `Card`/panel riêng với checkout là primary action; quantity controls và remove phải có hit area đủ lớn và trạng thái pending/disabled dễ nhận biết. Mobile xếp summary và từng cart item theo cột mà không đổi thứ tự thao tác.

`NotFoundPage`, loading, empty, error, unavailable-stock, invalid-variant và form feedback dùng shared status styling (shadcn `Alert` + `Skeleton`):

- **Loading**: dùng `Skeleton` khớp với layout thật — skeleton cards cho product grid (home/catalog), skeleton block cho detail page — thay vì spinner/văn bản giữa màn hình. Giữ ngữ nghĩa `role="status"` / `aria-live="polite"` hiện có trên container skeleton.
- **Empty**: message rõ ràng + CTA (Continue shopping / Browse all phones).
- **Error**: `Alert` với message dễ hiểu + action retry/back hiện có; giữ `role="alert"`.

## Data Models

Không tạo, thay đổi hoặc persist data model. Các contract sau là bất biến:

- Product, category, variant, cart và auth types tiếp tục lấy từ các API module hiện hữu.
- Product detail variant selection tiếp tục serialise trong query string hiện hữu.
- Catalogue chỉ dùng `q`, `category_id`, `min_price`, `max_price` và `in_stock` trong URL search params, với cùng cách encode/decode hiện tại.
- Access token, refresh behavior và protected-cart behavior không thay đổi.
- Header search chỉ tạo/nối tham số `q` khi điều hướng sang `/products`, không tạo contract mới.

## Error Handling

Lỗi network/API, validation và action mutation tiếp tục đi theo state/error text hiện có. Lớp trình bày phải:

- Giữ `role="alert"` cho lỗi và `role="status"`/`aria-live` cho tiến trình hoặc phản hồi thành công khi markup hiện có đã cung cấp chúng.
- Hiển thị lỗi bằng `Alert` (hoặc status surface tương đương) gồm text tương phản và hành động retry hiện có nếu có; không thay thế lỗi bằng icon hoặc màu đơn lẻ.
- Giữ page/filter/cart controls mà người dùng cần để hồi phục, trừ control đã bị disabled bởi logic hiện hữu.
- Không nuốt, thay đổi hoặc tạo error contract mới từ API.
- Skeleton loading phải giữ live-region semantics để trình đọc màn hình không bị mất trạng thái so với bản text hiện có.

## Testing Strategy

| Phạm vi | Bằng chứng |
|---|---|
| Shared styles, tokens và responsive shell | Kiểm tra build; Playwright viewport screenshots/interaction tại 320px, 600px, 767px, 900px và 1440px; không có page-level horizontal scroll ở 320px. |
| Navigation, auth, routes và header search | Mở route hiện có, refresh/deep-link và thực thi test `App`/auth hiện có; xác minh destinations, logout, return path và header search điều hướng đúng `/products?q=`; test `SiteHeader` cập nhật cho search + footer. |
| Catalogue và product | Chạy các test catalogue, product card/detail, variant selection và URL filter hiện có; bổ sung assertions semantic nếu markup thay đổi (đặc biệt filter di chuyển vào Sheet ở mobile). |
| Cart | Chạy các test CartProvider/CartPage hiện có; kiểm tra selection, quantity, remove, pending/error và checkout message tiếp tục hoạt động. |
| Footer | Test `App`/route kiểm tra footer hiển thị ở các trang chính với brand, nav hiện có và bản quyền; không có nội dung giả. |
| Loading/empty/error | Cập nhật test loading để khớp skeleton (giữ `role="status"`), kiểm tra empty/error có CTA/retry. |
| Accessibility | Keyboard traversal bằng Playwright hoặc Testing Library cho header, search, form, filters, variants, cart; kiểm tra visible focus, label/legend, roles và contrast theo token; kiểm tra browser zoom 200% để nội dung và control chính không che khuất/chồng lấp. |
| Regression | Tại frontend chạy focused tests trước, sau đó `npm run lint`, `npm test` và `npm run build`. |

## Compatibility

Không có migration database. Tương thích được bảo toàn bằng việc không đổi public routes, route params, query parameters, API calls, API wire types, storage, session handling hay textual state semantics có thể được test. Việc thay đổi styling không đổi bất kỳ contract dữ liệu nào. Playwright config hiện có giữ nguyên 5 project viewport; chỉ cập nhật selector/assertion khi markup đổi.

## Requirement Traceability

| Requirement | Design Elements | Verification |
|---|---|---|
| 1.1 | Semantic token system trong `@theme`, shared shell, shared surfaces | Visual regression trên mọi route; inspect token usage |
| 1.2 | Shared shadcn primitives + button/input/card/status style contracts | Component/page tests và visual review |
| 1.3 | State styles, focus ring, reduced-motion rule | Keyboard/manual interaction check |
| 2.1 | Unchanged provider/API/router boundaries và component interfaces | Existing route, auth, catalogue, product, cart tests |
| 2.2 | Primary/secondary action hierarchy trong hero, filters, auth, detail và cart | Visual regression and DOM assertions |
| 2.3 | Shared loading/empty/error status treatment | Existing failure/empty-state tests plus visual review |
| 3.1 | 320px mobile layouts và overflow guard | Playwright 320px viewport check |
| 3.2 | Bounded desktop container và readable measures | Playwright 1440px viewport check |
| 3.3 | Preserved 900px/600px breakpoints, 601-767px dải tablet hẹp và fluid grid | Playwright viewport checks tại 600px, 767px và 900px |
| 4.1 | Existing semantic controls cộng visible focus styles | Keyboard traversal test |
| 4.2 | Text labels/status text retained với mọi colored states | DOM và visual accessibility review |
| 4.3 | Specified contrast-safe token palette | Automated hoặc manual contrast calculation |
| 4.4 | Reflow-safe grid và mobile stacking | Browser 200% zoom check |
| 5.1 | No changes tới API/auth/router/data boundaries | Typecheck và existing API/auth tests |
| 5.2 | Existing route table và pages retained | Route/deep-link test |
| 5.3 | Existing `useSearchParams` ownership retained | Catalogue URL filter tests |
| 6.1-6.4 | SiteHeader restructure (brand, nav, account, cart badge, mobile wrap, header search) | SiteHeader/App tests + e2e keyboard traversal |
| 7.1-7.3 | New SiteFooter (brand + nav + copyright, no fabricated content) | App route tests + e2e footer presence |
| 8.1-8.3 | HomePage hero + featured section hierarchy, bounded hero height | HomePage tests + e2e 320px/1440px |
| 9.1-9.4 | ProductCard image ratio, truncation, aligned actions, subtle hover | ProductCard tests + visual review |
| 10.1-10.3 | CatalogPage filters/result count/reset + responsive grid columns | CatalogPage tests + e2e viewports |
| 11.1-11.5 | ProductDetail purchase panel, CTA hierarchy, variant states, mobile stacking | ProductDetailPage/VariantSelector tests + e2e |
| 12.1-12.4 | CartPage item rows, summary panel, mobile stacking, preserved actions | CartPage tests + e2e |
| 13.1-13.3 | Auth surfaces, inline field errors, preserved validation/return-path | LoginPage/RegisterPage tests |
| 14.1-14.4 | Skeleton loading, empty/error CTA, feedback trên mutations | Updated loading/empty/error tests + e2e |