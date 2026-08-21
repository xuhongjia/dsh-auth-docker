import { describe, expect, it } from 'vitest'
import { expandModelCatalog, fallbackModels } from '../src/catalog.ts'

describe('expandModelCatalog', () => {
  it('always includes auto and expands context plus fast aliases', () => {
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
    expect(ids).toContain('auto')
    expect(ids).toContain('gpt-5.5')
    expect(ids).toContain('gpt-5.5@1m')
    expect(ids).toContain('gpt-5.5@1m:slow')
    expect(ids).toContain('gpt-5.5-latest@272k:fast')
  })

  it('falls back when the live list is empty', () => {
    expect(expandModelCatalog([])).toEqual(fallbackModels())
  })
})
