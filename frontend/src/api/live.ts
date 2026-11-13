import { apiClient } from './client'

export interface LiveSummary {
  id: string
  title: string
  startedAt: string
}

export interface LiveMedia {
  whepUrl: string
  hlsUrl: string
}

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

export type LiveStatus = 'live' | 'ended'

export interface LiveSessionView {
  id: string
  title: string
  status: LiveStatus
  startedAt: string
  endedAt: string | null
  viewerCount: number
  heartCount: number
  signalOnline: boolean
  pinnedProductId: string | null
  products: LiveProduct[]
  comments: LiveComment[]
  media: LiveMedia | null
}

export interface LiveHeartBurst {
  userId: string
  count: number
}

export type LiveEndReason = 'admin' | 'signal_lost'

/** Realtime events of a live room (WS-LIVE-ROOM). */
export type LiveRoomEvent =
  | { type: 'live:comment'; payload: LiveComment }
  | { type: 'live:comment_hidden'; payload: { commentId: string } }
  | { type: 'live:hearts'; payload: { total: number; bursts: LiveHeartBurst[] } }
  | { type: 'live:viewers'; payload: { count: number } }
  | { type: 'live:products'; payload: { products: LiveProduct[]; pinnedProductId: string | null } }
  | { type: 'live:signal'; payload: { online: boolean } }
  | { type: 'live:ended'; payload: { endedAt: string; reason: LiveEndReason } }

export const liveApi = {
  async getCurrent(): Promise<LiveSummary | null> {
    return apiClient<LiveSummary | null>('/live/current', { skipAuthRefresh: true })
  },

  async getSession(sessionId: string): Promise<LiveSessionView> {
    return apiClient<LiveSessionView>(`/live/sessions/${encodeURIComponent(sessionId)}`)
  },

  async postComment(sessionId: string, content: string): Promise<LiveComment> {
    return apiClient<LiveComment>(`/live/sessions/${encodeURIComponent(sessionId)}/comments`, {
      method: 'POST',
      body: { content },
    })
  },
}

export function getLiveWebSocketUrl(sessionId: string, token: string): string {
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
