# ClarityOKR Analytics Dashboard

## Overview

This document defines the analytics metrics, data schema, and dashboard specifications for understanding user behavior and application performance in ClarityOKR.

## 1. Metrics Definition

### 1.1 Conversion Funnel

Track user progression through the OKR creation workflow:

| Stage            | Event                     | Description                                   |
| ---------------- | ------------------------- | --------------------------------------------- |
| 1. Intent        | `intent_submitted`        | User enters their goal/objective              |
| 2. Clarification | `clarification_started`   | User begins answering clarification questions |
| 3. Progress      | `question_answered`       | User answers each question                    |
| 4. Completion    | `clarification_completed` | User answers all questions                    |
| 5. Generation    | `okr_generated`           | OKR is successfully generated                 |
| 6. Edit          | `okr_edited`              | User modifies the generated OKR               |
| 7. Copy/Save     | `okr_copied`              | User copies or saves the OKR                  |

**Conversion Rate Formula:**

```
Stage Conversion = (Users who reached stage N) / (Users who reached stage N-1)
Overall Conversion = (Users who copied/saved OKR) / (Users who submitted intent)
```

### 1.2 User Engagement Metrics

#### Step Completion Time

- **Metric:** `step_duration_ms`
- **Description:** Time spent on each clarification step
- **Aggregation:** Average, median, 95th percentile
- **Segmentation:** By question type, by step number

#### Option Selection Patterns

- **Metric:** `option_selected`
- **Data:** `{ questionId, optionId, optionLabel, position }`
- **Analysis:** Most/least popular options, correlation with completion

#### Drop-off Points

- **Metric:** `clarification_abandoned`
- **Data:** `{ stepNumber, questionId, totalSteps }`
- **Analysis:** Where users exit the flow

### 1.3 Edit Behavior

#### Edit Frequency

- **Metric:** `edit_session`
- **Data:** `{ okrId, editCount, fieldsModified, editDuration }`
- **Analysis:** How often users refine generated OKRs

#### Edit Types

- Objective modification
- Key result addition/removal
- Metric/owner changes
- Statement rewrites

### 1.4 Regenerate Patterns

#### Regeneration Events

- **Metric:** `okr_regenerated`
- **Data:** `{ originalOkrId, reason, iterationNumber }`
- **Analysis:** When and why users regenerate

#### Regeneration Reasons

- `dissatisfied_with_content`
- `clarification_incomplete`
- `manual_restart`
- `error_recovery`

### 1.5 Copy Usage

#### Copy Events

- **Metric:** `okr_copied`
- **Data:** `{ format, destination, timestamp }`
- **Formats:** plain_text, markdown, json

## 2. Dashboard Layout

### 2.1 Overview Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  CLARITYOKR ANALYTICS                          [Date Range] │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Sessions   │  │   Avg Time   │  │ Conversion   │     │
│  │    1,234     │  │   4m 32s    │  │    67.5%     │     │
│  │   +12.3%    │  │   -8.1%     │  │   +5.2%      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
├─────────────────────────────────────────────────────────────┤
│                    CONVERSION FUNNEL                        │
│                                                             │
│   Intent        Clarify       Generate       Copy          │
│   ████████      ██████        ████           ██            │
│   100%          78%           65%            42%           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  STEP COMPLETION TIME          │  POPULAR OPTIONS          │
│  ┌────────────────────────┐   │  ┌─────────────────────┐  │
│  │ Step 1: ████████ 45s   │   │  1. Productivity (45%)│  │
│  │ Step 2: ██████   32s   │   │  2. Quality    (32%)  │  │
│  │ Step 3: █████    28s   │   │  3. Growth     (23%)  │  │
│  │ ...                    │   │  ...                  │  │
│  └────────────────────────┘   │  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Detailed Metrics Views

#### User Behavior Heatmap

- X-axis: Hour of day (0-23)
- Y-axis: Day of week
- Color intensity: Number of sessions
- Hover: Session count, conversion rate

#### Edit Frequency Distribution

- Bar chart: Edit count per OKR
- Segments: 0 edits, 1-2 edits, 3-5 edits, 5+ edits
- Trend line: Over time

