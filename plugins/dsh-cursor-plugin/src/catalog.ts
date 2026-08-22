import type { ModelSelection, ParseModelOptions } from './model-selection.ts'
import type { CursorListItem, ModelInfo } from './types.ts'
import { FALLBACK_CURSOR_ITEMS } from './fallback-models.ts'

const PI_REASONING_LEVELS = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
const LEVEL_ORDER = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

/** DSH llm-pi-ai model row: one picker line, reasoning as a separate control. */
export interface PickerModel {
  id: string
  name: string
  contextWindow?: number
  reasoningEfforts?: Record<string, string>
}

/**
 * One DSH picker row per Cursor catalog item.
 * Context / fast stay SDK defaults (largest window, plugin defaultFast).
 * Thinking uses DSH `reasoningEfforts`, not `:fast` / `@1m` model ids.
 */
export function expandModelCatalog(items: CursorListItem[]): ModelInfo[] {
  return pickerModelsFromCatalog(items).map((model) => ({
    id: model.id,
    name: model.name,
  }))
}

/** Bundled catalog when Cursor.models.list is empty or fails. */
export function fallbackModels(): ModelInfo[] {
  return expandModelCatalog(FALLBACK_CURSOR_ITEMS)
}

export function pickerModelsFromCatalog(items: CursorListItem[]): PickerModel[] {
  const source = items.length > 0 ? items : FALLBACK_CURSOR_ITEMS
  const seen = new Set<string>()
  const models: PickerModel[] = []
  for (const item of source) {
    if (typeof item.id !== 'string' || item.id.length === 0) continue
    if (item.id === 'auto' || seen.has(item.id)) continue
    seen.add(item.id)
    const name = typeof item.displayName === 'string' && item.displayName.length > 0
      ? item.displayName
      : item.id
    const model: PickerModel = { id: item.id, name }
    const contextWindow = maxContextTokens(item)
    if (contextWindow !== undefined) model.contextWindow = contextWindow
    const reasoningEfforts = reasoningEffortsFromItem(item)
    if (reasoningEfforts !== undefined) model.reasoningEfforts = reasoningEfforts
    models.push(model)
  }
  return models.length > 0
    ? models
    : items === FALLBACK_CURSOR_ITEMS
      ? [{ id: 'composer-2.5', name: 'Composer 2.5' }]
      : pickerModelsFromCatalog(FALLBACK_CURSOR_ITEMS)
}

export function findCatalogItem(
  items: readonly CursorListItem[],
  id: string,
): CursorListItem | undefined {
  return items.find((item) => item.id === id)
}

/**
 * Fill context / fast from the catalog when the picker id has no qualifier,
 * and drop SDK params the model does not advertise.
 */
export function applyCatalogDefaults(
  selection: ModelSelection,
  item: CursorListItem | undefined,
  options: ParseModelOptions = {},
): ModelSelection {
  if (item === undefined) return selection
  const allowed = parameterIds(item)
  const params = selection.params.filter((param) => allowed.has(param.id))
  if (!params.some((param) => param.id === 'context')) {
    const context = maxContextValue(item)
    if (context !== undefined) params.push({ id: 'context', value: context })
  }
  if (!params.some((param) => param.id === 'fast') && allowed.has('fast') && options.defaultFast !== undefined) {
    params.push({ id: 'fast', value: options.defaultFast ? 'true' : 'false' })
  }
  return { id: selection.id, params }
}

export function formatPiAiModelsYaml(models: PickerModel[]): string {
  return models.map((model) => {
    const lines = [
      `          - id: ${JSON.stringify(model.id)}`,
      `            name: ${JSON.stringify(model.name)}`,
    ]
    if (model.contextWindow !== undefined) {
      lines.push(`            contextWindow: ${String(model.contextWindow)}`)
    }
    if (model.reasoningEfforts !== undefined) {
      lines.push('            reasoningEfforts:')
      for (const level of LEVEL_ORDER) {
        if (model.reasoningEfforts[level] === undefined) continue
        lines.push(`              ${level}: ${model.reasoningEfforts[level]}`)
      }
    }
    return lines.join('\n')
  }).join('\n')
}

export function parameterValues(parameters: unknown, id: string): string[] {
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

function parameterIds(item: CursorListItem): Set<string> {
  return new Set(
    (Array.isArray(item.parameters) ? item.parameters : [])
      .map((parameter) => {
        if (parameter === null || typeof parameter !== 'object' || !('id' in parameter)) return ''
        return typeof parameter.id === 'string' ? parameter.id : ''
      })
      .filter((id) => id.length > 0),
  )
}

function maxContextValue(item: CursorListItem): string | undefined {
  const contexts = parameterValues(item.parameters, 'context')
  if (contexts.length === 0) return undefined
  return contexts.reduce((best, value) => (
    contextTokens(value) > contextTokens(best) ? value : best
  ))
}

function maxContextTokens(item: CursorListItem): number | undefined {
  const value = maxContextValue(item)
  return value === undefined ? undefined : contextTokens(value)
}

function contextTokens(value: string): number {
  const normalized = value.trim().toLowerCase()
  if (normalized.endsWith('m')) {
    const n = Number.parseFloat(normalized.slice(0, -1))
    return Number.isFinite(n) ? Math.round(n * 1_000_000) : 0
  }
  if (normalized.endsWith('k')) {
    const n = Number.parseFloat(normalized.slice(0, -1))
    return Number.isFinite(n) ? Math.round(n * 1000) : 0
  }
  const n = Number.parseInt(normalized, 10)
  return Number.isFinite(n) ? n : 0
}

function reasoningEffortsFromItem(item: CursorListItem): Record<string, string> | undefined {
  const thinking = parameterValues(item.parameters, 'thinking')
  const effort = parameterValues(item.parameters, 'effort')
  const reasoning = parameterValues(item.parameters, 'reasoning')
  if (thinking.length === 0 && effort.length === 0 && reasoning.length === 0) return undefined

  const efforts: Record<string, string> = {}
  if (reasoning.includes('none') || reasoning.includes('off')) {
    efforts.off = reasoning.includes('none') ? 'none' : 'off'
  } else {
    efforts.off = 'off'
  }

  const wires = effort.length > 0 ? effort : reasoning
  if (wires.length > 0) {
    for (const wire of wires) {
      const lower = wire.toLowerCase()
      if (lower === 'none' || lower === 'off') continue
      const key = lower === 'extra-high' ? 'xhigh' : lower
      if (PI_REASONING_LEVELS.has(key)) efforts[key] = wire
    }
  } else if (thinking.includes('true')) {
    efforts.high = 'high'
  }

  return Object.keys(efforts).some((level) => level !== 'off') ? efforts : undefined
}
