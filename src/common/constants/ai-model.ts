export const AI_MODEL_PRICING = {
  'gpt-4o': { promptCostPer1K: 0.005, completionCostPer1K: 0.015 },
  'gpt-4o-mini': { promptCostPer1K: 0.00015, completionCostPer1K: 0.0006 },
  'gpt-4-turbo': { promptCostPer1K: 0.01, completionCostPer1K: 0.03 },
  'claude-3-5-sonnet-20241022': { promptCostPer1K: 0.003, completionCostPer1K: 0.015 },
} as const;

export enum AiTask {
  FIRST_DRAFT = 'first_draft',
  FINAL_PROPOSAL_SECTION = 'final_proposal_section',
  COMPLIANCE_SCAN = 'compliance_scan',
  LEGAL_REVIEW = 'legal_review',
  CHAT_COPILOT = 'chat_copilot',
  AUTO_FIX = 'auto_fix',
  EMBEDDING = 'embedding',
}

export function selectOptimalModel(task: AiTask, orgPlan: string): string {
  switch (task) {
    case AiTask.FINAL_PROPOSAL_SECTION:
    case AiTask.LEGAL_REVIEW:
      if (orgPlan === 'enterprise') return 'gpt-4o';
      return 'claude-3-5-sonnet-20241022';
    case AiTask.COMPLIANCE_SCAN:
    case AiTask.AUTO_FIX:
      return 'gpt-4o-mini';
    case AiTask.FIRST_DRAFT:
      return orgPlan === 'enterprise' ? 'gpt-4o' : 'gpt-4o-mini';
    case AiTask.CHAT_COPILOT:
    case AiTask.EMBEDDING:
    default:
      return 'gpt-4o-mini';
  }
}

export function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = AI_MODEL_PRICING[model as keyof typeof AI_MODEL_PRICING];
  if (!pricing) return 0;
  return (promptTokens / 1000) * pricing.promptCostPer1K + (completionTokens / 1000) * pricing.completionCostPer1K;
}
