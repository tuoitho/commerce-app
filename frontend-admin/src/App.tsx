import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/context/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { ProductFormPage } from '@/pages/ProductFormPage'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { OrdersPage } from '@/pages/OrdersPage'
import { AdminOrderDetailPage } from '@/pages/AdminOrderDetailPage'
import { ReturnsPage } from '@/pages/ReturnsPage'
import { ReviewsPage } from '@/pages/ReviewsPage'
import { AdminReturnDetailPage } from '@/pages/AdminReturnDetailPage'
import { ChatSupportPage } from '@/pages/ChatSupportPage'
import { AdminPostsPage } from '@/pages/AdminPostsPage'
import { AdminPostDetailPage } from '@/pages/AdminPostDetailPage'
import { LivestreamPage } from '@/pages/LivestreamPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="posts" element={<AdminPostsPage />} />
        <Route path="livestream" element={<LivestreamPage />} />
        <Route path="posts/:id" element={<AdminPostDetailPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:id" element={<AdminOrderDetailPage />} />
        <Route path="chat" element={<ChatSupportPage />} />
        <Route path="chat/:conversationId" element={<ChatSupportPage />} />
        <Route path="returns" element={<ReturnsPage />} />
        <Route path="returns/:id" element={<AdminReturnDetailPage />} />
							<Route path="reviews" element={<ReviewsPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="products/new" element={<ProductFormPage mode="create" />} />
        <Route path="products/:id" element={<ProductFormPage mode="edit" />} />
        <Route path="products/:id/edit" element={<ProductFormPage mode="edit" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App


