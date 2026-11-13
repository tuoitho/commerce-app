import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { ApiError } from '@/api/client'
import type { LiveProduct, LiveProductInput } from '@/api/live'
import { getAdminProductById } from '@/api/products'
import { LiveProductPicker } from './LiveProductPicker'
import { LivePriceTable } from './LivePriceTable'
import { draftFromDetail, mapFieldErrors, toLiveProductInputs, withSessionPrices, type DraftErrors, type DraftProduct } from './liveDraft'

interface LiveProductsManagerProps {
  products: LiveProduct[]
  pinnedProductId: string | null
  onSave: (products: LiveProductInput[]) => Promise<void>
  onTogglePin: (productId: string | null) => Promise<void>
}

/** Edits the live cart while broadcasting; sold counts follow realtime updates. */
export function LiveProductsManager({ products, pinnedProductId, onSave, onTogglePin }: LiveProductsManagerProps) {
  const [drafts, setDrafts] = useState<DraftProduct[] | null>(null)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const productKey = products.map((p) => p.productId).join(',')

  // Load full variant lists when products are added or removed (here or by a
  // save); sold-count updates keep the same key and leave local edits alone.
  useEffect(() => {
    let cancelled = false
    Promise.all(products.map((p) => getAdminProductById(p.productId)))
      .then((details) => {
        if (!cancelled) setDrafts(details.map((d, i) => withSessionPrices(draftFromDetail(d), products[i])))
      })
      .catch(() => {
        if (!cancelled) setMessage('Không tải được giỏ hàng live')
      })
    return () => {
      cancelled = true
    }
  }, [productKey])

  // Realtime sold counts update the rows without touching unsaved prices.
  useEffect(() => {
    setDrafts((current) =>
      current?.map((d) => {
        const live = products.find((p) => p.productId === d.productId)
        if (!live) return d
        return {
          ...d,
          variants: d.variants.map((v) => {
            const price = live.livePrices.find((p) => p.variantId === v.variantId)
            return price ? { ...v, sold: price.sold } : v
          }),
        }
      }) ?? null,
    )
  }, [products])

  const save = async () => {
    if (!drafts) return
    setSaving(true)
    setErrors({})
    setMessage(null)
    try {
      await onSave(toLiveProductInputs(drafts))
      setMessage('Đã cập nhật giỏ hàng live')
    } catch (err) {
      if (err instanceof ApiError && err.isValidationError()) {
        setErrors(mapFieldErrors(err.fields ?? {}, drafts))
      } else {
        setMessage(err instanceof ApiError ? err.message : 'Không lưu được giỏ hàng live')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">Giỏ hàng live</h2>
        <button
          type="button"
          onClick={save}
          disabled={!drafts || saving}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white disabled:bg-zinc-200 disabled:text-zinc-500"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Lưu thay đổi
        </button>
      </div>
      {message && <p role="status" className="text-xs font-medium text-zinc-600">{message}</p>}
      {errors.products && <p className="text-xs text-rose-600">{errors.products}</p>}
      {drafts === null ? (
        <div className="flex justify-center py-6 text-zinc-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          <LiveProductPicker selectedIds={drafts.map((d) => d.productId)} onAdd={(p) => setDrafts((current) => [...(current ?? []), p])} />
          <LivePriceTable
            products={drafts}
            errors={errors}
            onChange={setDrafts}
            pinnedProductId={pinnedProductId}
            onTogglePin={(id) => void onTogglePin(pinnedProductId === id ? null : id)}
          />
        </>
      )}
    </section>
  )
}
