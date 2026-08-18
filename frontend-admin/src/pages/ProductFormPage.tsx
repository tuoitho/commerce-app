import { useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, AlertCircle, Save, Layers, Package } from 'lucide-react'
import { getCategories } from '@/api/categories'
import { createAdminProduct, getAdminProductById, updateAdminProduct } from '@/api/products'
import { ApiError, type SaveProductRequest, type OptionGroupInput, type VariantInput } from '@/api/types'
import { productFormSchema, type ProductFormValues, type ProductFormInput } from '@/lib/validations/product'
import {
  type OptionGroupItem,
  type VariantMatrixRow,
  generateVariantMatrix,
  buildCombinationKey,
  buildCombinationLabel,
} from '@/lib/cartesian'
import { OptionGroupBuilder } from '@/components/products/OptionGroupBuilder'
import { VariantMatrixTable } from '@/components/products/VariantMatrixTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface ProductFormPageProps {
  mode?: 'create' | 'edit'
}

function buildFlattenedErrors(
  rhfErrors: FieldErrors<ProductFormInput>,
  serverErrors: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = { ...serverErrors }

  const ogErrors = rhfErrors.optionGroups as Record<string, unknown> | undefined
  if (ogErrors) {
    if (Array.isArray(ogErrors)) {
      ogErrors.forEach((gErr: Record<string, unknown> | undefined, gIdx: number) => {
        if (gErr) {
          if (typeof (gErr.label as { message?: string } | undefined)?.message === 'string') {
            const msg = (gErr.label as { message: string }).message
            result[`optionGroups.${gIdx}.label`] = msg
            result[`optionGroups[${gIdx}].label`] = msg
          }
          const vList = gErr.values
          if (Array.isArray(vList)) {
            vList.forEach((vErr: Record<string, unknown> | undefined, vIdx: number) => {
              if (vErr && typeof (vErr.label as { message?: string } | undefined)?.message === 'string') {
                const msg = (vErr.label as { message: string }).message
                result[`optionGroups.${gIdx}.values.${vIdx}.label`] = msg
                result[`optionGroups[${gIdx}].values[${vIdx}].label`] = msg
              }
            })
          }
          if (typeof (gErr.values as { message?: string } | undefined)?.message === 'string') {
            const msg = (gErr.values as { message: string }).message
            result[`optionGroups.${gIdx}.values`] = msg
            result[`optionGroups[${gIdx}].values`] = msg
          }
        }
      })
    }
    if (typeof (ogErrors as { message?: string }).message === 'string') {
      result['optionGroups'] = (ogErrors as { message: string }).message
    } else if (typeof (ogErrors as { root?: { message?: string } }).root?.message === 'string') {
      result['optionGroups'] = (ogErrors as { root: { message: string } }).root.message
    }
  }

  const varErrors = rhfErrors.variants as Record<string, unknown> | undefined
  if (varErrors) {
    if (Array.isArray(varErrors)) {
      varErrors.forEach((vErr: Record<string, unknown> | undefined, vIdx: number) => {
        if (vErr) {
          if (typeof (vErr.priceVND as { message?: string } | undefined)?.message === 'string') {
            const msg = (vErr.priceVND as { message: string }).message
            result[`variants.${vIdx}.priceVND`] = msg
            result[`variants[${vIdx}].priceVND`] = msg
            result[`variants.${vIdx}.priceVnd`] = msg
            result[`variants[${vIdx}].priceVnd`] = msg
          }
          if (typeof (vErr.stockQuantity as { message?: string } | undefined)?.message === 'string') {
            const msg = (vErr.stockQuantity as { message: string }).message
            result[`variants.${vIdx}.stockQuantity`] = msg
            result[`variants[${vIdx}].stockQuantity`] = msg
          }
        }
      })
    }
    if (typeof (varErrors as { message?: string }).message === 'string') {
      result['variants'] = (varErrors as { message: string }).message
    } else if (typeof (varErrors as { root?: { message?: string } }).root?.message === 'string') {
      result['variants'] = (varErrors as { root: { message: string } }).root.message
    }
  }

  return result
}

