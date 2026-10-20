import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { Logger } from '../core/services/logger.service';
import { OkrStickyNoteComponent } from '../okr-sticky/components/okr-sticky-note.component';
import {
  OkrStickyService,
  type OkrStickyViewModel,
} from '../okr-sticky/services/okr-sticky.service';
import { ClosedLoopApi } from './closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop.store';
import { COPY } from './copy';
import { ReminderStore } from './reminder.store';
import { makeDetail, makeKr, makeListItem } from './testing/fixtures';

/**
 * #84 review: the main-window results panel hosts the note WITHOUT the sticky shell. Reminders
 * still show there, and 「去复盘」 is handed to the main process (the shell has the review page).
 */
@Component({
  standalone: true,
  imports: [OkrStickyNoteComponent],
  template: `<clarityokr-sticky-note [okr]="okr" />`,
})
class MainWindowHost {
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

describe('#84 review: reminders in the main-window results panel', () => {
  let fixture: ComponentFixture<MainWindowHost>;
  let api: Record<string, jest.Mock>;
  let tick: (() => void) | null = null;
  let now = new Date(2027, 0, 5, 10);

  const q = (id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    }
  };

  beforeEach(async () => {
    const detail = makeDetail([makeKr({ createdAt: new Date(2027, 0, 1, 10).toISOString() })], {
      period: '2027-Q1',
    });
    api = {
      open: jest.fn().mockResolvedValue({ ok: true, data: detail }),
      getReview: jest.fn().mockResolvedValue({ ok: true, data: { review: null } }),
      list: jest.fn().mockResolvedValue({
        ok: true,
        data: {
          items: [
            makeListItem({ id: 'okr-1', period: '2027-Q1' }),
            makeListItem({ id: 'okr-q4', period: '2026-Q4' }),
          ],
        },
      }),
      onEvent: jest.fn().mockImplementation((_channel: string, listener: () => void) => {
        tick = listener;
        return () => undefined;
      }),
      onPayload: jest.fn().mockReturnValue(() => undefined),
      getReminders: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ now: now.toISOString(), dismissedQuarters: [] }),
        ),
      dismissReminder: jest.fn().mockResolvedValue(true),
      goReviewElsewhere: jest.fn().mockResolvedValue('opened'),
    };
    await TestBed.configureTestingModule({
      imports: [MainWindowHost],
      providers: [
        { provide: ClosedLoopApi, useValue: api },
        { provide: OkrStickyService, useValue: { openFromDetail: jest.fn() } },
        { provide: Logger, useValue: { warn: jest.fn(), error: jest.fn() } },
      ],
    }).compileComponents();
    TestBed.inject(ReminderStore).start(); // as the app initializer does in every window
    fixture = TestBed.createComponent(MainWindowHost);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentInstance.okr = view;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => fixture.nativeElement.remove());

  it('shows the quarter banner without the shell', () => {
    expect(q('review-reminder')?.dataset['kind']).toBe('ended');
  });

  it('the 7-day badge refreshes on a tick', async () => {
    expect(q('kr-stale-badge')).toBeNull();
    now = new Date(2027, 0, 8, 10, 1); // 7×24h + 1 min after the KR was created
    tick?.();
    await settle();
    expect(q('kr-stale-badge')?.textContent.trim()).toBe('7 天未更新');
  });

  it('去复盘 is handed to the main process with Q’s OKR', async () => {
    (q('review-reminder-go') as HTMLButtonElement).click();
    await settle();
    expect(api['goReviewElsewhere']).toHaveBeenCalledWith('okr-q4');
  });

  describe('#88 hand-off timeout notice (session-only)', () => {
    const go = () => q('review-reminder-go') as HTMLButtonElement;
    const timeOut = async () => {
      api['goReviewElsewhere']!.mockResolvedValueOnce('timeout');
      go().focus();
      go().click();
      await settle();
    };

    it('timeout → 「复盘页没能打开，请再试一次」 + 去复盘 in the banner slot, role=status, no dialog; focus stays on 去复盘', async () => {
      await timeOut();
      const notice = q('review-reminder-notice');
      expect(notice?.getAttribute('role')).toBe('status');
      expect(notice?.textContent.trim()).toBe('复盘页没能打开，请再试一次');
      expect(q('review-reminder')?.contains(notice)).toBe(true); // the banner stays open
      expect(document.activeElement).toBe(go());
      expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull();
      expect(go().disabled).toBe(false);
    });

    it('the notice is followed by the same 去复盘 button, no trailing period', async () => {
      await timeOut();
      const notice = q('review-reminder-notice');
      expect(COPY.reminders.handoffTimeout).toBe('复盘页没能打开，请再试一次');
      expect(notice?.textContent.trim()).not.toMatch(/[。.]$/);
      expect(notice?.nextElementSibling).toBe(go());
      expect(go().textContent.trim()).toBe('去复盘');
    });

    it('去复盘 clicked again → back to the original banner at once; the review opening keeps it so', async () => {
      await timeOut();
      let answer!: (v: string) => void;
      api['goReviewElsewhere']!.mockImplementationOnce(() => new Promise((r) => (answer = r)));
      go().click();
      fixture.detectChanges();
      expect(q('review-reminder-notice')).toBeNull();
      expect(q('review-reminder')?.textContent).toContain('本季度已经结束，还没复盘，');
      answer('opened');
      await settle();
      expect(q('review-reminder-notice')).toBeNull();
      expect(q('review-reminder')?.textContent).toContain('本季度已经结束，还没复盘，');
    });

    it('clicked again and it times out again → the notice shows again', async () => {
      await timeOut();
      await timeOut();
      expect(q('review-reminder-notice')).not.toBeNull();
    });

    it('rapid double click: never disabled, no spinner; a superseded click shows nothing, the last one decides', async () => {
      let first!: (v: string) => void;
      api['goReviewElsewhere']!.mockImplementationOnce(
        () => new Promise((r) => (first = r)),
      ).mockResolvedValueOnce('timeout');
      go().click();
      await settle();
      expect(go().disabled).toBe(false);
      expect(go().getAttribute('aria-busy')).toBeNull();
      expect(q('review-reminder')?.querySelector('[class*="spinner"]')).toBeNull();
      go().click();
      await settle();
      first('superseded');
      await settle();
      expect(api['goReviewElsewhere']).toHaveBeenCalledTimes(2);
      expect(q('review-reminder-notice')).not.toBeNull(); // from the last click only
    });

    it('a superseded click alone shows no notice; an opened one neither', async () => {
      api['goReviewElsewhere']!.mockResolvedValueOnce('superseded');
      go().click();
      await settle();
      expect(q('review-reminder-notice')).toBeNull();
      go().click(); // 'opened'
      await settle();
      expect(q('review-reminder-notice')).toBeNull();
    });

    it('✕ while the notice shows: the banner is dismissed for this quarter (remembered)', async () => {
      await timeOut();
      (q('review-reminder-close') as HTMLButtonElement).click();
      await settle();
      expect(q('review-reminder')).toBeNull();
      expect(api['dismissReminder']).toHaveBeenCalledWith('2026-Q4');
    });

    it('switching quarter reverts to the original banner (also when coming back)', async () => {
      await timeOut();
      const store = TestBed.inject(ClosedLoopStore);
      const current = store.detail()!;
      store.detail.set({ ...current, objective: { ...current.objective, period: '2027-Q2' } });
      await settle();
      expect(q('review-reminder-notice')).toBeNull();
      store.detail.set(current);
      await settle();
      expect(q('review-reminder')?.dataset['kind']).toBe('ended');
      expect(q('review-reminder-notice')).toBeNull();
      expect(q('review-reminder')?.textContent).toContain('本季度已经结束，还没复盘，');
    });

    it('review saved elsewhere: the banner and the notice disappear (and stay gone)', async () => {
      await timeOut();
      api['list']!.mockResolvedValue({
        ok: true,
        data: {
          items: [
            makeListItem({ id: 'okr-1', period: '2027-Q1' }),
            makeListItem({ id: 'okr-q4', period: '2026-Q4', reviewed: true }),
          ],
        },
      });
      tick?.();
      await settle();
      expect(q('review-reminder')).toBeNull();
      expect(q('review-reminder-notice')).toBeNull();
    });

    it('not persisted: nothing is saved for it, and a fresh run (new store) shows the original banner', async () => {
      await timeOut();
      expect(api['dismissReminder']).not.toHaveBeenCalled();
      expect(TestBed.inject(ReminderStore).showsHandoffNotice()).toBe(true);
      const fresh = TestBed.runInInjectionContext(() => new ReminderStore());
      expect(fresh.showsHandoffNotice()).toBe(false);
    });
  });
});
