import type { CursorListItem } from './types.ts'

/**
 * Bundled Cursor catalog (pi-cursor-sdk fallback snapshot, public metadata only).
 * Live `Cursor.models.list` replaces this when the dashboard key works.
 */
export const FALLBACK_CURSOR_ITEMS: CursorListItem[] = [
  { id: 'default', displayName: 'Cursor Auto', parameters: [] },
  {
    id: 'composer-2.5',
    displayName: 'Composer 2.5',
    aliases: ['composer-latest', 'composer', 'composer-2-5'],
    parameters: [{ id: 'fast', values: [{ value: 'true' }, { value: 'false' }] }],
  },
  {
    id: 'composer-2',
    displayName: 'Composer 2',
    parameters: [{ id: 'fast', values: [{ value: 'true' }, { value: 'false' }] }],
  },
  { id: 'auto-smart', displayName: 'Auto', parameters: [] },
  {
    id: 'claude-fable-5',
    displayName: 'Claude Fable 5',
    aliases: ['fable', 'fable-5'],
    parameters: [
      { id: 'context', values: [{ value: '300k' }, { value: '1m' }] },
    ],
  },
  {
    id: 'claude-haiku-4-5',
    displayName: 'Claude Haiku 4.5',
    aliases: ['haiku-latest', 'haiku', 'haiku-4.5', 'haiku-4-5'],
    parameters: [],
  },
  {
    id: 'claude-opus-4-5',
    displayName: 'Claude Opus 4.5',
    aliases: ['opus-4.5', 'opus-4-5'],
    parameters: [],
  },
  {
    id: 'claude-opus-4-6',
    displayName: 'Claude Opus 4.6',
    aliases: ['opus-4.6', 'opus-4-6'],
    parameters: [
      { id: 'context', values: [{ value: '200k' }, { value: '1m' }] },
    ],
  },
  {
    id: 'claude-opus-4-7',
    displayName: 'Claude Opus 4.7',
    aliases: ['opus-4.7', 'opus-4-7'],
    parameters: [
      { id: 'context', values: [{ value: '300k' }, { value: '1m' }] },
      { id: 'fast', values: [{ value: 'true' }, { value: 'false' }] },
    ],
  },
  {
    id: 'claude-opus-4-8',
    displayName: 'Claude Opus 4.8',
    aliases: ['opus-4.8', 'opus-4-8'],
    parameters: [
      { id: 'context', values: [{ value: '300k' }, { value: '1m' }] },
      { id: 'fast', values: [{ value: 'true' }, { value: 'false' }] },
    ],
  },
  {
    id: 'claude-opus-5',
    displayName: 'Claude Opus 5',
    aliases: ['opus-5'],
    parameters: [
      { id: 'context', values: [{ value: '300k' }, { value: '1m' }] },
      { id: 'fast', values: [{ value: 'true' }, { value: 'false' }] },
    ],
  },
  {
    id: 'claude-sonnet-4',
    displayName: 'Claude Sonnet 4',
    aliases: ['sonnet-4'],
    parameters: [{ id: 'context', values: [{ value: '200k' }] }],
  },
  {
    id: 'claude-sonnet-4-5',
    displayName: 'Claude Sonnet 4.5',
    aliases: ['sonnet-4.5', 'sonnet-4-5'],
    parameters: [{ id: 'context', values: [{ value: '200k' }] }],
  },
  {
    id: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    aliases: ['sonnet-4.6', 'sonnet-4-6'],
    parameters: [{ id: 'context', values: [{ value: '200k' }, { value: '1m' }] }],
  },
  {
    id: 'claude-sonnet-5',
    displayName: 'Claude Sonnet 5',
    aliases: ['sonnet-5'],
    parameters: [{ id: 'context', values: [{ value: '300k' }, { value: '1m' }] }],
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
  { id: 'gemini-3.6-flash', displayName: 'Gemini 3.6 Flash', parameters: [] },
  { id: 'gemini-3.7-flash', displayName: 'Gemini 3.7 Flash', parameters: [] },
  { id: 'glm-5.2', displayName: 'GLM 5.2', parameters: [] },
  { id: 'gpt-5-mini', displayName: 'GPT-5 Mini', aliases: ['gpt-mini'], parameters: [] },
  { id: 'gpt-5.1', displayName: 'GPT-5.1', parameters: [] },
  {
    id: 'gpt-5.2',
    displayName: 'GPT-5.2',
    parameters: [{ id: 'fast', values: [{ value: 'true' }, { value: 'false' }] }],
  },
  {
    id: 'gpt-5.3-codex',
    displayName: 'Codex 5.3',
    aliases: ['codex-latest', 'codex', 'codex-5.3'],
    parameters: [{ id: 'fast', values: [{ value: 'true' }, { value: 'false' }] }],
  },
  {
    id: 'gpt-5.4',
    displayName: 'GPT-5.4',
    parameters: [
      { id: 'context', values: [{ value: '272k' }, { value: '1m' }] },
      { id: 'fast', values: [{ value: 'true' }, { value: 'false' }] },
    ],
  },
  {
    id: 'gpt-5.4-mini',
    displayName: 'GPT-5.4 Mini',
    aliases: ['gpt-mini-latest'],
    parameters: [],
  },
  {
    id: 'gpt-5.4-nano',
    displayName: 'GPT-5.4 Nano',
    aliases: ['gpt-nano-latest', 'gpt-nano'],
    parameters: [],
  },
  {
    id: 'gpt-5.5',
    displayName: 'GPT-5.5',
    aliases: ['gpt-5-5'],
    parameters: [
      { id: 'context', values: [{ value: '272k' }, { value: '1m' }] },
      { id: 'fast', values: [{ value: 'true' }, { value: 'false' }] },
    ],
  },
  {
    id: 'gpt-5.6-luna',
    displayName: 'GPT-5.6 Luna',
    aliases: ['gpt-5-6-luna'],
    parameters: [
      { id: 'context', values: [{ value: '272k' }, { value: '1m' }] },
      { id: 'fast', values: [{ value: 'true' }, { value: 'false' }] },
    ],
  },
  {
    id: 'gpt-5.6-sol',
    displayName: 'GPT-5.6 Sol',
    aliases: ['gpt-latest', 'gpt-5-6-sol', 'gpt-5.6'],
    parameters: [
      { id: 'context', values: [{ value: '272k' }, { value: '1m' }] },
      { id: 'fast', values: [{ value: 'true' }, { value: 'false' }] },
    ],
  },
  {
    id: 'gpt-5.6-terra',
    displayName: 'GPT-5.6 Terra',
    aliases: ['gpt-5-6-terra'],
    parameters: [
      { id: 'context', values: [{ value: '272k' }, { value: '1m' }] },
      { id: 'fast', values: [{ value: 'true' }, { value: 'false' }] },
    ],
  },
  {
    id: 'grok-4.5',
    displayName: 'Cursor Grok 4.5',
    parameters: [{ id: 'fast', values: [{ value: 'true' }, { value: 'false' }] }],
  },
  {
    id: 'grok-4.6',
    displayName: 'Cursor Grok 4.6',
    parameters: [{ id: 'fast', values: [{ value: 'true' }, { value: 'false' }] }],
  },
  {
    id: 'kimi-k2.7-code',
    displayName: 'Kimi K2.7 Code',
    aliases: ['kimi-latest', 'kimi'],
    parameters: [],
  },
  { id: 'kimi-k3', displayName: 'Kimi K3', parameters: [] },
]
