import { describe, expect, it } from 'vitest'
import { expandModelCatalog, fallbackModels } from '../src/catalog.ts'

describe('expandModelCatalog', () => {
  it('always expands context plus fast aliases on the canonical id', () => {
    const models = expandModelCatalog([{
      id: 'gpt-5.5',
      displayName: 'GPT-5.5',
      aliases: ['gpt-5.5-latest'],
      parameters: [
        { id: 'context', values: [{ value: '1m' }, { value: '272k' }] },
        { id: 'fast', values: [{ value: 'true' }, { value: 'false' }] },
      ],
    }])
    const ids = models.map((model) => model.id)
    expect(ids).toContain('gpt-5.5')
    expect(ids).toContain('gpt-5.5@1m')
    expect(ids).toContain('gpt-5.5@1m:slow')
    expect(ids).not.toContain('gpt-5.5-latest')
  })

  it('falls back to the bundled Cursor catalog when the live list is empty', () => {
    const models = expandModelCatalog([])
    const ids = models.map((model) => model.id)
    expect(ids).toEqual(fallbackModels().map((model) => model.id))
    expect(ids).toContain('composer-2.5')
    expect(ids).toContain('gpt-5.5')
    expect(ids).toContain('grok-4.6:slow')
  })
})
