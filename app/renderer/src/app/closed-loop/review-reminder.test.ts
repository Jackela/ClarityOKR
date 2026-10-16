import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { OkrDetail } from '@clarityokr/contracts';

import { Logger } from '../core/services/logger.service';
import {
  OkrStickyService,
  type OkrStickyViewModel,
} from '../okr-sticky/services/okr-sticky.service';
import { ClosedLoopApi } from './closed-loop-api.service';
import { ReminderStore } from './reminder.store';
import { StickyShellComponent } from './sticky-shell.component';
import { makeDetail, makeEntry, makeInfo, makeKr, makeListItem } from './testing/fixtures';

/** #54 in-app reminders (S1§11) inside the real sticky shell. */
@Component({
  standalone: true,
  imports: [StickyShellComponent],
  template: `<clarityokr-sticky-shell [okr]="okr" />`,
})
class Host {
  okr: OkrStickyViewModel | null = null;
}

const view: OkrStickyViewModel = {
  id: 'okr-1',
  objective: '提升团队交付节奏',
  keyResults: [],
  generatedAt: '2026-10-09T08:00:00.000Z',
  lastEditedAt: null,
  hasManualEdits: false,
  regenerationPolicy: 'append',
};

const local = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10, 0, 0);

interface Setup {
  now: Date;
  viewPeriod: string | null;
  q4Reviewed?: boolean;
  dismissed?: string[];
  detail?: OkrDetail;
}

