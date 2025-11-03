export interface ClarificationOption {
  id: string;
  label: string;
  value: string;
}

export interface ClarificationQuestion {
  id: string;
  text: string;
  options: ClarificationOption[];
}

export interface NextQuestionResponse {
  question: ClarificationQuestion;
}

export function isValidNextQuestion(payload: unknown): payload is NextQuestionResponse {
  if (typeof payload !== 'object' || payload === null) return false;
  const maybeQ = (payload as { question?: unknown }).question;
  if (typeof maybeQ !== 'object' || maybeQ === null) return false;
  const q = maybeQ as { id?: unknown; text?: unknown; options?: unknown };
  if (typeof q.id !== 'string' || !q.id) return false;
  if (typeof q.text !== 'string' || !q.text) return false;
  if (!Array.isArray(q.options) || q.options.length < 2) return false;
  for (const opt of q.options as unknown[]) {
    if (typeof opt !== 'object' || opt === null) return false;
    const o = opt as { id?: unknown; label?: unknown; value?: unknown };
    if (typeof o.id !== 'string' || typeof o.label !== 'string' || typeof o.value !== 'string') return false;
  }
  return true;
}
