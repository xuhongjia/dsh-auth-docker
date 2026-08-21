import type { CursorListItem, ModelInfo } from './types.ts'
import { FALLBACK_CURSOR_ITEMS } from './fallback-models.ts'

/**
 * Expand a Cursor.models.list catalog into llm-pi-ai ids.
 * Qualifiers match pi-cursor-sdk: `@context`, `:fast` / `:slow`.
 * Ambiguous short aliases are omitted so the DSH picker stays one row per model.
 */
export function expandModelCatalog(items: CursorListItem[]): ModelInfo[] {
  const seen = new Set<string>()
  const models: ModelInfo[] = []
  const add = (id: string, name: string): void => {
    if (id.length === 0 || seen.has(id)) return
    seen.add(id)
    models.push({ id, name })
  }

  for (const item of items) {
    if (typeof item.id !== 'string' || item.id.length === 0) continue
    const display = typeof item.displayName === 'string' && item.displayName.length > 0
      ? item.displayName
      : item.id
    add(item.id, display)
    const contexts = parameterValues(item.parameters, 'context')
    const hasFast = parameterValues(item.parameters, 'fast').length > 0
    for (const context of contexts.length > 0 ? contexts : [undefined]) {
      const qualified = context === undefined ? item.id : `${item.id}@${context}`
      const contextName = context === undefined ? display : `${display} @ ${context}`
      add(qualified, contextName)
      if (hasFast) {
        add(`${qualified}:fast`, `${contextName} (fast)`)
        add(`${qualified}:slow`, `${contextName} (slow)`)
      }
    }
  }
  return models.length > 0
    ? models
    : items === FALLBACK_CURSOR_ITEMS
      ? [{ id: 'composer-2.5', name: 'Composer 2.5' }]
      : fallbackModels()
}

/** Bundled catalog when Cursor.models.list is empty or fails. */
export function fallbackModels(): ModelInfo[] {
  return expandModelCatalog(FALLBACK_CURSOR_ITEMS)
}

function parameterValues(parameters: unknown, id: string): string[] {
  if (!Array.isArray(parameters)) return []
  for (const parameter of parameters) {
    if (parameter === null || typeof parameter !== 'object') continue
    const record = parameter as { id?: unknown; values?: unknown }
    if (record.id !== id || !Array.isArray(record.values)) continue
    return record.values
      .map((row) => {
        if (row === null || typeof row !== 'object' || !('value' in row)) return ''
        const value = (row as { value?: unknown }).value
        return typeof value === 'string' ? value : ''
      })
      .filter((value) => value.length > 0)
  }
  return []
}
