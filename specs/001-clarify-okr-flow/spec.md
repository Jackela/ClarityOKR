# Feature Specification: Clarify-to-OKR Desktop Flow

**Feature Branch**: `001-clarify-okr-flow`  
**Created**: 2025-10-31  
**Status**: Draft  
**Input**: User description: "为 ClarityOKR 项目定义核心功能规范。这是一个桌面 GUI 应用，帮助用户将模糊意图转化为清晰的 OKR。User Story 1 (P1 - 澄清流程): 作为用户，我能输入一个模糊的目标（例如“提高效率”）。系统（Agent）必须接管流程，通过一系列问答来澄清我的意图。系统必须以按钮形式提供 2-5 个互斥选项，我通过点击按钮来回答。Agent 会根据我的回答提出下一个问题，直到意图清晰，然后显示一个“生成 OKR”按钮。User Story 2 (P2 - 可视化与置顶): 作为用户，在我点击“生成 OKR”后，我希望看到一个轻量级的“便签”窗口被创建。这个窗口必须始终显示在其他所有应用的顶层（置顶）。窗口内以列表或树形结构显示 Agent 生成的 Objective 和 Key Results。User Story 3 (P3 - 修改与控制): 作为用户，我希望能有一个“编辑”按钮或菜单选项。点击后，便签窗口中的 OKR 文本变为可编辑状态，允许我手动微调 AI 生成的内容，并保存我的修改。功能需求 (FRs) 必须包括：FR1: 初始意图输入界面。FR2: Agent 主导的、基于选项的澄清工作流。FR3: OKR 结果的可视化（列表/树形）。FR4: 窗口必须具备“始终置顶” (Always-on-Top) 功能。FR5: 必须提供一个“编辑模式”以允许用户手动修改最终文本。FR6: 必须有一个“重新生成”功能。FR7: 必须有一个“复制到剪贴板”功能。"

## Clarifications

### Session 2025-10-31

- Q: Should the clarification session and generated OKR persist if the user closes and later reopens the desktop app? → A: Persist locally across relaunch

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Guided Clarification Interview (Priority: P1)

As a goal owner with only a vague objective, I can enter my intent and be led through a sequence of multiple-choice clarifying questions until the system understands my goal and offers to generate an OKR.

**Why this priority**: Without a reliable clarification process, the app cannot deliver meaningful OKRs, so this flow is foundational to user value.

**Independent Test**: Start a new session with an ambiguous goal, answer button-driven prompts until the system confirms readiness, and verify that a “生成 OKR” action becomes available with a clear summary of the clarified intent.

**Acceptance Scenarios**:

1. **Given** a user enters an ambiguous goal, **When** the agent presents 2-5 exclusive buttons per question and the user selects answers, **Then** the agent asks follow-up questions until it confirms the intent and enables the “生成 OKR” button.
2. **Given** the agent offers the next question, **When** there are insufficient distinguished options, **Then** the agent displays a validation message and regenerates mutually exclusive options before progressing.

---

### User Story 2 - Sticky OKR Visualization (Priority: P2)

As a user who has generated an OKR, I can view the AI-produced Objective and Key Results in a lightweight sticky window that always stays above other applications so I can reference it while working.

**Why this priority**: Keeping the OKR visible drives adoption and ensures the generated plan stays actionable without losing focus.

**Independent Test**: Trigger OKR generation, confirm a new sticky window appears with Objective and Key Results rendered hierarchically, and ensure the window remains top-most while switching between other desktop apps.

**Acceptance Scenarios**:

1. **Given** the user selects “生成 OKR”, **When** the OKR note opens, **Then** the window displays the Objective and each Key Result in a list or tree and remains on top of other open apps until the user closes or minimizes it.

---

### User Story 3 - Editable OKR Control (Priority: P3)

As a user reviewing the OKR note, I can enter an edit mode that lets me refine the Objective or Key Result text, save my changes, and optionally regenerate the AI proposal without losing my manual edits.

