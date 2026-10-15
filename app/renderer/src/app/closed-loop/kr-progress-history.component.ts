import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { KrStatus, ProgressEntryRecord } from '@clarityokr/contracts';

import { ClosedLoopApi } from './closed-loop-api.service';
import { COPY, STATUS_ICON, STATUS_LABEL, formatDateTime, formatMonthDay } from './copy';
import { buildProgressHistory } from './progress-history';

/** List page size (S1§10.5). */
export const HISTORY_PAGE = 20;
/** More points than this: only the line, plus the first and last point (S1§10.4). */
export const MAX_DOTS = 60;
const SLOW_MS = 300;

// SVG geometry: 356×72, labels left of the plot.
const W = 356;
const H = 72;
const LEFT = 26;
const RIGHT = 6;
const TOP = 6;
const BOTTOM = 6;

interface Dot {
  x: number;
  y: number;
}

/**
 * #53 「进度记录」 panel under one KR (spec S1§10): summary, a pure-SVG trend of the effective
 * records (role=img, the summary is its name; the table is the accessible alternative) and the
 * list newest first, 20 at a time. Read-only; works for removed KRs and while regenerating.
 */
@Component({
  selector: 'clarityokr-kr-progress-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="ph"
      role="region"
      [attr.aria-labelledby]="labelledBy"
      [attr.aria-busy]="slow() ? 'true' : null"
      [attr.data-testid]="'kr-history-panel'"
    >
      @switch (state()) {
        @case ('loading') {
          @if (slow()) {
            <div class="ph__skeleton" aria-hidden="true"><span></span><span></span></div>
            <span class="sr-only">{{ c.loading }}</span>
          }
        }
        @case ('error') {
          <p class="ph__error" role="alert" data-testid="kr-history-error">
            <span aria-hidden="true">⚠ </span>{{ c.loadFailed }}
            <button type="button" class="ph__link" data-testid="kr-history-retry" (click)="load()">
              {{ c.retry }}
            </button>
          </p>
        }
        @default {
          @if (history().rows.length === 0) {
            <p class="ph__summary" data-testid="kr-history-empty">{{ c.empty }}</p>
          } @else {
            <p class="ph__summary" [id]="summaryId" data-testid="kr-history-summary">
              {{ summary() }}
            </p>
            @if (chart(); as g) {
              <svg
                [class]="'ph__chart ph__chart--' + status"
                role="img"
                [attr.aria-labelledby]="summaryId"
                [attr.viewBox]="'0 0 ' + w + ' ' + h"
                [attr.width]="w"
                [attr.height]="h"
                focusable="false"
                data-testid="kr-history-chart"
              >
                <g aria-hidden="true">
                  @for (grid of g.grid; track grid.label) {
                    <line
                      class="ph__grid"
                      [attr.x1]="left"
                      [attr.x2]="w - right"
                      [attr.y1]="grid.y"
                      [attr.y2]="grid.y"
                    />
                    <text class="ph__axis" x="0" [attr.y]="grid.y + 4">{{ grid.label }}</text>
                  }
                  @for (d of g.paths; track $index) {
                    <path class="ph__line" [attr.d]="d" data-testid="kr-history-line" />
                  }
                  @for (dot of g.dots; track $index; let last = $last) {
                    <circle
                      class="ph__dot"
                      [class.ph__dot--last]="last"
                      [attr.cx]="dot.x"
                      [attr.cy]="dot.y"
                      [attr.r]="last ? 4 : 3"
                      data-testid="kr-history-dot"
                    />
                  }
                </g>
              </svg>
              <div class="ph__dates" aria-hidden="true">
                <span>{{ g.from }}</span>
                @if (!g.single) {
                  <span>{{ g.to }}</span>
                }
              </div>
            }
            <div
              class="ph__table-wrap"
              tabindex="0"
              role="region"
              [attr.aria-label]="c.listLabel"
              data-testid="kr-history-list"
            >
              <table class="ph__table">
                <caption class="sr-only">
                  {{
                    c.caption(statement)
                  }}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{{ c.colDate }}</th>
                    <th scope="col">{{ c.colValue }}</th>
                    <th scope="col">{{ c.colStatus }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of visibleRows(); track row.id; let i = $index) {
                    <tr
                      [class.ph__row--reverted]="row.reverted"
                      [attr.data-testid]="'kr-history-row'"
                      [attr.data-first-new]="i === firstNew() ? '' : null"
                      [attr.tabindex]="i === firstNew() ? -1 : null"
                    >
                      <td>{{ when(row.recordedAt) }}</td>
                      <td class="ph__num">
                        <span class="ph__strike">{{
                          row.value === null ? '—' : row.value + '%'
                        }}</span>
                      </td>
                      <td>
                        <span class="ph__strike"
                          ><span aria-hidden="true">{{ icon(row.status) }} </span
                          >{{ label(row.status) }}</span
                        >
                        @if (row.modified) {
                          <span class="ph__tag" data-testid="kr-history-modified">{{
                            c.modified
                          }}</span>
                        }
                        @if (row.reverted) {
                          <span class="ph__tag" data-testid="kr-history-reverted">{{
                            c.reverted
                          }}</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (remaining() > 0) {
              <button
                type="button"
                class="ph__more"
                data-testid="kr-history-more"
                [attr.aria-describedby]="moreId"
                (click)="more()"
              >
                {{ c.more(remaining()) }}
              </button>
              <span class="sr-only" [id]="moreId">{{ c.moreLeft(remaining()) }}</span>
            }
            <span class="sr-only" role="status" data-testid="kr-history-status">{{
              shownText()
            }}</span>
          }
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        margin-top: 8px;
      }
      .ph {
        padding: 12px;
        border-radius: 8px;
        background: var(--color-bg-secondary);
      }
      .ph__summary {
        margin: 0 0 8px;
        font-size: 12px;
        line-height: 16px;
        color: var(--color-text-secondary);
      }
      .ph__chart {
        display: block;
        max-width: 100%;
        height: auto;
        overflow: visible;
        --ph-line: var(--status-in_progress-fill);
      }
      .ph__chart--not_started {
        --ph-line: var(--status-not_started-fill);
      }
      .ph__chart--in_progress {
        --ph-line: var(--status-in_progress-fill);
      }
      .ph__chart--at_risk {
        --ph-line: var(--status-at_risk-fill);
      }
      .ph__chart--done {
        --ph-line: var(--status-done-fill);
      }
      .ph__grid {
        stroke: var(--ph-grid, #e5e5ea);
        stroke-width: 1;
        stroke-dasharray: 3 3;
      }
      :host-context([data-theme='dark']) .ph__grid {
        stroke: #3a3a3c;
      }
      .ph__axis {
        font-size: 10px;
        fill: var(--color-text-secondary);
      }
      .ph__line {
        fill: none;
        stroke: var(--ph-line);
        stroke-width: 2;
        stroke-linejoin: round;
        stroke-linecap: round;
      }
      .ph__dot {
        fill: var(--ph-line);
      }
      .ph__dot--last {
        stroke: var(--color-bg-secondary);
        stroke-width: 2;
      }
      @media (prefers-contrast: more) {
        .ph__grid {
          stroke: #8e8e93;
        }
        .ph__line {
          stroke-width: 3;
        }
      }
      .ph__dates {
        display: flex;
        justify-content: space-between;
        margin: 2px 0 8px 26px;
        font-size: 12px;
        color: var(--color-text-secondary);
      }
      .ph__table-wrap {
        max-height: 320px;
        overflow-y: auto;
        border-radius: 4px;
      }
      .ph__table-wrap:focus-visible {
        outline: 2px solid var(--color-focus, #2563eb);
        outline-offset: 2px;
      }
      .ph__table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
        line-height: 21px;
      }
      .ph__table th {
        padding: 0 4px 4px 0;
        font-size: 12px;
        font-weight: 400;
        text-align: left;
        color: var(--color-text-secondary);
      }
      .ph__table td {
        height: 32px;
        padding: 0 4px 0 0;
        white-space: nowrap;
      }
      .ph__num {
        font-variant-numeric: tabular-nums;
      }
      .ph__row--reverted td {
        color: var(--color-text-secondary);
      }
      .ph__row--reverted .ph__strike {
        text-decoration: line-through;
      }
      .ph__tag {
        margin-left: 6px;
        font-size: 12px;
        color: var(--color-text-secondary);
      }
      .ph__more,
      .ph__link {
        margin-top: 8px;
        height: 32px;
        padding: 0 8px;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--color-accent, #2563eb);
        font: inherit;
        font-size: 14px;
        cursor: pointer;
      }
      .ph__link {
        margin-top: 0;
      }
      .ph__error {
        margin: 0;
        color: #b91c1c;
        font-size: 14px;
      }
      :host-context([data-theme='dark']) .ph__error {
        color: #fca5a5;
      }
      .ph__skeleton span {
        display: block;
        height: 12px;
        margin: 6px 0;
        border-radius: 4px;
        background: var(--color-border);
      }
      .ph__skeleton span + span {
        width: 60%;
      }
    `,
  ],
})
export class KrProgressHistoryComponent implements OnInit {
  @Input({ required: true }) krId = '';
  @Input({ required: true }) statement = '';
  /** Current status of the KR: the line colour (Q10-6). */
  @Input() status: KrStatus = 'in_progress';
  /** Id of the 「进度记录」 button (the panel's name). */
  @Input() labelledBy = '';
  @Input() now: Date = new Date();

  private readonly api = inject(ClosedLoopApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly c = COPY.progressHistory;
  readonly w = W;
  readonly h = H;
  readonly left = LEFT;
  readonly right = RIGHT;
  private static seq = 0;
  private readonly uid = KrProgressHistoryComponent.seq++;
  readonly summaryId = `kr-history-summary-${this.uid}`;
  readonly moreId = `kr-history-more-${this.uid}`;

  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly slow = signal(false);
  readonly entries = signal<ProgressEntryRecord[]>([]);
  readonly shown = signal(HISTORY_PAGE);
  /** Index of the first row added by the last 「显示更多」 (focus target), or -1. */
  readonly firstNew = signal(-1);
  readonly shownText = signal('');

  readonly history = computed(() => buildProgressHistory(this.entries()));
  readonly visibleRows = computed(() => this.history().rows.slice(0, this.shown()));
  readonly remaining = computed(() => Math.max(0, this.history().rows.length - this.shown()));

  readonly summary = computed(() => {
    const h = this.history();
    const values = h.points.filter((v): v is number => v !== null);
    if (values.length === 0) return this.c.noValue;
    if (values.length === 1) return this.c.single(values[0] as number);
    return this.c.summary(h.first as number, h.last as number, h.count);
  });

  readonly chart = computed(() => {
    const h = this.history();
    const points = h.points;
    if (points.every((v) => v === null)) return null;
    const plotW = W - LEFT - RIGHT;
    const plotH = H - TOP - BOTTOM;
    const y = (v: number): number => TOP + plotH * (1 - v / 100);
    const x = (i: number): number =>
      points.length === 1 ? LEFT + plotW / 2 : LEFT + (plotW * i) / (points.length - 1);
    const paths: string[] = [];
    let current = '';
    const all: Dot[] = [];
    points.forEach((v, i) => {
      if (v === null) {
        if (current) paths.push(current);
        current = '';
        return;
      }
      const p = { x: round(x(i)), y: round(y(v)) };
      all.push(p);
      current += `${current ? 'L' : 'M'}${p.x} ${p.y}`;
    });
    if (current) paths.push(current);
    const dots = all.length > MAX_DOTS ? [all[0] as Dot, all[all.length - 1] as Dot] : all;
    const effective = h.rows.filter((r) => !r.reverted);
    const oldest = effective[effective.length - 1]?.recordedAt ?? '';
    const newest = effective[0]?.recordedAt ?? '';
    return {
      grid: [100, 50, 0].map((v) => ({ y: round(y(v)), label: String(v) })),
      // a lone point (one record, or between two gaps) has no line, only its dot
      paths: paths.filter((d) => d.includes('L')),
      dots,
      single: all.length === 1,
      from: this.axisDate(oldest, newest),
      to: this.axisDate(newest, oldest),
    };
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    const timer = setTimeout(() => this.slow.set(true), SLOW_MS);
    try {
      const reply = await this.api.progressHistory({ krId: this.krId });
      if (reply.ok) {
        this.entries.set(reply.data.entries);
        this.state.set('ready');
      } else {
        this.state.set('error');
      }
    } catch {
      this.state.set('error');
    } finally {
      clearTimeout(timer);
      this.slow.set(false);
    }
  }

  more(): void {
    const before = this.shown();
    this.shown.set(before + HISTORY_PAGE);
    const total = this.history().rows.length;
    this.shownText.set(this.c.shown(Math.min(this.shown(), total), total));
    if (this.remaining() > 0) {
      this.firstNew.set(-1);
      return;
    }
    // No more to load: the focus moves to the first newly shown row.
    this.firstNew.set(before);
    queueMicrotask(() =>
      this.host.nativeElement.querySelector<HTMLElement>('[data-first-new]')?.focus(),
    );
  }

  when(iso: string): string {
    return formatDateTime(iso, this.now);
  }
  icon(status: KrStatus): string {
    return STATUS_ICON[status];
  }
  label(status: KrStatus): string {
    return STATUS_LABEL[status];
  }

  /** `MM-DD`; `YYYY-MM-DD` across years; `HH:mm` when both ends fall on the same day. */
  private axisDate(iso: string, other: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    const o = new Date(other);
    if (d.toDateString() === o.toDateString()) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    const year = d.getFullYear();
    return year === new Date(other).getFullYear()
      ? formatMonthDay(iso)
      : `${year}-${formatMonthDay(iso)}`;
  }
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
