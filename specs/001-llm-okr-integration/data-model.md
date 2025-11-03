# Data Model

## Entities

### ClarificationContext
- turns: ClarificationTurn[] (ordered)
- notes: string[] (optional)

### ClarificationTurn
- questionId: string
- optionId: string
- timestamp: string (ISO8601)

### ClarificationQuestion
- id: string
- text: string
- options: ClarificationOption[] (2–6 items)

### ClarificationOption
- id: string
- label: string
- value: string

### OkrDraft
- objectives: Objective[] (initially 1)
- assumptions: string[] (optional)
- notes: string (optional)

### Objective
- id: string
- title: string
- description: string
- keyResults: KeyResult[] (3–5 items)

### KeyResult
- id: string
- statement: string
- target: string | number
- measurement: string

## Validation Rules
- ClarificationQuestion.options length 2–6
- OkrDraft.objectives initial length = 1 (user may add more later)
- Objective.keyResults length 3–5
- All ids non-empty; timestamps valid ISO8601

## Relationships
- ClarificationContext.turns reference ClarificationQuestion/Option ids
- OkrDraft.objectives[].keyResults[] belong to their parent Objective
