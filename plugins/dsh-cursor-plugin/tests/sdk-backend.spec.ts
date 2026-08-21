import { describe, expect, it } from 'vitest'
import { DISALLOWED_CURSOR_TOOLS } from '../src/sdk-backend.ts'

/** Names accepted by Cursor Agent.create `disallowedTools` (invalid_request_error list). */
const CURSOR_AGENT_TOOL_NAMES = new Set([
  'adopt',
  'aiAttribution',
  'applyAgentDiff',
  'askQuestion',
  'await',
  'blameByFilePath',
  'communicateUpdate',
  'computerUse',
  'connectScm',
  'createAgent',
  'createGoal',
  'createPlan',
  'delete',
  'edit',
  'editPrLabels',
  'fetch',
  'fetchCloudAgentData',
  'generateImage',
  'getAgentStatus',
  'getMcpTools',
  'glob',
  'grep',
  'listMcpResources',
  'ls',
  'mcp',
  'mcpAuth',
  'piBash',
  'piEdit',
  'piFind',
  'piGrep',
  'piLs',
  'piRead',
  'piWrite',
  'prManagement',
  'read',
  'readAgentTranscript',
  'readLints',
  'readMcpResource',
  'readTodos',
  'recordCiInvestigationFindings',
  'recordScreen',
  'reflect',
  'replaceEnv',
  'reportBug',
  'reportBugfixResults',
  'searchConversations',
  'semSearch',
  'sendFinalSummary',
  'sendMessage',
  'sendToAgent',
  'sendToUser',
  'setActiveBranch',
  'setupVmEnvironment',
  'shell',
  'startGrindExecution',
  'startGrindPlanning',
  'stopAgent',
  'switchMode',
  'task',
  'truncated',
  'updateGoal',
  'updatePrCodeTour',
  'updateTodos',
  'webFetch',
  'webSearch',
  'writeShellStdin',
])

describe('DISALLOWED_CURSOR_TOOLS', () => {
  it('only uses Cursor Agent.create tool names', () => {
    for (const name of DISALLOWED_CURSOR_TOOLS) {
      expect(CURSOR_AGENT_TOOL_NAMES.has(name), name).toBe(true)
    }
  })

  it('does not block mcp at Agent.create', () => {
    expect(DISALLOWED_CURSOR_TOOLS).not.toContain('mcp')
    expect(DISALLOWED_CURSOR_TOOLS).not.toContain('bash')
    expect(DISALLOWED_CURSOR_TOOLS).not.toContain('web_search')
  })
})
