import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ProgressEntryRecord } from '@clarityokr/contracts';

import { ClosedLoopApi } from './closed-loop-api.service';
import { KrProgressHistoryComponent } from './kr-progress-history.component';
import { makeEntry } from './testing/fixtures';

@Component({
  standalone: true,
  imports: [KrProgressHistoryComponent],
  template: `<clarityokr-kr-progress-history krId="kr-1" statement="提升留存" status="at_risk" />`,
})
class Host {}

const at = (min: number): string => new Date(Date.UTC(2026, 9, 1, 0, min)).toISOString();
const set = (id: number, value: number | null, min: number): ProgressEntryRecord =>
  makeEntry({ id, value, recordedAt: at(min) });

describe('KrProgressHistoryComponent (#53)', () => {
  let fixture: ComponentFixture<Host>;
  let api: { progressHistory: jest.Mock };
  const root = (): HTMLElement => fixture.nativeElement;
  const q = (id: string): HTMLElement | null => root().querySelector(`[data-testid="${id}"]`);
  const all = (id: string): HTMLElement[] =>
    Array.from(root().querySelectorAll(`[data-testid="${id}"]`));

  async function mount(entries: ProgressEntryRecord[] | 'fail'): Promise<void> {
    api = {
      progressHistory: jest
        .fn()
        .mockResolvedValue(
          entries === 'fail'
            ? { ok: false, error: { code: 'INTERNAL', message: 'x' } }
            : { ok: true, data: { krId: 'kr-1', entries } },
        ),
    };
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: ClosedLoopApi, useValue: api }],
    });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('empty KR shows the empty text and no chart', async () => {
    await mount([]);
    expect(api.progressHistory).toHaveBeenCalledWith({ krId: 'kr-1' });
    expect(q('kr-history-empty')).not.toBeNull();
    expect(q('kr-history-chart')).toBeNull();
  });

  it('3 updates + 1 revert: reverted row tagged, revert not counted (Q10-3/Q10-5)', async () => {
    const revert = makeEntry({
      id: 4,
      kind: 'revert',
      value: null,
      revertsEntryId: 3,
      recordedAt: at(30),
    });
    await mount([set(1, 10, 0), set(2, 30, 10), set(3, 50, 20), revert]);
    expect(all('kr-history-reverted')).toHaveLength(1);
    expect(q('kr-history-chart')).not.toBeNull();
    expect(all('kr-history-row').length).toBeGreaterThanOrEqual(3);
    expect(q('kr-history-summary')!.textContent).toMatch(/2/);
  });

  it('a cleared value breaks the line (Q10-2)', async () => {
    await mount([set(1, 10, 0), set(2, 20, 1), set(3, null, 2), set(4, 40, 3), set(5, 50, 4)]);
    expect(all('kr-history-line')).toHaveLength(2);
  });

  it('pages rows by 20 with 「显示更多」', async () => {
    await mount(Array.from({ length: 25 }, (_, i) => set(i + 1, i, i * 5)));
    expect(all('kr-history-row')).toHaveLength(20);
    q('kr-history-more')!.click();
    fixture.detectChanges();
    expect(all('kr-history-row')).toHaveLength(25);
    expect(q('kr-history-more')).toBeNull();
  });

  it('load failure shows an alert and retry reloads', async () => {
    await mount('fail');
    expect(q('kr-history-error')!.getAttribute('role')).toBe('alert');
    api.progressHistory.mockResolvedValue({ ok: true, data: { krId: 'kr-1', entries: [] } });
    q('kr-history-retry')!.click();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect(q('kr-history-empty')).not.toBeNull();
  });

  it('1 record: a single dot, no line, 「目前 n%，共 1 次更新」', async () => {
    await mount([set(1, 30, 0)]);
    expect(all('kr-history-dot')).toHaveLength(1);
    expect(all('kr-history-line')).toHaveLength(0);
    expect(q('kr-history-summary')!.textContent!.trim()).toBe('目前 30%，共 1 次更新');
  });

  it('x-axis shows times when both ends fall on the same day', async () => {
    await mount([set(1, 10, 0), set(2, 30, 43)]);
    const labels = root().querySelector('.ph__dates')!.textContent!;
    expect(labels).toMatch(/\d{2}:\d{2}.*\d{2}:\d{2}/s);
    expect(labels).not.toMatch(/10-01/);
  });
});
