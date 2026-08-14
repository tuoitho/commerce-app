import type { OptionGroup, ProductVariant } from '../api/catalog'

export type VariantSelection = Record<string, string>

const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function productValues(optionGroups: OptionGroup[]): Map<string, Set<string>> {
  return new Map(optionGroups.map((group) => [group.id, new Set(group.values.map((value) => value.id))]))
}

export function serializeVariantSelection(selection: VariantSelection, optionGroups: OptionGroup[]): URLSearchParams {
  const valuesByGroup = productValues(optionGroups)
  const params = new URLSearchParams()
  for (const group of optionGroups) {
    const valueId = selection[group.id]
    if (
      canonicalUuidPattern.test(group.id) &&
      valueId &&
      canonicalUuidPattern.test(valueId) &&
      valuesByGroup.get(group.id)?.has(valueId)
    ) {
      params.append('option', `${group.id}:${valueId}`)
    }
  }
  return params
}

export function parseVariantSelection(search: string | URLSearchParams, optionGroups: OptionGroup[]): VariantSelection {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  const valuesByGroup = productValues(optionGroups)
  const selection: VariantSelection = {}
  for (const entry of params.getAll('option')) {
    const separator = entry.indexOf(':')
    if (separator < 0) continue
    const groupId = entry.slice(0, separator)
    const valueId = entry.slice(separator + 1)
    if (
      canonicalUuidPattern.test(groupId) &&
      canonicalUuidPattern.test(valueId) &&
      valuesByGroup.get(groupId)?.has(valueId)
    ) {
      selection[groupId] = valueId
    }
  }
  return selection
}

export function findMatchingVariant(variants: ProductVariant[], selection: VariantSelection): ProductVariant | null {
  const selectedGroups = Object.keys(selection)
  if (selectedGroups.length === 0) {
    return variants.length === 1 && Object.keys(variants[0].optionValueIds).length === 0 ? variants[0] : null
  }
  if (selectedGroups.length === 0) return null
  const matches = variants.filter((variant) =>
    selectedGroups.every((groupId) => variant.optionValueIds[groupId] === selection[groupId]),
  )
  return matches.length === 1 && selectedGroups.length === Object.keys(matches[0].optionValueIds).length
    ? matches[0]
    : null
}