describe('#54 reminders UI', () => {
  let fixture: ComponentFixture<Host>;
  let api: Record<string, jest.Mock>;
  const root = (): HTMLElement => fixture.nativeElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
    root().querySelector(`[data-testid="${id}"]`) as T | null;
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    }
  };

  async function setup(s: Setup): Promise<void> {
    const current = s.detail ?? makeDetail([makeKr()], { period: s.viewPeriod as never });
    const q4 = makeDetail([makeKr({ objectiveId: 'okr-q4' })], {
      id: 'okr-q4',
      title: '上季度 OKR',
      period: '2026-Q4',
    });
    api = {
      open: jest
        .fn()
        .mockImplementation(({ okrId }: { okrId: string }) =>
          Promise.resolve({ ok: true, data: okrId === 'okr-q4' ? q4 : current }),
        ),
      getReview: jest.fn().mockResolvedValue({ ok: true, data: { review: null } }),
      saveReview: jest.fn(),
      getStorageMode: jest.fn().mockResolvedValue('normal'),
      reportUnsaved: jest.fn().mockResolvedValue({ ok: true, data: { recorded: true } }),
      openWizard: jest.fn(),
      restart: jest.fn(),
      getLegacyNotice: jest.fn().mockResolvedValue(false),
      ackLegacyNotice: jest.fn(),
      onEvent: jest.fn().mockReturnValue(() => undefined),
      onPayload: jest.fn().mockReturnValue(() => undefined),
      getWindowState: jest.fn().mockResolvedValue({ ok: true, data: { alwaysOnTop: true } }),
      setAlwaysOnTop: jest.fn(),
      hideWindow: jest.fn(),
      list: jest.fn().mockResolvedValue({
        ok: true,
        data: {
          items: [
            makeListItem({ id: 'okr-1', period: s.viewPeriod as never }),
            makeListItem({ id: 'okr-q4', period: '2026-Q4', reviewed: s.q4Reviewed ?? false }),
          ],
        },
      }),
      getReminders: jest
        .fn()
        .mockResolvedValue({ now: s.now.toISOString(), dismissedQuarters: s.dismissed ?? [] }),
      dismissReminder: jest.fn().mockResolvedValue(true),
    };
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        { provide: ClosedLoopApi, useValue: api },
        { provide: OkrStickyService, useValue: { openFromDetail: jest.fn() } },
        { provide: Logger, useValue: { warn: jest.fn(), error: jest.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentInstance.okr = view;
    fixture.detectChanges();
    await settle();
  }

  afterEach(() => fixture?.nativeElement.remove());

  const banner = () => q('review-reminder');

  it('ending (current view, last 14 days): above the picker, role=status, copy', async () => {
    await setup({ now: local(2027, 3, 25), viewPeriod: '2027-Q1', q4Reviewed: true });
    const b = banner()!;
    expect(b.dataset['kind']).toBe('ending');
    expect(b.getAttribute('role')).toBe('status');
    expect(b.textContent!.replace(/\s+/g, '')).toBe('本季度即将结束，去复盘✕');
    expect(q('review-reminder-close')!.getAttribute('aria-label')).toBe('关闭本季度复盘提醒');
    // above the quarter picker in document order
    const picker = q('period-picker')!;
    expect(b.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('N53 precedence: Q+1 ending wins over an unreviewed Q in the Q+1 view', async () => {
    await setup({ now: local(2027, 3, 25), viewPeriod: '2027-Q1' });
    expect(root().querySelectorAll('[data-testid="review-reminder"]')).toHaveLength(1);
    expect(banner()!.dataset['kind']).toBe('ending');
  });

  it('N53 closing Q+1 ending stores only 2027-Q1; ✕ focuses the quarter picker', async () => {
    await setup({ now: local(2027, 3, 25), viewPeriod: '2027-Q1' });
    q('review-reminder-close')!.click();
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(api['dismissReminder']).toHaveBeenCalledWith('2027-Q1');
    expect(document.activeElement).toBe(q('period-picker'));
    // Q's own (separate) dismissal is untouched: its ended banner may now show
    expect(banner()!.dataset['kind']).toBe('ended');
  });

  it('N53 a dismissed Q ended banner leaves Q+1 ending normal', async () => {
    await setup({
      now: local(2027, 3, 25),
      viewPeriod: '2027-Q1',
      dismissed: ['2026-Q4'],
    });
    expect(banner()!.dataset['kind']).toBe('ending');
  });

  it('ended: shows in the Q+1 view and the Q view, copy as given', async () => {
    await setup({ now: local(2027, 1, 5), viewPeriod: '2027-Q1' });
    expect(banner()!.dataset['kind']).toBe('ended');
    expect(banner()!.dataset['period']).toBe('2026-Q4');
    expect(banner()!.textContent!.replace(/\s+/g, '')).toBe('本季度已经结束，还没复盘，去复盘✕');
  });

  it('no banner while viewing an older quarter', async () => {
    await setup({ now: local(2027, 1, 5), viewPeriod: '2026-Q3' });
    expect(banner()).toBeNull();
  });

  it('去复盘 switches to Q (opens its OKR), then the review tab with focus on the title', async () => {
    await setup({ now: local(2027, 1, 5), viewPeriod: '2027-Q1' });
    q('review-reminder-go')!.click();
    for (
      let i = 0;
      i < 10 && document.activeElement?.dataset['testid'] !== 'review-objective';
      i++
    ) {
      await settle();
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    expect(api['open']).toHaveBeenCalledWith({ okrId: 'okr-q4' });
    expect(root().querySelector('#panel-review')!.hasAttribute('hidden')).toBe(false);
    expect(document.activeElement?.getAttribute('data-testid')).toBe('review-objective');
  });

  it('Esc does not close the banner', async () => {
    await setup({ now: local(2027, 3, 25), viewPeriod: '2027-Q1' });
    q('review-reminder-go')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await settle();
    expect(banner()).not.toBeNull();
    expect(api['dismissReminder']).not.toHaveBeenCalled();
  });

  it('is announced once per run (role=status only the first time)', async () => {
    await setup({ now: local(2027, 3, 25), viewPeriod: '2027-Q1' });
    const store = TestBed.inject(ReminderStore);
    const state = store.banner();
    expect(store.claimAnnouncement(state)).toBe(false);
  });

  it('7 天未更新: after 7×24h without an update, part of the statement, not focusable', async () => {
    const detail = makeDetail(
      [
        makeKr({ id: 'kr-old', createdAt: '2027-01-01T00:00:00.000Z' }),
        makeKr({ id: 'kr-new', position: 1, createdAt: '2027-01-01T00:00:00.000Z' }),
        makeKr({
          id: 'kr-done',
          position: 2,
          status: 'done',
          createdAt: '2027-01-01T00:00:00.000Z',
        }),
      ],
      { period: '2027-Q1' },
    );
    detail.progress['kr-new'] = makeInfo({
      latest: makeEntry({ krId: 'kr-new', recordedAt: new Date(local(2027, 2, 9)).toISOString() }),
    });
    await setup({ now: local(2027, 2, 10), viewPeriod: '2027-Q1', detail });
    const badges = root().querySelectorAll<HTMLElement>('[data-testid="kr-stale-badge"]');
    expect(badges).toHaveLength(1);
    const badge = badges[0];
    expect(badge.textContent!.trim()).toBe('7 天未更新');
    expect(badge.hasAttribute('tabindex')).toBe(false);
    expect(badge.closest('[data-testid="kr-statement"]')).not.toBeNull();
    expect(badge.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('never calls a system Notification', async () => {
    const notification = jest.fn();
    (window as unknown as { Notification: unknown }).Notification = notification;
    await setup({ now: local(2027, 3, 25), viewPeriod: '2027-Q1' });
    expect(banner()).not.toBeNull();
    expect(notification).not.toHaveBeenCalled();
  });
});
