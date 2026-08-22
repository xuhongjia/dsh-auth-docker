import type { CursorListItem } from './types.ts'

type ParamSpec = {
  optimizeFor?: boolean
  thinking?: boolean
  context?: string[]
  effort?: string[]
  reasoning?: string[]
  fast?: boolean
}

type CatalogParameter = {
  id: string
  values: Array<{ value: string }>
}

function values(list: string[]): Array<{ value: string }> {
  return list.map((value) => ({ value }))
}

function parameters(spec: ParamSpec): CatalogParameter[] {
  const rows: CatalogParameter[] = []
  if (spec.optimizeFor === true) {
    rows.push({ id: 'optimize_for', values: values(['intelligence', 'balanced', 'cost']) })
  }
  if (spec.thinking === true) {
    rows.push({ id: 'thinking', values: values(['false', 'true']) })
  }
  if (spec.context !== undefined) {
    rows.push({ id: 'context', values: values(spec.context) })
  }
  if (spec.effort !== undefined) {
    rows.push({ id: 'effort', values: values(spec.effort) })
  }
  if (spec.reasoning !== undefined) {
    rows.push({ id: 'reasoning', values: values(spec.reasoning) })
  }
  if (spec.fast === true) {
    rows.push({ id: 'fast', values: values(['true', 'false']) })
  }
  return rows
}

const EFFORT_FULL = ['low', 'medium', 'high', 'xhigh', 'max']
const EFFORT_MAX = ['low', 'medium', 'high', 'max']
const GPT_REASONING = ['none', 'low', 'medium', 'high', 'extra-high']
const GPT56_REASONING = ['none', 'low', 'medium', 'high', 'xhigh', 'max']

/**
 * Bundled Cursor catalog (pi-cursor-sdk fallback snapshot, public metadata only).
 * Live `Cursor.models.list` replaces this when the dashboard key works.
 * DSH picker lists one row per id; context / fast / thinking are SDK params.
 */
