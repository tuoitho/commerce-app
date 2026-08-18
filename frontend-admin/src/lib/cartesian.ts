export interface OptionValueItem {
  id: string
  label: string
  position?: number
}

export interface OptionGroupItem {
  id: string
  label: string
  position?: number
  values: OptionValueItem[]
}

export interface VariantMatrixRow {
  id?: string
  optionValueIds: Record<string, string>
  combinationKey: string
  combinationLabel: string
  priceVND: string
  stockQuantity: number
  active: boolean
}

export function buildCombinationKey(optionValueIds: Record<string, string>): string {
  const sortedKeys = Object.keys(optionValueIds).sort()
  return sortedKeys.map((key) => `${key}:${optionValueIds[key]}`).join('|')
}

export function buildCombinationLabel(
  optionValueIds: Record<string, string>,
  optionGroups: OptionGroupItem[]
): string {
  const labels: string[] = []
  for (const group of optionGroups) {
    const valueId = optionValueIds[group.id]
    if (valueId) {
      const val = group.values.find((v) => v.id === valueId)
      if (val) {
        labels.push(val.label)
      }
    }
  }
  return labels.join(' / ')
}

/**
 * Generates Cartesian product matrix of variants from option groups,
 * reconciling with any existing variant definitions to preserve prices, stock, and IDs.
 */
export function generateVariantMatrix(
  optionGroups: OptionGroupItem[],
  existingVariants?: Partial<VariantMatrixRow>[]
): VariantMatrixRow[] {
  // Only process valid groups that have non-empty labels and at least 1 value
  const activeGroups = optionGroups.filter(
    (g) => g.label.trim() !== '' && g.values && g.values.length > 0
  )

  if (activeGroups.length === 0) {
    return []
  }

  // Cartesian product accumulator
  let combinations: { groupId: string; valueId: string; label: string }[][] = [[]]

  for (const group of activeGroups) {
    const nextCombinations: { groupId: string; valueId: string; label: string }[][] = []
    for (const current of combinations) {
      for (const val of group.values) {
        if (val.label.trim() !== '') {
          nextCombinations.push([
            ...current,
            { groupId: group.id, valueId: val.id, label: val.label },
          ])
        }
      }
    }
    combinations = nextCombinations
  }

  if (combinations.length === 0) {
    return []
  }

  return combinations.map((combo) => {
    const optionValueIds: Record<string, string> = {}
    for (const item of combo) {
      optionValueIds[item.groupId] = item.valueId
    }

    const key = activeGroups.map((g) => `${g.id}:${optionValueIds[g.id]}`).join('|')
    const label = activeGroups
      .map((g) => combo.find((c) => c.groupId === g.id)?.label ?? '')
      .join(' / ')

    // Reconcile with existing variants
    const match = existingVariants?.find((ev) => {
      if (!ev.optionValueIds) return false
      const evKeys = Object.keys(ev.optionValueIds)
      const currentKeys = Object.keys(optionValueIds)
      if (evKeys.length !== currentKeys.length) return false
      return currentKeys.every((k) => ev.optionValueIds?.[k] === optionValueIds[k])
    })

    if (match) {
      const rawPrice =
        match.priceVND !== undefined
          ? String(match.priceVND)
          : (match as Record<string, unknown>).priceVnd !== undefined
            ? String((match as Record<string, unknown>).priceVnd)
            : ''

      return {
        id: match.id || crypto.randomUUID(),
        optionValueIds,
        combinationKey: key,
        combinationLabel: label,
        priceVND: rawPrice,
        stockQuantity: typeof match.stockQuantity === 'number' ? match.stockQuantity : 0,
        active: typeof match.active === 'boolean' ? match.active : true,
      }
    }

    return {
      id: crypto.randomUUID(),
      optionValueIds,
      combinationKey: key,
      combinationLabel: label,
      priceVND: '',
      stockQuantity: 0,
      active: true,
    }
  })
}

/**
 * Bulk applies price and/or stock quantity across an entire array of variants.
 */
export function applyBulkValues(
  variants: VariantMatrixRow[],
  bulk: { priceVND?: string; stockQuantity?: number }
): VariantMatrixRow[] {
  return variants.map((v) => {
    const updated = { ...v }
    if (bulk.priceVND !== undefined && bulk.priceVND.trim() !== '') {
      updated.priceVND = bulk.priceVND.trim()
    }
    if (bulk.stockQuantity !== undefined && !isNaN(bulk.stockQuantity)) {
      updated.stockQuantity = bulk.stockQuantity
    }
    return updated
  })
}
