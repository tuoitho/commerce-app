import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { OptionGroup, ProductVariant } from '../api/catalog'
import VariantSelector from './VariantSelector'
import { findMatchingVariant, parseVariantSelection, serializeVariantSelection } from './variantSelection'

const groups: OptionGroup[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    label: 'Color',
    position: 1,
    values: [
      { id: '21111111-1111-4111-8111-111111111111', label: 'Black' },
      { id: '31111111-1111-4111-8111-111111111111', label: 'Silver' },
    ],
  },
  {
    id: '41111111-1111-4111-8111-111111111111',
    label: 'Storage',
    position: 2,
    values: [
      { id: '51111111-1111-4111-8111-111111111111', label: '128 GB' },
      { id: '61111111-1111-4111-8111-111111111111', label: '256 GB' },
    ],
  },
]

const variants: ProductVariant[] = [
  {
    id: 'v1',
    optionValueIds: { [groups[0].id]: groups[0].values[0].id, [groups[1].id]: groups[1].values[0].id },
    priceVnd: '1',
    stockQuantity: 1n,
  },
  {
    id: 'v2',
    optionValueIds: { [groups[0].id]: groups[0].values[1].id, [groups[1].id]: groups[1].values[1].id },
    priceVnd: '2',
    stockQuantity: 1n,
  },
]

describe('VariantSelector', () => {
  it('renders every dynamic option group without selecting a default', () => {
    const onChange = vi.fn()
    render(<VariantSelector optionGroups={groups} variants={variants} selection={{}} onChange={onChange} />)

    expect(screen.getByRole('group', { name: 'Color' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Storage' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Black' })).toHaveAttribute('aria-pressed', 'false')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables values incompatible with the other selected groups', () => {
    render(
      <VariantSelector
        optionGroups={groups}
        variants={variants}
        selection={{ [groups[0].id]: groups[0].values[0].id }}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '128 GB' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '256 GB' })).toBeDisabled()
  })

  it('keeps the selected value enabled and clears it when clicked again', () => {
    const onChange = vi.fn()
    render(
      <VariantSelector
        optionGroups={groups}
        variants={variants}
        selection={{ [groups[0].id]: groups[0].values[0].id, [groups[1].id]: groups[1].values[1].id }}
        onChange={onChange}
      />,
    )

    const selected = screen.getByRole('button', { name: 'Black' })
    expect(selected).toBeEnabled()
    fireEvent.click(selected)
    expect(onChange).toHaveBeenCalledWith(groups[0].id, '')
  })

  it('allows switching disconnected branches by clearing a conflicting selection', () => {
    let currentSelection = {
      [groups[0].id]: groups[0].values[0].id,
      [groups[1].id]: groups[1].values[0].id,
    }
    function ControlledSelector() {
      const [selection, setSelection] = useState(currentSelection)
      return (
        <VariantSelector
          optionGroups={groups}
          variants={variants}
          selection={selection}
          onChange={(groupId, valueId) => {
            const nextSelection = { ...selection }
            if (valueId) nextSelection[groupId] = valueId
            else delete nextSelection[groupId]
            currentSelection = nextSelection
            setSelection(nextSelection)
          }}
        />
      )
    }

    render(
      <ControlledSelector />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Black' }))
    expect(currentSelection).toEqual({ [groups[1].id]: groups[1].values[0].id })
    fireEvent.click(screen.getByRole('button', { name: '128 GB' }))
    expect(currentSelection).toEqual({})
    expect(screen.getByRole('button', { name: '256 GB' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Silver' }))
    fireEvent.click(screen.getByRole('button', { name: '256 GB' }))
    expect(currentSelection).toEqual({
      [groups[0].id]: groups[0].values[1].id,
      [groups[1].id]: groups[1].values[1].id,
    })
    expect(findMatchingVariant(variants, currentSelection)).toBe(variants[1])
  })

  it('returns a variant only when every option produces one exact match', () => {
    expect(findMatchingVariant(variants, {
      [groups[0].id]: groups[0].values[0].id,
      [groups[1].id]: groups[1].values[0].id,
    })).toBe(variants[0])
    expect(findMatchingVariant(variants, { [groups[0].id]: groups[0].values[0].id })).toBeNull()
  })
})

describe('variant selection URL helpers', () => {
  it('serializes repeated options and ignores invalid or foreign product IDs', () => {
    const query = serializeVariantSelection(
      {
        [groups[0].id]: groups[0].values[0].id,
        '71111111-1111-4111-8111-111111111111': groups[1].values[0].id,
        [groups[1].id]: 'not-a-value',
      },
      groups,
    )

    expect(query.getAll('option')).toEqual([`${groups[0].id}:${groups[0].values[0].id}`])
  })

  it('restores only valid product-owned options from repeated query params', () => {
    const params = new URLSearchParams()
    params.append('option', `${groups[0].id}:${groups[0].values[0].id}`)
    params.append('option', 'bad-group:bad-value')
    params.append('option', `${groups[1].id}:not-a-value`)

    expect(parseVariantSelection(params, groups)).toEqual({ [groups[0].id]: groups[0].values[0].id })
  })
})
