import { apiClient } from './client'

export interface LiveVariantPrice {
  variantId: string
  optionLabel: string
  regularPriceVnd: string
  livePriceVnd: string
  quota: number | null
  sold: number
  remaining: number | null
  active: boolean
}

export interface LiveProduct {
  productId: string
  position: number
  name: string
  brand: string
  imageUrl: string
  minPriceVnd: string
  maxPriceVnd: string
  regularMinPriceVnd: string
  regularMaxPriceVnd: string
  hasLivePrice: boolean
  inStock: boolean
  livePrices: LiveVariantPrice[]
}

export interface LiveComment {
  id: string
  sessionId: string
  authorName: string
  authorRole: 'customer' | 'admin'
  content: string
  hidden: boolean
  createdAt: string
}

export type LiveEndReason = 'admin' | 'signal_lost'

export interface AdminLiveSession {
  id: string
  title: string
  status: 'live' | 'ended'
  startedAt: string
  endedAt: string | null
  viewerCount: number
  heartCount: number
  signalOnline: boolean
  pinnedProductId: string | null
  products: LiveProduct[]
  comments: LiveComment[]
  media: { whipUrl: string; whepUrl: string; hlsUrl: string } | null
  summary: {
    durationSeconds: number
    peakViewers: number
    commentCount: number
    heartCount: number
    endReason: LiveEndReason | null
  }
}

export interface LiveVariantInput {
  variantId: string
  livePriceVnd: string
  quota: number | null
}

export interface LiveProductInput {
  productId: string
  variants: LiveVariantInput[]
}

/** Realtime events of a live room (WS-LIVE-ROOM). */
export type LiveRoomEvent =
  | { type: 'live:comment'; payload: LiveComment }
  | { type: 'live:comment_hidden'; payload: { commentId: string } }
  | { type: 'live:hearts'; payload: { total: number; bursts: { userId: string; count: number }[] } }
  | { type: 'live:viewers'; payload: { count: number } }
  | { type: 'live:products'; payload: { products: LiveProduct[]; pinnedProductId: string | null } }
  | { type: 'live:signal'; payload: { online: boolean } }
  | { type: 'live:ended'; payload: { endedAt: string; reason: LiveEndReason } }

const sessionPath = (id: string) => `/admin/live/sessions/${encodeURIComponent(id)}`

export const adminLiveApi = {
  getCurrent: () => apiClient<AdminLiveSession | null>('/admin/live/sessions/current'),
  getSession: (id: string) => apiClient<AdminLiveSession>(sessionPath(id)),
  create: (title: string, products: LiveProductInput[]) =>
    apiClient<AdminLiveSession>('/admin/live/sessions', { method: 'POST', body: { title, products } }),
  replaceProducts: (id: string, products: LiveProductInput[]) =>
    apiClient<AdminLiveSession>(`${sessionPath(id)}/products`, { method: 'PUT', body: { products } }),
  pin: (id: string, productId: string | null) =>
    apiClient<AdminLiveSession>(`${sessionPath(id)}/pin`, { method: 'PUT', body: { productId } }),
  end: (id: string) => apiClient<AdminLiveSession>(`${sessionPath(id)}/end`, { method: 'POST' }),
  comment: (id: string, content: string) =>
    apiClient<LiveComment>(`${sessionPath(id)}/comments`, { method: 'POST', body: { content } }),
  hideComment: (commentId: string) =>
    apiClient<LiveComment>(`/admin/live/comments/${encodeURIComponent(commentId)}/hide`, { method: 'POST' }),
}

export function getAdminLiveWebSocketUrl(sessionId: string, token: string): string {
  const rawBase = import.meta.env.VITE_API_BASE_URL || '/api/v1'
  const cleanBase = rawBase.replace(/\/+$/, '')
  let wsUrl: string
  if (cleanBase.startsWith('http://')) {
    wsUrl = cleanBase.replace('http://', 'ws://')
  } else if (cleanBase.startsWith('https://')) {
    wsUrl = cleanBase.replace('https://', 'wss://')
  } else {
    const protocol = typeof window !== 'undefined' && window.location?.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = typeof window !== 'undefined' && window.location?.host ? window.location.host : 'localhost:18080'
    const formattedBase = cleanBase.startsWith('/') ? cleanBase : `/${cleanBase}`
    wsUrl = `${protocol}//${host}${formattedBase}`
  }
  return `${wsUrl}/live/sessions/${encodeURIComponent(sessionId)}/ws?token=${encodeURIComponent(token)}`
}