export const FALLBACK_CURSOR_ITEMS: CursorListItem[] = [
  { id: 'default', displayName: 'Cursor Auto', parameters: [] },
  {
    id: 'composer-2.5',
    displayName: 'Composer 2.5',
    aliases: ['composer-latest', 'composer', 'composer-2-5'],
    parameters: parameters({ fast: true }),
  },
  {
    id: 'composer-2',
    displayName: 'Composer 2',
    parameters: parameters({ fast: true }),
  },
  {
    id: 'auto-smart',
    displayName: 'Auto',
    parameters: parameters({ optimizeFor: true }),
  },
  {
    id: 'claude-fable-5',
    displayName: 'Claude Fable 5',
    aliases: ['fable', 'fable-5'],
    parameters: parameters({ thinking: true, context: ['300k', '1m'], effort: EFFORT_FULL }),
  },
  {
    id: 'claude-haiku-4-5',
    displayName: 'Claude Haiku 4.5',
    aliases: ['haiku-latest', 'haiku', 'haiku-4.5', 'haiku-4-5'],
    parameters: parameters({ thinking: true }),
  },
  {
    id: 'claude-opus-4-5',
    displayName: 'Claude Opus 4.5',
    aliases: ['opus-4.5', 'opus-4-5'],
    parameters: parameters({ thinking: true }),
  },
  {
    id: 'claude-opus-4-6',
    displayName: 'Claude Opus 4.6',
    aliases: ['opus-4.6', 'opus-4-6'],
    parameters: parameters({ thinking: true, context: ['200k', '1m'], effort: EFFORT_MAX }),
  },
  {
    id: 'claude-opus-4-7',
    displayName: 'Claude Opus 4.7',
    aliases: ['opus-4.7', 'opus-4-7'],
    parameters: parameters({ thinking: true, context: ['300k', '1m'], effort: EFFORT_FULL, fast: true }),
  },
  {
    id: 'claude-opus-4-8',
    displayName: 'Claude Opus 4.8',
    aliases: ['opus-4.8', 'opus-4-8'],
    parameters: parameters({ thinking: true, context: ['300k', '1m'], effort: EFFORT_FULL, fast: true }),
  },
  {
    id: 'claude-opus-5',
    displayName: 'Claude Opus 5',
    aliases: ['opus-5'],
    parameters: parameters({ thinking: true, context: ['300k', '1m'], effort: EFFORT_FULL, fast: true }),
  },
  {
    id: 'claude-sonnet-4',
    displayName: 'Claude Sonnet 4',
    aliases: ['sonnet-4'],
    parameters: parameters({ thinking: true, context: ['200k'] }),
  },
  {
    id: 'claude-sonnet-4-5',
    displayName: 'Claude Sonnet 4.5',
    aliases: ['sonnet-4.5', 'sonnet-4-5'],
    parameters: parameters({ thinking: true, context: ['200k'] }),
  },
  {
    id: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    aliases: ['sonnet-4.6', 'sonnet-4-6'],
    parameters: parameters({ thinking: true, context: ['200k', '1m'], effort: EFFORT_MAX }),
  },
  {
    id: 'claude-sonnet-5',
    displayName: 'Claude Sonnet 5',
    aliases: ['sonnet-5'],
    parameters: parameters({ thinking: true, context: ['300k', '1m'], effort: EFFORT_FULL }),
  },
  { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', aliases: ['gemini-flash'], parameters: [] },
  { id: 'gemini-3-flash', displayName: 'Gemini 3 Flash', parameters: [] },
  {
    id: 'gemini-3.1-pro',
    displayName: 'Gemini 3.1 Pro',
    aliases: ['gemini-latest', 'gemini-pro-latest', 'gemini', 'gemini-pro'],
    parameters: [],
  },
  { id: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', parameters: [] },
  {
    id: 'gemini-3.6-flash',
    displayName: 'Gemini 3.6 Flash',
    parameters: parameters({ effort: ['minimal', 'low', 'medium', 'high'] }),
  },
  {
    id: 'gemini-3.7-flash',
    displayName: 'Gemini 3.7 Flash',
    parameters: parameters({ effort: ['low', 'medium', 'high'] }),
  },
  {
    id: 'glm-5.2',
    displayName: 'GLM 5.2',
    parameters: parameters({ reasoning: ['high', 'max'] }),
  },
  { id: 'gpt-5-mini', displayName: 'GPT-5 Mini', aliases: ['gpt-mini'], parameters: [] },
  {
    id: 'gpt-5.1',
    displayName: 'GPT-5.1',
    parameters: parameters({ reasoning: ['low', 'medium', 'high'] }),
  },
  {
    id: 'gpt-5.2',
    displayName: 'GPT-5.2',
    parameters: parameters({ reasoning: ['low', 'medium', 'high', 'extra-high'], fast: true }),
  },
  {
    id: 'gpt-5.3-codex',
    displayName: 'Codex 5.3',
    aliases: ['codex-latest', 'codex', 'codex-5.3'],
    parameters: parameters({ reasoning: ['low', 'medium', 'high', 'extra-high'], fast: true }),
  },
  {
    id: 'gpt-5.4',
    displayName: 'GPT-5.4',
    parameters: parameters({ context: ['272k', '1m'], reasoning: GPT_REASONING, fast: true }),
  },
  {
    id: 'gpt-5.4-mini',
    displayName: 'GPT-5.4 Mini',
    aliases: ['gpt-mini-latest'],
    parameters: parameters({ reasoning: ['none', 'low', 'medium', 'high', 'xhigh'] }),
  },
  {
    id: 'gpt-5.4-nano',
    displayName: 'GPT-5.4 Nano',
    aliases: ['gpt-nano-latest', 'gpt-nano'],
    parameters: parameters({ reasoning: ['none', 'low', 'medium', 'high', 'xhigh'] }),
  },
  {
    id: 'gpt-5.5',
    displayName: 'GPT-5.5',
    aliases: ['gpt-5-5'],
    parameters: parameters({ context: ['272k', '1m'], reasoning: GPT_REASONING, fast: true }),
  },
  {
    id: 'gpt-5.6-luna',
    displayName: 'GPT-5.6 Luna',
    aliases: ['gpt-5-6-luna'],
    parameters: parameters({ context: ['272k', '1m'], reasoning: GPT56_REASONING, fast: true }),
  },
  {
    id: 'gpt-5.6-sol',
    displayName: 'GPT-5.6 Sol',
    aliases: ['gpt-latest', 'gpt-5-6-sol', 'gpt-5.6'],
    parameters: parameters({ context: ['272k', '1m'], reasoning: GPT56_REASONING, fast: true }),
  },
  {
    id: 'gpt-5.6-terra',
    displayName: 'GPT-5.6 Terra',
    aliases: ['gpt-5-6-terra'],
    parameters: parameters({ context: ['272k', '1m'], reasoning: GPT56_REASONING, fast: true }),
  },
  {
    id: 'grok-4.5',
    displayName: 'Cursor Grok 4.5',
    parameters: parameters({ effort: ['low', 'medium', 'high'], fast: true }),
  },
  {
    id: 'grok-4.6',
    displayName: 'Cursor Grok 4.6',
    parameters: parameters({ effort: ['low', 'medium', 'high', 'xhigh'], fast: true }),
  },
  {
    id: 'kimi-k2.7-code',
    displayName: 'Kimi K2.7 Code',
    aliases: ['kimi-latest', 'kimi'],
    parameters: [],
  },
  {
    id: 'kimi-k3',
    displayName: 'Kimi K3',
    parameters: parameters({ reasoning: ['low', 'high', 'max'] }),
  },
]
