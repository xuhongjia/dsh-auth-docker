import type { ModelInfo } from './types.ts'
import { DEFAULT_MODEL } from './model-selection.ts'

/** Loose Cursor.models.list row. Extra fields are ignored. */
export interface CursorListItem {
  id?: unknown
  displayName?: unknown
  aliases?: unknown
  parameters?: unknown
}

const FALLBACK_MODELS: ModelInfo[] = [
  { id: 'auto', name: 'Cursor Auto' },
  { id: DEFAULT_MODEL, name: 'Composer 2.5' },
  { id: `${DEFAULT_MODEL}:slow`, name: 'Composer 2.5 (slow)' },
]

/**
 * Expand a live Cursor catalog into llm-pi-ai selectable ids.
 * Context variants become `id@1m`; fast-capable models also get `:fast` / `:slow`.
 */
export function expandModelCatalog(items: CursorListItem[]): ModelInfo[] {
  const seen = new Set<string>()
  const models: ModelInfo[] = []
  const add = (id: string, name: string): void => {
    if (id.length === 0 || seen.has(id)) return
    seen.add(id)
    models.push({ id, name })
  }

  add('auto', 'Cursor Auto')
  for (const item of items) {
    if (typeof item.id !== 'string' || item.id.length === 0) continue
    const display = typeof item.displayName === 'string' && item.displayName.length > 0
      ? item.displayName
      : item.id
    add(item.id, display)
    if (Array.isArray(item.aliases)) {
      for (const alias of item.aliases) {
        if (typeof alias === 'string' && alias.length > 0 && alias !== item.id) {
          add(alias, `${display} (${alias})`)
        }
      }
    }
    const contexts = parameterValues(item.parameters, 'context')
    const hasFast = parameterValues(item.parameters, 'fast').length > 0
    const bases = [item.id, ...selectableAliases(item)]
    for (const base of bases) {
      for (const context of contexts.length > 0 ? contexts : [undefined]) {
        const qualified = context === undefined ? base : `${base}@${context}`
        const contextName = context === undefined ? display : `${display} @ ${context}`
        add(qualified, contextName)
        if (hasFast) {
          add(`${qualified}:fast`, `${contextName} (fast)`)
          add(`${qualified}:slow`, `${contextName} (slow)`)
        }
      }
    }
  }
  return models.length > 1 ? models : FALLBACK_MODELS
}

export function fallbackModels(): ModelInfo[] {
  return [...FALLBACK_MODELS]
}

function selectableAliases(item: CursorListItem): string[] {
  if (!Array.isArray(item.aliases)) return []
  return item.aliases.filter((alias): alias is string => typeof alias === 'string' && alias.length > 0)
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
