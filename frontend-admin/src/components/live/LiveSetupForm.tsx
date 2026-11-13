import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CameraOff, Loader2, Radio } from 'lucide-react'
import { adminLiveApi, type AdminLiveSession } from '@/api/live'
import { ApiError } from '@/api/client'
import { LiveProductPicker } from './LiveProductPicker'
import { LivePriceTable } from './LivePriceTable'
import { mapFieldErrors, toLiveProductInputs, type DraftErrors, type DraftProduct } from './liveDraft'

const PERMISSION_MESSAGE =
  'Trình duyệt chưa được cấp quyền dùng camera và micro. Hãy bấm biểu tượng camera trên thanh địa chỉ để cho phép, rồi tải lại trang.'

interface LiveSetupFormProps {
  onStarted: (session: AdminLiveSession, stream: MediaStream) => void
  /** Another session is already live. */
  onConflict: () => void
}

export function LiveSetupForm({ onStarted, onConflict }: LiveSetupFormProps) {
  const [title, setTitle] = useState('')
  const [products, setProducts] = useState<DraftProduct[]>([])
  const [errors, setErrors] = useState<DraftErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const media = useCameraPreview()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!media.stream) return
    setSubmitting(true)
    setErrors({})
    setFormError(null)
    try {
      const session = await adminLiveApi.create(title, toLiveProductInputs(products))
      media.handOff()
      onStarted(session, media.stream)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'livestream_already_active') {
        onConflict()
      } else if (err instanceof ApiError && err.isValidationError()) {
        setErrors(mapFieldErrors(err.fields ?? {}, products))
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Không bắt đầu được phiên live, vui lòng thử lại')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <section className="flex flex-col gap-4">
        <div className="relative aspect-[9/16] w-full overflow-hidden rounded-3xl bg-zinc-950">
          {media.stream ? (
            <video ref={media.previewRef} data-testid="live-preview" autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-zinc-300">
              {media.error ? <CameraOff className="h-8 w-8" /> : <Loader2 className="h-6 w-6 animate-spin" />}
              {media.error && <p role="alert" className="text-sm">{media.error}</p>}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DeviceSelect label="Camera" devices={media.cameras} value={media.cameraId} onChange={media.setCameraId} />
          <DeviceSelect label="Micro" devices={media.microphones} value={media.microphoneId} onChange={media.setMicrophoneId} />
        </div>
      </section>

      <section className="flex min-w-0 flex-col gap-5">
        <div>
          <label htmlFor="live-title" className="text-sm font-semibold text-zinc-900">Tiêu đề phiên live</label>
          <input
            id="live-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Ví dụ: Săn deal iPhone 16 giá live tối nay"
            aria-invalid={!!errors.title}
            className={`mt-1.5 h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:border-teal-600 ${errors.title ? 'border-rose-400' : 'border-zinc-200'}`}
          />
          {errors.title && <p className="mt-1 text-xs text-rose-600">{errors.title}</p>}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Giỏ hàng live</h2>
            <span className="text-xs text-zinc-500">{products.length}/50 sản phẩm · để trống giá live nếu bán giá thường</span>
          </div>
          <LiveProductPicker selectedIds={products.map((p) => p.productId)} onAdd={(p) => setProducts((current) => [...current, p])} />
          {errors.products && <p className="text-xs text-rose-600">{errors.products}</p>}
          <LivePriceTable products={products} errors={errors} onChange={setProducts} />
        </div>

        {formError && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{formError}</p>}

        <button
          type="submit"
          disabled={!media.stream || submitting}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-rose-600 text-sm font-bold text-white hover:bg-rose-700 disabled:bg-zinc-200 disabled:text-zinc-500"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
          Bắt đầu phát
        </button>
      </section>
    </form>
  )
}

function DeviceSelect({ label, devices, value, onChange }: { label: string; devices: MediaDeviceInfo[]; value: string; onChange: (id: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-600">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={devices.length === 0}
        className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-sm font-normal text-zinc-900"
      >
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Opens the chosen camera and microphone for preview; stops them on unmount unless handed off. */
function useCameraPreview() {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [cameraId, setCameraId] = useState('')
  const [microphoneId, setMicrophoneId] = useState('')
  const previewRef = useRef<HTMLVideoElement>(null)
  const handedOff = useRef(false)

  useEffect(() => {
    let cancelled = false
    let opened: MediaStream | null = null
    const open = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(PERMISSION_MESSAGE)
        return
      }
      try {
        opened = await navigator.mediaDevices.getUserMedia({
          video: cameraId ? { deviceId: { exact: cameraId } } : true,
          audio: microphoneId ? { deviceId: { exact: microphoneId } } : true,
        })
        if (cancelled) {
          opened.getTracks().forEach((t) => t.stop())
          return
        }
        setError(null)
        setStream(opened)
        const devices = await navigator.mediaDevices.enumerateDevices()
        if (cancelled) return
        setCameras(devices.filter((d) => d.kind === 'videoinput'))
        setMicrophones(devices.filter((d) => d.kind === 'audioinput'))
      } catch {
        if (!cancelled) {
          setStream(null)
          setError(PERMISSION_MESSAGE)
        }
      }
    }
    void open()
    return () => {
      cancelled = true
      if (opened && !handedOff.current) opened.getTracks().forEach((t) => t.stop())
    }
  }, [cameraId, microphoneId])

  useEffect(() => {
    if (previewRef.current && stream) previewRef.current.srcObject = stream
  }, [stream])

  return {
    stream,
    error,
    cameras,
    microphones,
    cameraId,
    microphoneId,
    setCameraId,
    setMicrophoneId,
    previewRef,
    handOff: () => {
      handedOff.current = true
    },
  }
}