## 3. Data Schema

### 3.1 Telemetry Events Table

```sql
CREATE TABLE telemetry_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  session_id TEXT NOT NULL,
  user_id TEXT,
  timestamp INTEGER NOT NULL,

  -- Event-specific data (JSON)
  properties TEXT,

  -- Context
  app_version TEXT,
  platform TEXT,
  locale TEXT,

  -- Timings
  duration_ms INTEGER,

  -- Indexes
  INDEX idx_event_type (event_type),
  INDEX idx_session (session_id),
  INDEX idx_timestamp (timestamp),
  INDEX idx_user (user_id)
);
```

### 3.2 Sessions Table

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,

  -- Funnel progress
  reached_intent BOOLEAN DEFAULT FALSE,
  reached_clarification BOOLEAN DEFAULT FALSE,
  reached_generation BOOLEAN DEFAULT FALSE,
  reached_copy BOOLEAN DEFAULT FALSE,

  -- Metrics
  total_steps INTEGER,
  completed_steps INTEGER,
  total_duration_ms INTEGER,

  -- Context
  source TEXT,
  referrer TEXT
);
```

### 3.3 OKR Generation Table

```sql
CREATE TABLE okr_generations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT,

  -- Content
  objective TEXT,
  key_results_count INTEGER,

  -- Edit tracking
  edit_count INTEGER DEFAULT 0,
  regenerate_count INTEGER DEFAULT 0,

  -- Timestamps
  generated_at INTEGER NOT NULL,
  first_edit_at INTEGER,
  copied_at INTEGER,

  -- Status
  was_copied BOOLEAN DEFAULT FALSE,
  was_edited BOOLEAN DEFAULT FALSE,

  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

## 4. Query Examples

### 4.1 Conversion Funnel

```sql
-- Calculate funnel conversion rates
WITH funnel AS (
  SELECT
    COUNT(DISTINCT CASE WHEN reached_intent THEN id END) as intent_count,
    COUNT(DISTINCT CASE WHEN reached_clarification THEN id END) as clarification_count,
    COUNT(DISTINCT CASE WHEN reached_generation THEN id END) as generation_count,
    COUNT(DISTINCT CASE WHEN reached_copy THEN id END) as copy_count
  FROM sessions
  WHERE started_at >= :start_date
    AND started_at < :end_date
)
SELECT
  intent_count as total_sessions,
  ROUND(100.0 * clarification_count / intent_count, 2) as intent_to_clarify_pct,
  ROUND(100.0 * generation_count / clarification_count, 2) as clarify_to_generate_pct,
  ROUND(100.0 * copy_count / generation_count, 2) as generate_to_copy_pct,
  ROUND(100.0 * copy_count / intent_count, 2) as overall_conversion_pct
FROM funnel;
```

### 4.2 Average Step Duration

```sql
-- Average time spent per clarification step
SELECT
  json_extract(properties, '$.stepNumber') as step_number,
  json_extract(properties, '$.questionId') as question_id,
  COUNT(*) as completion_count,
  ROUND(AVG(duration_ms) / 1000.0, 2) as avg_duration_seconds,
  ROUND(MEDIAN(duration_ms) / 1000.0, 2) as median_duration_seconds,
  ROUND(MAX(duration_ms) / 1000.0, 2) as max_duration_seconds
FROM telemetry_events
WHERE event_type = 'question_answered'
  AND timestamp >= :start_date
  AND timestamp < :end_date
GROUP BY step_number, question_id
ORDER BY step_number;
```

### 4.3 Drop-off Analysis

```sql
-- Find where users abandon the process
SELECT
  json_extract(properties, '$.stepNumber') as abandoned_at_step,
  json_extract(properties, '$.totalSteps') as total_steps,
  COUNT(*) as drop_off_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as drop_off_percentage
FROM telemetry_events
WHERE event_type = 'clarification_abandoned'
  AND timestamp >= :start_date
  AND timestamp < :end_date
GROUP BY abandoned_at_step
ORDER BY drop_off_count DESC;
```

### 4.4 Popular Options

