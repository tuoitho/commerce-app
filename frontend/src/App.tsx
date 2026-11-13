import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { ToastProvider } from '@/context/ToastContext'
import { AuthProvider } from '@/context/AuthContext'
import { FavoritesProvider } from '@/context/FavoritesContext'
import { CartProvider } from '@/context/CartContext'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { ChatWidget } from '@/components/chat/ChatWidget'
import { HomePage } from '@/pages/HomePage'
import { CatalogPage } from '@/pages/CatalogPage'
import { ProductDetailPage } from '@/pages/ProductDetailPage'
import { CartPage } from '@/pages/CartPage'
import { CheckoutPage } from '@/pages/CheckoutPage'
import { OrderHistoryPage } from '@/pages/OrderHistoryPage'
import { OrderDetailPage } from '@/pages/OrderDetailPage'
import { FavoritesPage } from '@/pages/FavoritesPage'
import { ReviewHistoryPage } from '@/pages/ReviewHistoryPage'
import { PostsFeedPage } from '@/pages/PostsFeedPage'
import { PostDetailPage } from '@/pages/PostDetailPage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { LivePage } from '@/pages/LivePage'

export function AppContent() {
  // The live page is an immersive full-screen stage; the floating chat button would cover its controls.
  const isLivePage = useLocation().pathname.startsWith('/live/')
  return (
    <div className="flex min-h-screen flex-col bg-[#f7f7f5] font-sans text-zinc-950 selection:bg-emerald-700 selection:text-white">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<CatalogPage />} />
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/posts" element={<PostsFeedPage />} />
          <Route path="/posts/:id" element={<PostDetailPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/orders" element={<OrderHistoryPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/reviews" element={<ReviewHistoryPage />} />
          <Route path="/live/:sessionId" element={<LivePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
      {!isLivePage && <ChatWidget />}
    </div>
  )
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <FavoritesProvider>
          <CartProvider>
            <BrowserRouter>
              <AppContent />
            </BrowserRouter>
          </CartProvider>
        </FavoritesProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

export default App
