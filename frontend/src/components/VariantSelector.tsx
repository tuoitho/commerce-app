import type { OptionGroup, ProductVariant } from '../api/catalog'
import type { VariantSelection } from './variantSelection'

interface VariantSelectorProps {
  optionGroups: OptionGroup[]
  variants: ProductVariant[]
  selection: VariantSelection
  onChange(groupId: string, valueId: string): void
}


function isValueEnabled(
  groupId: string,
  valueId: string,
  variants: ProductVariant[],
  selection: VariantSelection,
): boolean {
  if (selection[groupId] === valueId) return true
  return variants.some((variant) =>
    variant.optionValueIds[groupId] === valueId &&
    Object.entries(selection).every(([selectedGroupId, selectedValueId]) =>
      selectedGroupId === groupId || variant.optionValueIds[selectedGroupId] === selectedValueId,
    ),
  )
}

export default function VariantSelector({ optionGroups, variants, selection, onChange }: VariantSelectorProps) {
  return (
    <div className="variant-selector">
      {optionGroups.map((group) => (
        <fieldset key={group.id} className="variant-group">
          <legend>{group.label}</legend>
          <div className="variant-values">
            {group.values.map((value) => {
              const selected = selection[group.id] === value.id
              return (
                <button
                  key={value.id}
                  type="button"
                  className={selected ? 'variant-value selected' : 'variant-value'}
                  aria-pressed={selected}
                  disabled={!isValueEnabled(group.id, value.id, variants, selection)}
                  onClick={() => onChange(group.id, selected ? '' : value.id)}
                >
                  {value.label}
                </button>
              )
            })}
          </div>
        </fieldset>
      ))}
    </div>
  )
}