```sql
-- Most frequently selected options
SELECT
  json_extract(properties, '$.optionLabel') as option_label,
  json_extract(properties, '$.questionId') as question_id,
  COUNT(*) as selection_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY question_id), 2) as percentage
FROM telemetry_events
WHERE event_type = 'option_selected'
  AND timestamp >= :start_date
  AND timestamp < :end_date
GROUP BY option_label, question_id
ORDER BY selection_count DESC
LIMIT 20;
```

### 4.5 Edit Behavior Analysis

```sql
-- Analyze how users edit generated OKRs
SELECT
  CASE
    WHEN edit_count = 0 THEN 'No edits'
    WHEN edit_count BETWEEN 1 AND 2 THEN '1-2 edits'
    WHEN edit_count BETWEEN 3 AND 5 THEN '3-5 edits'
    ELSE '5+ edits'
  END as edit_frequency,
  COUNT(*) as okr_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage,
  ROUND(AVG(julianday(first_edit_at) - julianday(generated_at)) * 24 * 60, 2) as avg_minutes_to_first_edit
FROM okr_generations
WHERE generated_at >= :start_date
  AND generated_at < :end_date
GROUP BY edit_frequency
ORDER BY okr_count DESC;
```

## 5. Time-Series Analysis

### 5.1 Daily Metrics

```sql
-- Daily active users and conversion
SELECT
  date(timestamp / 1000, 'unixepoch') as day,
  COUNT(DISTINCT session_id) as daily_active_sessions,
  COUNT(DISTINCT CASE WHEN event_type = 'okr_generated' THEN session_id END) as daily_generations,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN event_type = 'okr_copied' THEN session_id END) /
    NULLIF(COUNT(DISTINCT session_id), 0), 2) as daily_conversion_rate
FROM telemetry_events
WHERE timestamp >= :start_date
  AND timestamp < :end_date
GROUP BY day
ORDER BY day;
```

### 5.2 Hourly Usage Patterns

```sql
-- Peak usage hours
SELECT
  strftime('%H', datetime(timestamp / 1000, 'unixepoch')) as hour_of_day,
  COUNT(*) as event_count,
  COUNT(DISTINCT session_id) as unique_sessions
FROM telemetry_events
WHERE timestamp >= :start_date
  AND timestamp < :end_date
GROUP BY hour_of_day
ORDER BY hour_of_day;
```

## 6. Privacy and Retention

### 6.1 Data Retention Policy

- **Raw events:** 90 days
- **Aggregated metrics:** 2 years
- **Session summaries:** 1 year
- **User-identifiable data:** Anonymized after 30 days

### 6.2 Privacy Controls

- Opt-out flag respected: `telemetry_opt_out`
- No PII in event properties
- IP addresses hashed
- Session IDs rotated daily

## 7. Implementation Notes

### 7.1 Event Collection

Events are collected via `ClarificationTelemetryService`:

```typescript
// Example usage
this.telemetry.trackStepView({
  stepId: 'intent-input',
  stepName: '输入意图',
  stepIndex: 1,
  totalSteps: 5,
});

this.telemetry.trackOptionSelect({
  promptId: 'prompt-1',
  optionId: 'opt-a',
  optionLabel: '提高效率',
  selectionIndex: 0,
});
```

### 7.2 Batch Processing

- Events queued in memory (max 100)
- Flushed every 30 seconds or when queue full
- Failed sends retried with exponential backoff
- Local storage backup for offline scenarios

### 7.3 Real-time Analytics

For real-time dashboards, consider:

- WebSocket connection for live updates
- Materialized views for common queries
- Redis for caching hot metrics
- Stream processing for complex aggregations

## 8. Success Metrics

Track the effectiveness of ClarityOKR:

| Metric                  | Target  | Measurement          |
| ----------------------- | ------- | -------------------- |
| Overall Conversion Rate | >50%    | intent → copy        |
| Avg Session Duration    | 3-5 min | Total time in app    |
| Edit Rate               | >30%    | OKRs that are edited |
| Regenerate Rate         | <20%    | OKRs regenerated     |
| User Satisfaction       | >4.0/5  | Post-session rating  |

---

**Document Version:** 1.0
**Last Updated:** 2026-04-02
**Owner:** Engineering Team
