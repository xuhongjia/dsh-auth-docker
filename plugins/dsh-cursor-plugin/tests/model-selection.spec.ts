import { describe, expect, it } from 'vitest'
import { parseModelSelection, withReasoningEffort } from '../src/model-selection.ts'

describe('parseModelSelection', () => {
  it('maps auto and empty ids to Cursor Auto', () => {
    expect(parseModelSelection('auto')).toEqual({
      id: 'default',
      params: [],
    })
    expect(parseModelSelection('').id).toBe('default')
  })

  it('applies defaultFast only to Composer ids', () => {
    expect(parseModelSelection('composer-2.5', { defaultFast: false }).params).toEqual([
      { id: 'fast', value: 'false' },
    ])
    expect(parseModelSelection('gpt-5.5', { defaultFast: false }).params).toEqual([])
  })

  it('parses context, fast, and thinking suffixes like pi-cursor-sdk', () => {
    expect(parseModelSelection('gpt-5.5@1m:fast:high')).toEqual({
      id: 'gpt-5.5',
      params: [
        { id: 'context', value: '1m' },
        { id: 'fast', value: 'true' },
        { id: 'thinking', value: 'true' },
        { id: 'effort', value: 'high' },
        { id: 'reasoning', value: 'high' },
      ],
    })
  })

  it('treats :slow as fast=false', () => {
    expect(parseModelSelection('composer-2.5:slow')).toEqual({
      id: 'composer-2.5',
      params: [{ id: 'fast', value: 'false' }],
    })
  })

  it('turns thinking off', () => {
    const selection = parseModelSelection('gpt-5.5:off')
    expect(selection.params).toEqual([
      { id: 'thinking', value: 'false' },
      { id: 'reasoning', value: 'none' },
    ])
  })
})

describe('withReasoningEffort', () => {
  it('appends OpenAI reasoning_effort when the id has no thinking suffix', () => {
    expect(withReasoningEffort('gpt-5.5@1m', 'high')).toBe('gpt-5.5@1m:high')
  })

  it('does not override an existing thinking suffix', () => {
    expect(withReasoningEffort('gpt-5.5:low', 'high')).toBe('gpt-5.5:low')
  })
})