**Why this priority**: Manual control increases trust and allows teams to tailor AI output to their language and commitments.

**Independent Test**: In the sticky window, toggle edit mode, adjust text, save it, and confirm the display reflects the edits while “重新生成” and “复制到剪贴板” still operate correctly.

**Acceptance Scenarios**:

1. **Given** the OKR note is visible, **When** the user enables edit mode, **Then** each Objective and Key Result field becomes editable, changes can be saved, and the saved version persists when returning to view mode.
2. **Given** the user has edited the OKR, **When** they choose “重新生成”, **Then** the system prompts whether to overwrite or append, and proceeds according to the user’s choice while logging the action.

---

### Edge Cases

- User dismisses or times out during the clarification flow before intent is confirmed.  
- Agent cannot confidently generate distinct answer options (e.g., conflicting intents).  
- User closes or hides the sticky window and needs to reopen it without losing progress.  
- Clipboard action fails because of OS permission restrictions.  
- Regeneration request occurs after manual edits that have not yet been saved.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an initial intent input screen where users submit vague goals in natural language.  
- **FR-002**: System MUST run an agent-led clarification workflow that surfaces 2-5 mutually exclusive button options per step and adapts questions based on selections.  
- **FR-003**: System MUST generate and render Objectives and Key Results in a hierarchical or list view within the OKR note once clarification is complete.  
- **FR-004**: The OKR note window MUST remain always-on-top above other desktop applications until the user intentionally dismisses or minimizes it.  
- **FR-005**: System MUST provide an edit mode that makes the Objective and Key Result text directly editable and allows users to save manual revisions.  
- **FR-006**: System MUST include a “重新生成” control that rebuilds the OKR from the latest clarified intent while preserving the option to keep or overwrite manual edits.  
- **FR-007**: System MUST offer a “复制到剪贴板” action that copies the current OKR text in a structured format.  
- **FR-008**: Shared interface definitions for clarification prompts, responses, and OKR payloads MUST be sourced from the central contract package and versioned when modified.  
- **FR-009**: System MUST retain the clarification history and latest OKR content for the active session, persisting locally so it reloads automatically when the desktop app restarts.  
- **FR-010**: System MUST record user-triggered actions (generate, regenerate, edit save, copy) for auditability and training insights.

### Key Entities *(include if feature involves data)*

- **ClarificationSession**: Captures the initial intent, ordered question-and-answer pairs, and agent confidence signals used to determine readiness for OKR generation.  
- **OKRDocument**: Represents a single Objective with associated Key Results, the generation timestamp, the manual edit history, and current display state.  
- **UserActionLog**: Records user-triggered events (generate, regenerate, edit, copy) with contextual metadata for analytics and training feedback loops.

## Assumptions

- Desktop experience targets macOS and Windows users who rely on a mouse/trackpad for button selection.  
- Users operate a single ClarificationSession at a time; parallel sessions can be deferred to later roadmap work.  
- Manual edits apply to the current OKRDocument only and are not synchronized to other workspaces until a future sharing feature.
- Session and OKR data persist locally between app launches; cloud sync remains out of scope for this release.

## Shared TypeScript Interfaces *(mandatory for contract changes)*

- **Interface Package**: ClarityOKR shared contract library  
- **Change Summary**: Introduce ClarificationSession, ClarificationPrompt, ClarificationOption, OKRDocument, and OKRActionLog data shapes along with status values for window state and regeneration handling.  
- **Consumer Impact**: Desktop experience layer for presentation, agent orchestration service for question sequencing, and analytics capability for action logging.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 90% of first-time users produce a ready-to-review OKR within five clarification steps or fewer.  
- **SC-002**: In usability testing, the sticky OKR window remains visible above other applications in 100% of task switches across supported operating systems.  
- **SC-003**: At least 85% of pilot participants report the OKR output as “clear” or better after using edit mode to tailor language.  
- **SC-004**: 95% of copy-to-clipboard attempts result in a correctly formatted OKR payload that can be pasted into external productivity tools without additional cleanup.
