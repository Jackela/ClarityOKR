export interface KeyResult {
  id: string;
  statement: string;
  target: string | number;
  measurement: string;
}

export interface Objective {
  id: string;
  title: string;
  description: string;
  keyResults: KeyResult[];
}

export interface OkrDraft {
  objectives: Objective[];
  assumptions?: string[];
  notes?: string[];
}

export interface OkrDraftResponse {
  draft: OkrDraft;
}

export function isValidDraft(payload: unknown): payload is OkrDraftResponse {
  if (typeof payload !== 'object' || payload === null) return false;
  const d = (payload as { draft?: unknown }).draft;
  if (typeof d !== 'object' || d === null) return false;
  const draft = d as { objectives?: unknown };
  if (!Array.isArray(draft.objectives) || draft.objectives.length < 1) return false;
  const first = draft.objectives[0] as unknown;
  if (typeof first !== 'object' || first === null) return false;
  const obj = first as { keyResults?: unknown };
  if (!Array.isArray(obj.keyResults) || obj.keyResults.length < 3) return false;
  for (const kr of obj.keyResults as unknown[]) {
    if (typeof kr !== 'object' || kr === null) return false;
    const k = kr as { id?: unknown; statement?: unknown; measurement?: unknown; target?: unknown };
    if (
      typeof k.id !== 'string' ||
      typeof k.statement !== 'string' ||
      typeof k.measurement !== 'string'
    )
      return false;
    if (!(typeof k.target === 'string' || typeof k.target === 'number')) return false;
  }
  return true;
}
