import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from '@/context/ToastContext'
import { AuthProvider } from '@/context/AuthContext'
import { CartProvider } from '@/context/CartContext'
import { FavoritesProvider } from '@/context/FavoritesContext'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { HomePage } from '@/pages/HomePage'
import { CatalogPage } from '@/pages/CatalogPage'
import { ProductDetailPage } from '@/pages/ProductDetailPage'
import { CartPage } from '@/pages/CartPage'
import { CheckoutPage } from '@/pages/CheckoutPage'
import { OrderHistoryPage } from '@/pages/OrderHistoryPage'
import { OrderDetailPage } from '@/pages/OrderDetailPage'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { FavoritesPage } from '@/pages/FavoritesPage'
import { MyReviewsPage } from '@/pages/MyReviewsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

export function AppContent() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900 selection:bg-emerald-600 selection:text-white">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/products" element={<CatalogPage />} />
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/orders" element={<OrderHistoryPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/reviews" element={<MyReviewsPage />} />
          <Route path="/account/reviews" element={<MyReviewsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <CartProvider>
          <FavoritesProvider>
            <BrowserRouter>
              <AppContent />
            </BrowserRouter>
          </FavoritesProvider>
        </CartProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

export default App
