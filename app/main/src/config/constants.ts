/**
 * Constants configuration for ClarificationController
 * Centralizes all magic values, templates, and hardcoded strings
 */

export const CLARIFICATION_CONFIG = {
  // Template for generating objective from intent summary
  objectiveTemplate: (intent: string) => `围绕"${intent}"提升执行成效`,

  // Default objective when LLM draft is missing title/description
  defaultObjective: '自动生成的目标',

  // Key result templates with placeholders
  keyResults: {
    first: {
      statementTemplate: (intent: string) => `为"${intent}"设定可衡量的流程节奏`,
      successMetric: '每周复盘 1 次',
      owner: '团队负责人',
    },
    second: {
      statementTemplate: (intent: string) => `建立 ${intent} 成果指标追踪`,
      successMetric: '关键指标提升 15%',
      owner: undefined,
    },
  },

  // Session statuses
  sessionStatus: {
    collecting: 'collecting',
    completed: 'completed',
  } as const,

  // Prompt contexts and tags
  prompt: {
    context: 'LLM generated',
    scopeTag: 'llm',
    initQuestionId: 'init',
  },

  // Option identifiers
  options: {
    unknown: 'unknown',
  },

  // OKR document defaults
  okrDefaults: {
    regenerationPolicy: 'append' as const,
    lastEditedAt: null as null,
    manualEdits: [] as unknown[],
    maxKeyResultsFromDraft: 5,
  },

  // Confidence values
  confidence: {
    completionThreshold: 0.9,
  },

  // Error messages
  errors: {
    emptyLlmResponse: 'Empty or invalid response from LLM service',
    missingQuestionFields: 'LLM response missing required question fields',
    noActiveSession: 'No active session found for OKR generation.',
    sessionNotFound: (id: string, available: string) =>
      `No active session found for LLM draft generation. Session ID: ${id}`,
    missingDraftObjectives: 'LLM draft response missing required objectives field',
    missingObjectiveTitleOrDescription: 'LLM draft objective missing required title or description',
    failedToGeneratePrompt: (msg: string) => `Failed to generate clarification prompt: ${msg}`,
    failedToGetNextQuestion: (msg: string) => `Failed to get next question: ${msg}`,
    failedToGenerateDraft: (msg: string) => `Failed to generate OKR draft: ${msg}`,
  },
} as const;

// Type for session status values
export type SessionStatus =
  (typeof CLARIFICATION_CONFIG.sessionStatus)[keyof typeof CLARIFICATION_CONFIG.sessionStatus];
