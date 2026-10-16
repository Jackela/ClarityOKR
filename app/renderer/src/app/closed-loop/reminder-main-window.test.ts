import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { Logger } from '../core/services/logger.service';
import { OkrStickyNoteComponent } from '../okr-sticky/components/okr-sticky-note.component';
import {
  OkrStickyService,
  type OkrStickyViewModel,
} from '../okr-sticky/services/okr-sticky.service';
import { ClosedLoopApi } from './closed-loop-api.service';
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
      goReviewElsewhere: jest.fn().mockResolvedValue(true),
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
});
