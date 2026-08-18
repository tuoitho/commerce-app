import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, FolderTree, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { createCategory, deleteCategory, getAdminCategories, updateCategory } from '@/api/categories'
import { ApiError, type Category } from '@/api/types'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const queryKey = ['admin', 'categories']

function apiMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback
  if (error.code === 'category_name_in_use') return 'Tên danh mục đã tồn tại trên hệ thống.'
  if (error.code === 'category_in_use') return 'Danh mục đang có sản phẩm sử dụng, không thể xoá.'
  if (error.code === 'category_not_found' || error.status === 404) return 'Không tìm thấy danh mục.'
  return fallback
}

export function CategoriesPage() {
  const queryClient = useQueryClient()
  const { data: categories = [], isLoading, isError, refetch, isFetching } = useQuery({ queryKey, queryFn: getAdminCategories })
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<Category | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [editFieldError, setEditFieldError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const refresh = () => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] }),
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] }),
    ])
  }
  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => { setName(''); setFieldError(null); setMessage('Đã tạo danh mục thành công.'); setErrorMessage(null); refresh() },
    onError: (err) => { setFieldError(err instanceof ApiError && err.isValidationError() ? err.fields?.name || 'Tên danh mục không hợp lệ.' : null); setErrorMessage(apiMessage(err, 'Không thể tạo danh mục. Vui lòng thử lại.')) },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => updateCategory(id, { name: value }),
    onSuccess: () => { setEditing(null); setEditFieldError(null); setMessage('Đã đổi tên danh mục thành công.'); setErrorMessage(null); refresh() },
    onError: (err) => { setEditFieldError(err instanceof ApiError && err.isValidationError() ? err.fields?.name || 'Tên danh mục không hợp lệ.' : null); setErrorMessage(apiMessage(err, 'Không thể đổi tên danh mục. Vui lòng thử lại.')) },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: (_deleted, id) => { setDeleteTarget(null); setMessage('Xoá danh mục thành công'); setErrorMessage(null); queryClient.setQueryData<Category[]>(queryKey, (current = []) => current.filter((category) => category.id !== id)); refresh() },
    onError: (err) => setErrorMessage(apiMessage(err, 'Không thể xóa danh mục. Vui lòng thử lại.')),
  })

  const submitCreate = (event: FormEvent) => {
    event.preventDefault(); setMessage(null); setErrorMessage(null)
    const value = name.trim()
    if (!value) { setFieldError('Vui lòng nhập tên danh mục.'); return }
    setFieldError(null); createMutation.mutate({ name: value })
  }
  const submitEdit = (event: FormEvent) => {
    event.preventDefault(); setMessage(null); setErrorMessage(null)
    const value = editingName.trim()
    if (!value) { setEditFieldError('Vui lòng nhập tên danh mục.'); return }
    if (editing) { setEditFieldError(null); updateMutation.mutate({ id: editing.id, value }) }
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-xl font-bold text-slate-900">Quản lý danh mục</h1><p className="mt-1 text-sm text-slate-500">Tạo và quản lý các danh mục sản phẩm.</p></div>
      {message && <div role="status" className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{message}</span><button type="button" aria-label="Đóng thông báo" onClick={() => setMessage(null)}><X className="h-4 w-4" /></button></div>}
      {errorMessage && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</div>}

      <Card><CardHeader><CardTitle className="text-base">Thêm danh mục</CardTitle></CardHeader><CardContent>
        <form onSubmit={submitCreate} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1"><Label htmlFor="category-name" required>Tên danh mục</Label><Input id="category-name" value={name} onChange={(e) => { setName(e.target.value); setFieldError(null) }} aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? 'category-name-error' : undefined} placeholder="Ví dụ: Điện thoại" className="mt-2" />{fieldError && <p id="category-name-error" className="mt-1 text-xs text-rose-600">{fieldError}</p>}</div>
          <Button type="submit" variant="primary" isLoading={createMutation.isPending}><Plus className="h-4 w-4" />Thêm danh mục</Button>
        </form>
      </CardContent></Card>

      <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">Danh sách danh mục</CardTitle><Button type="button" variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} aria-label="Làm mới danh sách"><RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /></Button></CardHeader><CardContent className="p-0">
        {isError && categories.length === 0 ? <div className="flex flex-col items-center p-10 text-center"><AlertCircle className="mb-3 h-8 w-8 text-rose-500" /><p className="font-semibold">Không thể tải danh sách danh mục</p><p className="mt-1 text-sm text-slate-500">Không thể tải danh sách danh mục. Vui lòng thử lại sau.</p><Button className="mt-4" variant="outline" onClick={() => refetch()}>Thử lại</Button></div> : <Table><TableHeader><TableRow><TableHead className="w-28">ID</TableHead><TableHead>Tên danh mục</TableHead><TableHead className="w-32 text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>{isLoading ? <TableRow><TableCell colSpan={3} className="p-10 text-center text-sm text-slate-500">Đang tải danh mục...</TableCell></TableRow> : categories.length === 0 ? <TableRow><TableCell colSpan={3} className="p-10 text-center"><FolderTree className="mx-auto mb-3 h-9 w-9 text-slate-400" /><p className="font-semibold">Chưa có danh mục nào</p><p className="mt-1 text-sm text-slate-500">Hãy tạo danh mục đầu tiên bằng biểu mẫu ở trên.</p></TableCell></TableRow> : categories.map((category) => <TableRow key={category.id}><TableCell className="font-mono text-xs text-slate-500">{category.id}</TableCell><TableCell className="font-medium">{editing?.id === category.id ? <form onSubmit={submitEdit} className="flex max-w-md items-start gap-2"><div className="flex-1"><Input aria-label={`Tên danh mục ${category.name}`} value={editingName} onChange={(e) => { setEditingName(e.target.value); setEditFieldError(null) }} aria-invalid={Boolean(editFieldError)} aria-describedby={editFieldError ? 'category-edit-name-error' : undefined} />{editFieldError && <p id="category-edit-name-error" role="alert" className="mt-1 text-xs text-rose-600">{editFieldError}</p>}</div><Button type="submit" size="sm" variant="primary" isLoading={updateMutation.isPending}>Lưu</Button><Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(null); setEditFieldError(null) }}>Hủy</Button></form> : category.name}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="iconSm" aria-label={`Đổi tên ${category.name}`} onClick={() => { setEditing(category); setEditingName(category.name); setEditFieldError(null); setErrorMessage(null) }}><Pencil className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="iconSm" aria-label={`Xóa ${category.name}`} onClick={() => { setDeleteTarget(category); setErrorMessage(null) }}><Trash2 className="h-4 w-4 text-rose-500" /></Button></div></TableCell></TableRow>)}</TableBody></Table>}
      </CardContent></Card>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Xác nhận xóa danh mục</AlertDialogTitle><AlertDialogDescription>Bạn có chắc chắn muốn xóa danh mục <strong>{deleteTarget?.name}</strong> không?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={deleteMutation.isPending}>Hủy</AlertDialogCancel><AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} isLoading={deleteMutation.isPending}>Xóa</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  )
}
