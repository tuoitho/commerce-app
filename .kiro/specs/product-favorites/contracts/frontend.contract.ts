export interface ViewerStateContract {
  isFavorite: boolean
}

export interface FavoriteStateContract {
  productId: string
  isFavorite: boolean
}

export interface FavoriteProductSummaryContract {
  id: string
  name: string
  model: string
  brand: string
  category: {
    id: string
    name: string
  }
  minPriceVnd: string
  maxPriceVnd: string
  price: string
  currency: 'VND'
  primaryImageUrl: string
  inStock: boolean
  viewer: ViewerStateContract
  active: boolean
  favoritedAt: string
}

export interface FavoriteMutationContract {
  productId: string
  nextState: boolean
}

export type FavoriteMutationOutcomeContract =
  | { kind: 'confirmed'; state: FavoriteStateContract }
  | { kind: 'failed'; restoredState: boolean; error: unknown }
  | { kind: 'coalesced'; optimisticState: boolean }

export interface FavoritesSessionContract {
  /** Resolve an optimistic session override before the latest server-provided value. */
  resolveIsFavorite(productId: string, serverValue: boolean): boolean

  /** Report whether the product currently has an in-flight mutation. */
  isPending(productId: string): boolean

  /**
   * Apply the next state optimistically, coalesce duplicate activation while pending,
   * confirm from the API result, and restore the previous state if the request fails.
   * This method always resolves. A duplicate call while the same product is pending resolves
   * immediately as coalesced. The UI caller owns Vietnamese feedback for a failed outcome.
   */
  mutate(input: FavoriteMutationContract): Promise<FavoriteMutationOutcomeContract>
}

declare const localAppPathBrand: unique symbol

/**
 * A local app path starts with exactly one slash, never starts with slash-backslash,
 * contains no scheme or host, and may contain its own query and fragment.
 */
export type LocalAppPathContract = string & { readonly [localAppPathBrand]: true }

export interface LocalRouteContract {
  pathname: string
  search: string
  hash: string
}

/**
 * Concatenate pathname, search, and hash, validate the result as LocalAppPathContract,
 * then encode it with encodeURIComponent as the complete redirect query value.
 * Example: /products?q=phone#results becomes
 * /login?redirect=%2Fproducts%3Fq%3Dphone%23results.
 */
export type FavoriteLoginRedirectContract = (
  route: LocalRouteContract,
) => `/login?redirect=${string}`

/**
 * Decode and accept only LocalAppPathContract values. Empty values, absolute URLs,
 * protocol-relative paths, slash-backslash paths, and malformed encoding resolve to /.
 */
export type SafeLoginReturnContract = (encodedRedirect: string | null) => LocalAppPathContract

export type FavoritePageStateContract =
  | { kind: 'auth-loading' }
  | { kind: 'redirecting-to-login' }
  | { kind: 'loading' }
  | { kind: 'error'; retry: () => void }
  | { kind: 'empty' }
  | {
      kind: 'out-of-range'
      requestedPage: number
      targetPage: number
      navigation: 'replace'
    }
  | {
      kind: 'populated'
      items: FavoriteProductSummaryContract[]
      pagination: {
        page: number
        limit: 12
        total: number
        totalPages: number
        hasNext: boolean
        hasPrev: boolean
      }
    }

export type FavoriteControlSurfaceContract = 'product-card' | 'product-detail'

export interface FavoriteControlBaseContract {
  surface: FavoriteControlSurfaceContract
  pending: boolean
  blocksParentDetailNavigation: true
  supportsKeyboardActivation: true
  hasVisibleFocus: true
  usesNonColorStateCue: true
}

export type FavoriteControlContract = FavoriteControlBaseContract &
  (
    | {
        isFavorite: false
        accessibleName: 'Thêm vào yêu thích'
        ariaPressed: false
      }
    | {
        isFavorite: true
        accessibleName: 'Bỏ khỏi yêu thích'
        ariaPressed: true
      }
  )

export interface InactiveFavoritePresentationContract {
  detailNavigationEnabled: false
  purchaseEnabled: false
  removeFavoriteEnabled: true
  discontinuedLabelVisible: true
}

export interface FavoriteNavigationContract {
  route: '/favorites'
  desktopHeaderVisibleForCustomer: true
  mobileMenuVisibleForCustomer: true
  visibleForAnonymous: false
}
