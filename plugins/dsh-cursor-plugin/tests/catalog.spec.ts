import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  applyCatalogDefaults,
  expandModelCatalog,
  fallbackModels,
  findCatalogItem,
  formatPiAiModelsYaml,
  pickerModelsFromCatalog,
} from '../src/catalog.ts'
import { FALLBACK_CURSOR_ITEMS } from '../src/fallback-models.ts'
import { parseModelSelection } from '../src/model-selection.ts'

describe('expandModelCatalog', () => {
  it('lists one DSH picker row per Cursor model, without @context or :fast ids', () => {
    const models = expandModelCatalog([{
      id: 'gpt-5.5',
      displayName: 'GPT-5.5',
      aliases: ['gpt-5.5-latest'],
      parameters: [
        { id: 'context', values: [{ value: '1m' }, { value: '272k' }] },
        { id: 'fast', values: [{ value: 'true' }, { value: 'false' }] },
        { id: 'reasoning', values: [{ value: 'none' }, { value: 'high' }] },
      ],
    }])
    expect(models.map((model) => model.id)).toEqual(['gpt-5.5'])
    expect(models[0]?.name).toBe('GPT-5.5')
  })

  it('falls back to the bundled Cursor catalog when the live list is empty', () => {
    const models = expandModelCatalog([])
    const ids = models.map((model) => model.id)
    expect(ids).toEqual(fallbackModels().map((model) => model.id))
    expect(ids).toContain('composer-2.5')
    expect(ids).toContain('gpt-5.5')
    expect(ids).not.toContain('grok-4.6:slow')
    expect(ids).not.toContain('auto')
  })
})

describe('pickerModelsFromCatalog', () => {
  it('declares DSH reasoningEfforts and the largest context window', () => {
    const [model] = pickerModelsFromCatalog([
      findCatalogItem(FALLBACK_CURSOR_ITEMS, 'gpt-5.5')!,
    ])
    expect(model?.contextWindow).toBe(1_000_000)
    expect(model?.reasoningEfforts).toMatchObject({
      off: 'none',
      low: 'low',
      high: 'high',
      xhigh: 'extra-high',
    })
  })

  it('keeps cordis.patch.yml in sync with the DSH picker catalog', () => {
    const patch = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../cordis.patch.yml'),
      'utf8',
    )
    const generated = formatPiAiModelsYaml(pickerModelsFromCatalog(FALLBACK_CURSOR_ITEMS))
    expect(patch).toContain(generated)
    expect(patch).not.toMatch(/id: "[^"]+@/)
  })
})

describe('applyCatalogDefaults', () => {
  it('sends the largest context and slow fast when the picker id has no qualifier', () => {
    const item = findCatalogItem(FALLBACK_CURSOR_ITEMS, 'gpt-5.5')
    const selection = applyCatalogDefaults(
      parseModelSelection('gpt-5.5', { defaultFast: false }),
      item,
      { defaultFast: false },
    )
    expect(selection).toEqual({
      id: 'gpt-5.5',
      params: [
        { id: 'context', value: '1m' },
        { id: 'fast', value: 'false' },
      ],
    })
  })

  it('keeps only SDK params the model advertises after a thinking suffix', () => {
    const item = findCatalogItem(FALLBACK_CURSOR_ITEMS, 'gpt-5.5')
    const selection = applyCatalogDefaults(
      parseModelSelection('gpt-5.5:high', { defaultFast: false }),
      item,
      { defaultFast: false },
    )
    expect(selection.params).toEqual([
      { id: 'reasoning', value: 'high' },
      { id: 'context', value: '1m' },
      { id: 'fast', value: 'false' },
    ])
  })
})