export function ProductFormPage({ mode }: ProductFormPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [hasVariants, setHasVariants] = useState(false)
  const [optionGroups, setOptionGroups] = useState<OptionGroupItem[]>([])
  const [variants, setVariants] = useState<VariantMatrixRow[]>([])

  const isEdit = mode === 'edit' || (Boolean(id) && id !== 'new')

  const {
    data: categories = [],
    isLoading: isCategoriesLoading,
  } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })

  const {
    data: product,
    isLoading: isProductLoading,
    isError: isProductError,
    error: productError,
  } = useQuery({
    queryKey: ['admin', 'product', id],
    queryFn: () => getAdminProductById(id!),
    enabled: isEdit && Boolean(id),
  })

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: '',
      model: '',
      brand: '',
      categoryId: '',
      price: '',
      stockQuantity: 0,
      description: '',
      featured: false,
      imageUrls: '',
      hasVariants: false,
      optionGroups: [],
      variants: [],
    },
  })

  useEffect(() => {
    if (isEdit && product) {
      const hasExistingVariants = Boolean(
        product.optionGroups &&
        product.optionGroups.length > 0 &&
        product.variants &&
        product.variants.length > 0
      )

      const rawOptionGroups: OptionGroupItem[] = (product.optionGroups || []).map((g) => ({
        id: g.id,
        label: g.label,
        position: g.position,
        values: (g.values || []).map((v) => ({
          id: v.id,
          label: v.label,
        })),
      }))

      const rawVariants: VariantMatrixRow[] = (product.variants || []).map((v) => {
        const priceStr =
          v.priceVND !== undefined
            ? String(v.priceVND)
            : v.priceVnd !== undefined
              ? String(v.priceVnd)
              : ''
        return {
          id: v.id,
          optionValueIds: v.optionValueIds || {},
          combinationKey: buildCombinationKey(v.optionValueIds || {}),
          combinationLabel: buildCombinationLabel(v.optionValueIds || {}, rawOptionGroups),
          priceVND: priceStr,
          stockQuantity: typeof v.stockQuantity === 'number' ? v.stockQuantity : 0,
          active: typeof v.active === 'boolean' ? v.active : true,
        }
      })

      const fullMatrix = hasExistingVariants
        ? generateVariantMatrix(rawOptionGroups, rawVariants)
        : []

      setHasVariants(hasExistingVariants)
      setOptionGroups(rawOptionGroups)
      setVariants(fullMatrix)

      reset({
        name: product.name || '',
        model: product.model || '',
        brand: product.brand || '',
        categoryId: product.category?.id || '',
        price: product.price || '',
        stockQuantity: product.stockQuantity ?? 0,
        description: product.description || '',
        featured: product.featured ?? false,
        imageUrls: (product.imageUrls || []).join('\n'),
        hasVariants: hasExistingVariants,
        optionGroups: rawOptionGroups,
        variants: fullMatrix,
      })
    }
  }, [isEdit, product, reset])

  const handleOptionGroupsChange = (newGroups: OptionGroupItem[]) => {
    setOptionGroups(newGroups)
    setValue('optionGroups', newGroups, { shouldValidate: true })

    const newVariants = generateVariantMatrix(newGroups, variants)
    setVariants(newVariants)
    setValue('variants', newVariants, { shouldValidate: true })

    setServerErrors({})
  }

  const handleVariantsChange = (newVariants: VariantMatrixRow[]) => {
    setVariants(newVariants)
    setValue('variants', newVariants, { shouldValidate: true })
    setServerErrors({})
  }

  const handleModeChange = (variantMode: boolean) => {
    setHasVariants(variantMode)
    setValue('hasVariants', variantMode, { shouldValidate: true })
    setServerErrors({})
  }

  const onSubmit = async (values: ProductFormValues) => {
    setServerErrors({})
    const rawImages = typeof values.imageUrls === 'string' ? values.imageUrls : ''
    const imageUrls = rawImages
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter(Boolean)

    let basePrice = (values.price || '').trim()
    let totalStock = Number(values.stockQuantity) || 0
    let optionGroupsPayload: OptionGroupInput[] = []
    let variantsPayload: VariantInput[] = []

    if (hasVariants) {
      const activeVariants = variants.filter((v) => v.active)
      const validPrices = activeVariants
        .map((v) => Number(v.priceVND))
        .filter((p) => !isNaN(p) && p >= 0)

      if (validPrices.length > 0) {
        basePrice = String(Math.min(...validPrices))
      } else {
        const allPrices = variants
          .map((v) => Number(v.priceVND))
          .filter((p) => !isNaN(p) && p >= 0)
        basePrice = allPrices.length > 0 ? String(Math.min(...allPrices)) : '0'
      }

      totalStock = activeVariants.reduce((sum, v) => sum + (Number(v.stockQuantity) || 0), 0)

      optionGroupsPayload = optionGroups.map((g, gIdx) => ({
        id: g.id,
        label: g.label.trim(),
        position: g.position !== undefined ? g.position : gIdx,
        values: g.values.map((v, vIdx) => ({
          id: v.id,
          label: v.label.trim(),
          position: v.position !== undefined ? v.position : vIdx,
        })),
      }))

      variantsPayload = variants.map((v) => ({
        id: v.id,
        optionValueIds: v.optionValueIds,
        priceVND: (v.priceVND ?? '').trim(),
        stockQuantity: Number(v.stockQuantity) || 0,
        active: Boolean(v.active),
      }))
    }

    const payload: SaveProductRequest = {
      name: values.name.trim(),
      model: (values.model || '').trim(),
      brand: values.brand.trim(),
      categoryId: values.categoryId.trim(),
      price: basePrice,
      currency: 'VND',
      stockQuantity: totalStock,
      description: (values.description || '').trim(),
      featured: Boolean(values.featured),
      imageUrls,
      hasVariants,
      optionGroups: optionGroupsPayload,
      variants: variantsPayload,
    }

    try {
      if (isEdit && id) {
        await updateAdminProduct(id, payload)
      } else {
        await createAdminProduct(payload)
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
      navigate('/products')
    } catch (err) {
      if (err instanceof ApiError && err.isValidationError() && err.fields) {
        const normalizedFields: Record<string, string> = {}
        for (const [k, v] of Object.entries(err.fields)) {
          normalizedFields[k] = v
          const dotKey = k.replace(/\[(\d+)\]/g, '.$1')
          normalizedFields[dotKey] = v
          const bracketKey = k.replace(/\.(\d+)\./g, '[$1].')
          normalizedFields[bracketKey] = v
        }
        setServerErrors(normalizedFields)

        for (const [field, message] of Object.entries(err.fields)) {
          if (
            field === 'name' ||
            field === 'model' ||
            field === 'brand' ||
            field === 'categoryId' ||
            field === 'price' ||
            field === 'stockQuantity' ||
            field === 'description' ||
            field === 'imageUrls'
          ) {
            setError(field as keyof ProductFormInput, {
              type: 'server',
              message,
            })
          }
        }
      } else if (err instanceof ApiError) {
        setError('root', {
          type: 'server',
          message: err.message,
        })
      } else {
        setError('root', {
          type: 'server',
          message: 'Đã có lỗi xảy ra khi lưu thông tin sản phẩm. Vui lòng thử lại.',
        })
      }
    }
  }

  const flattenedErrors = buildFlattenedErrors(errors, serverErrors)

  if (isEdit && isProductLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-slate-200 animate-pulse" />
          <div className="space-y-2">
            <div className="h-6 w-48 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-72 bg-slate-100 rounded animate-pulse" />
          </div>
        </div>
        <Card className="animate-pulse">
          <CardContent className="p-6 space-y-4">
            <div className="h-5 w-40 bg-slate-200 rounded" />
            <div className="h-10 bg-slate-100 rounded-xl" />
            <div className="h-10 bg-slate-100 rounded-xl" />
            <div className="h-24 bg-slate-100 rounded-xl" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isEdit && isProductError) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Card className="border-rose-200 bg-rose-50/50">
          <CardContent className="p-8 flex flex-col items-center justify-center text-center">
            <div className="h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mb-3">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-rose-900">
              Không tìm thấy sản phẩm hoặc đã xảy ra lỗi
            </h3>
            <p className="text-sm text-rose-600 mt-1 max-w-md">
              {productError instanceof Error
                ? productError.message
                : 'Sản phẩm không tồn tại hoặc đã bị xóa khỏi hệ thống.'}
            </p>
            <Link to="/products" className="mt-4">
              <Button variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-100">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Quay lại danh sách sản phẩm
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header & Breadcrumb */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/products"
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
            title="Quay lại danh sách"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {isEdit ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới'}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {isEdit
                ? 'Cập nhật thông tin chi tiết của sản phẩm.'
                : 'Nhập thông tin sản phẩm để thêm vào danh mục bán lẻ.'}
            </p>
          </div>
        </div>
      </div>

      {/* Root Server Error Alert */}
      {errors.root && (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-900 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-rose-800">Không thể lưu thông tin</h4>
            <p className="text-sm text-rose-700 mt-0.5">{errors.root.message}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        {/* Basic Information Card */}
        <Card>
          <CardHeader>
            <CardTitle>Thông tin cơ bản</CardTitle>
            <CardDescription>
              Tên, thương hiệu, danh mục và mã định danh của sản phẩm.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Product Name */}
            <div>
              <Label htmlFor="product-name" required>
                Tên sản phẩm
              </Label>
              <div className="mt-1.5">
                <Input
                  id="product-name"
                  type="text"
                  placeholder="Ví dụ: iPhone 15 Pro Max 256GB"
                  error={Boolean(errors.name)}
                  {...register('name')}
                />
              </div>
              {errors.name && (
                <p className="text-xs text-rose-600 font-medium mt-1.5" role="alert">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Model */}
              <div>
                <Label htmlFor="product-model">Model / Mã kiểu máy</Label>
                <div className="mt-1.5">
                  <Input
                    id="product-model"
                    type="text"
                    placeholder="Ví dụ: A3106, SM-S928B..."
                    error={Boolean(errors.model)}
                    {...register('model')}
                  />
                </div>
                {errors.model && (
                  <p className="text-xs text-rose-600 font-medium mt-1.5" role="alert">
                    {errors.model.message}
                  </p>
                )}
              </div>

              {/* Free-text Brand */}
              <div>
                <Label htmlFor="product-brand" required>
                  Thương hiệu
                </Label>
                <div className="mt-1.5">
                  <Input
                    id="product-brand"
                    type="text"
                    placeholder="Ví dụ: Apple, Samsung, Xiaomi..."
                    error={Boolean(errors.brand)}
                    {...register('brand')}
                  />
                </div>
                {errors.brand && (
                  <p className="text-xs text-rose-600 font-medium mt-1.5" role="alert">
                    {errors.brand.message}
                  </p>
                )}
              </div>
            </div>

            {/* Category Select */}
            <div>
              <Label htmlFor="product-category" required>
                Danh mục
              </Label>
              <div className="mt-1.5">
                <Select
                  id="product-category"
                  error={Boolean(errors.categoryId)}
                  disabled={isCategoriesLoading}
                  {...register('categoryId')}
                >
                  <option value="">-- Chọn danh mục sản phẩm --</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </Select>
              </div>
              {errors.categoryId && (
                <p className="text-xs text-rose-600 font-medium mt-1.5" role="alert">
                  {errors.categoryId.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pricing & Sales Configuration Card */}
        <Card>
          <CardHeader>
            <CardTitle>Cấu hình bán hàng</CardTitle>
            <CardDescription>
              Chọn mô hình sản phẩm: sản phẩm đơn giản (giá và kho chung) hoặc sản phẩm có phân loại biến thể.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Mode Switcher Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                role="radio"
                aria-checked={!hasVariants}
                onClick={() => handleModeChange(false)}
                className={cn(
                  'p-4 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3.5',
                  !hasVariants
                    ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-600/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                )}
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 shrink-0 transition-colors',
                    !hasVariants ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                  )}
                >
                  {!hasVariants && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-blue-600" />
                    Sản phẩm đơn giản
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Một mức giá và số lượng tồn kho duy nhất cho toàn bộ sản phẩm.
                  </div>
                </div>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={hasVariants}
                onClick={() => handleModeChange(true)}
                className={cn(
                  'p-4 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3.5',
                  hasVariants
                    ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-600/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                )}
              >
                <div
                  className={cn(
                    'w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 shrink-0 transition-colors',
                    hasVariants ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                  )}
                >
                  {hasVariants && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-blue-600" />
                    Sản phẩm có biến thể
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Nhiều phân loại hàng (màu sắc, kích cỡ, dung lượng...) với giá và kho riêng.
                  </div>
                </div>
              </button>
            </div>

            {/* Simple Mode: Direct Price and Stock */}
            {!hasVariants && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                {/* Price */}
                <div>
                  <Label htmlFor="product-price" required>
                    Giá bán (VND)
                  </Label>
                  <div className="mt-1.5">
                    <Input
                      id="product-price"
                      type="number"
                      min="0"
                      step="1000"
                      placeholder="29990000"
                      error={Boolean(errors.price)}
                      {...register('price')}
                    />
                  </div>
                  {errors.price && (
                    <p className="text-xs text-rose-600 font-medium mt-1.5" role="alert">
                      {errors.price.message}
                    </p>
                  )}
                </div>

                {/* Stock Quantity */}
                <div>
                  <Label htmlFor="product-stock">Số lượng tồn kho</Label>
                  <div className="mt-1.5">
                    <Input
                      id="product-stock"
                      type="number"
                      min="0"
                      placeholder="0"
                      error={Boolean(errors.stockQuantity)}
                      {...register('stockQuantity')}
                    />
                  </div>
                  {errors.stockQuantity && (
                    <p className="text-xs text-rose-600 font-medium mt-1.5" role="alert">
                      {errors.stockQuantity.message}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Variant Mode: Option Groups Builder and Variant Matrix Table */}
            {hasVariants && (
              <div className="space-y-6 pt-2 border-t border-slate-100">
                {/* Option Groups Builder */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-slate-800">
                      Nhóm phân loại hàng <span className="text-rose-500">*</span>
                    </Label>
                  </div>
                  <OptionGroupBuilder
                    groups={optionGroups}
                    onChange={handleOptionGroupsChange}
                    errors={flattenedErrors}
                    disabled={isSubmitting}
                  />
                  {errors.optionGroups?.message && (
                    <p className="text-xs text-rose-600 font-medium mt-1" role="alert">
                      {errors.optionGroups.message}
                    </p>
                  )}
                </div>

                {/* Variant Matrix Table */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-slate-800">
                      Danh sách biến thể & Bảng giá <span className="text-rose-500">*</span>
                    </Label>
                  </div>
                  <VariantMatrixTable
                    variants={variants}
                    onChange={handleVariantsChange}
                    errors={flattenedErrors}
                    disabled={isSubmitting}
                  />
                  {errors.variants?.message && (
                    <p className="text-xs text-rose-600 font-medium mt-1" role="alert">
                      {errors.variants.message}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Description & Media Card */}
        <Card>
          <CardHeader>
            <CardTitle>Chi tiết & Hình ảnh</CardTitle>
            <CardDescription>
              Mô tả sản phẩm, danh sách đường dẫn hình ảnh và tùy chọn hiển thị nổi bật.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Description */}
            <div>
              <Label htmlFor="product-description">Mô tả sản phẩm</Label>
              <div className="mt-1.5">
                <Textarea
                  id="product-description"
                  rows={4}
                  placeholder="Nhập thông số kỹ thuật hoặc mô tả chi tiết sản phẩm..."
                  error={Boolean(errors.description)}
                  {...register('description')}
                />
              </div>
              {errors.description && (
                <p className="text-xs text-rose-600 font-medium mt-1.5" role="alert">
                  {errors.description.message}
                </p>
              )}
            </div>

            {/* Image URLs */}
            <div>
              <Label htmlFor="product-images">Danh sách URL hình ảnh</Label>
              <div className="mt-1.5">
                <Textarea
                  id="product-images"
                  rows={3}
                  placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg"
                  error={Boolean(errors.imageUrls)}
                  {...register('imageUrls')}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Nhập mỗi đường dẫn hình ảnh trên một dòng hoặc phân cách bởi dấu phẩy. URL đầu tiên sẽ được dùng làm ảnh đại diện chính.
              </p>
              {errors.imageUrls && (
                <p className="text-xs text-rose-600 font-medium mt-1.5" role="alert">
                  {errors.imageUrls.message}
                </p>
              )}
            </div>

            {/* Featured Switch */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center gap-3">
                <Switch
                  id="product-featured"
                  label="Đặt làm sản phẩm nổi bật trên trang chủ"
                  {...register('featured')}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link to="/products">
            <Button type="button" variant="outline" disabled={isSubmitting}>
              Hủy
            </Button>
          </Link>
          <Button type="submit" variant="primary" isLoading={isSubmitting} className="min-w-[140px]">
            <Save className="h-4 w-4 mr-1.5" />
            {isEdit ? 'Cập nhật sản phẩm' : 'Tạo sản phẩm'}
          </Button>
        </div>
      </form>
    </div>
  )
}
