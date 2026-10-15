import { Component, inject } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { OkrListItem } from '@clarityokr/contracts';

import { Logger } from '../core/services/logger.service';
import { OkrStickyService } from '../okr-sticky/services/okr-sticky.service';
import { ClosedLoopApi } from './closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop.store';
import { HistoryTabComponent } from './history-tab.component';
import { ImportFlow } from './import-flow.service';
import { makeListItem } from './testing/fixtures';

@Component({
  standalone: true,
  imports: [HistoryTabComponent],
  template: `<clarityokr-history-tab [blockedReason]="blocked" />`,
})
class Host {
  readonly store = inject(ClosedLoopStore);
  blocked: string | null = null;
}

describe('HistoryTabComponent · 导入 (#49, S1§8)', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let api: Record<string, jest.Mock>;
  const ok = <T>(data: T) => ({ ok: true as const, data });
  const root = (): HTMLElement => fixture.nativeElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string): T =>
    root().querySelector(`[data-testid="${id}"]`) as T;
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  };
  function show(list: OkrListItem[]): void {
    host.store.list.set(list);
    host.store.listState.set('ready');
    fixture.detectChanges();
  }

  beforeEach(async () => {
    api = {
      importPick: jest.fn(),
      importCommit: jest.fn(),
      importRetry: jest.fn(),
      importDiscard: jest.fn().mockResolvedValue(ok({ discarded: true })),
      list: jest.fn().mockResolvedValue(ok({ items: [makeListItem({ id: 'n1', title: '新的' })] })),
      openWizard: jest.fn(),
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
    host = fixture.componentInstance;
    fixture.detectChanges();
  });
  afterEach(() => fixture.nativeElement.remove());

  it('「导入…」 is a native button before 「新建 OKR」 (focus order §4.7)', () => {
    show([makeListItem({ id: 'a' })]);
    const button = q<HTMLButtonElement>('history-import');
    expect(button.tagName).toBe('BUTTON');
    expect(button.textContent!.trim()).toBe('导入…');
    expect(
      button.compareDocumentPosition(q('history-new-okr')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('the empty history offers 「从文件导入…」', () => {
    show([]);
    expect(q('history-import-empty').textContent!.trim()).toBe('从文件导入…');
  });

  it('locked while regenerating: aria-disabled, still focusable, tooltip, no call', () => {
    host.blocked = '正在重新生成，完成后可切换。';
    show([makeListItem({ id: 'a' })]);
    const button = q<HTMLButtonElement>('history-import');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('title')).toBe('正在重新生成，完成后可用');
    button.click();
    expect(api['importPick']).not.toHaveBeenCalled();
  });

  it('conflict dialog: alertdialog, 取消 / 跳过 / 作为副本导入, focus on 取消, Esc cancels and discards', async () => {
    show([makeListItem({ id: 'a' })]);
    api['importPick']!.mockResolvedValue(
      ok({
        outcome: 'confirm',
        token: 't1',
        items: [{ title: 'X', createdAt: '2026-09-28T06:20:00.000Z' }],
        conflicts: [
          { title: 'X', createdAt: '2026-09-28T06:20:00.000Z', index: 0, source: 'existing' },
        ],
        memory: false,
      }),
    );
    q('history-import').click();
    await settle();
    const dialog = q('import-dialog-conflict');
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    const labels = Array.from(dialog.querySelectorAll('button:not([hidden])')).map((b) =>
      b.textContent!.trim(),
    );
    expect(labels).toEqual(['取消', '跳过', '作为副本导入']);
    expect(document.activeElement?.textContent?.trim()).toBe('取消');
    const describedBy = dialog.getAttribute('aria-describedby')!.split(' ');
    expect(describedBy).toHaveLength(2); // body + hint
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(q('import-dialog-conflict')).toBeNull();
    expect(api['importDiscard']).toHaveBeenCalledWith({ token: 't1' });
  });

  it('validation error dialog: 知道了 is primary, detail lines are shown', async () => {
    show([makeListItem({ id: 'a' })]);
    api['importPick']!.mockResolvedValue(
      ok({
        outcome: 'rejected',
        problem: { kind: 'invalid', field: 'keyResults[0].status', reason: '取值无效', more: 0 },
      }),
    );
    q('history-import').click();
    await settle();
    const dialog = q('import-dialog-error');
    expect(q('dialog-detail').textContent).toContain('keyResults[0].status 取值无效');
    expect(dialog.querySelector('[data-testid="dialog-hint"]')!.textContent).toBe(
      '数据没有任何改动。',
    );
    const visible = Array.from(dialog.querySelectorAll('button:not([hidden])'));
    expect(visible.map((b) => b.textContent!.trim())).toEqual(['知道了']);
  });

  it('after an import the new OKR carries 「新导入」 until the next list action', async () => {
    show([makeListItem({ id: 'a' })]);
    api['importPick']!.mockResolvedValue(
      ok({
        outcome: 'imported',
        imported: [{ okrId: 'n1', title: '新的' }],
        skipped: [],
        memory: false,
      }),
    );
    q('history-import').click();
    await settle();
    await settle();
    expect(q('history-new-tag')?.textContent).toContain('新导入');
    TestBed.inject(ImportFlow).clearFresh();
    fixture.detectChanges();
    expect(q('history-new-tag')).toBeNull();
  });

  describe('#50 backup preview (S1§9.4)', () => {
    const at = (d: number) => `2026-09-0${d}T00:00:00.000Z`;
    const items = [
      { title: '甲', createdAt: at(1) },
      { title: '乙', createdAt: at(2) },
      { title: '乙', createdAt: at(2) },
    ];
    async function open(conflicts: unknown[]): Promise<HTMLElement> {
      show([makeListItem({ id: 'a' })]);
      api['importPick']!.mockResolvedValue(
        ok({
          outcome: 'confirm',
          token: 't1',
          items,
          conflicts,
          memory: false,
          backup: { exportedAt: '2026-10-15T07:58:00.000Z', appVersion: '0.2.0' },
        }),
      );
      q('history-import').click();
      await settle();
      return q('import-dialog-backup');
    }
    const duplicates = [
      { ...items[0], index: 0, source: 'existing' },
      { ...items[2], index: 2, source: 'in_file' },
    ];

    it('no duplicates: 取消 (focused) / 导入 n 个, no list', async () => {
      const dialog = await open([]);
      expect(dialog.getAttribute('role')).toBe('alertdialog');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(q('backup-duplicates')).toBeNull();
      const labels = Array.from(dialog.querySelectorAll('.dialog__actions button:not([hidden])'));
      expect(labels.map((b) => b.textContent!.trim())).toEqual(['取消', '导入 3 个']);
      expect(document.activeElement?.textContent?.trim()).toBe('取消');
    });

    it('duplicates: list + radiogroups (default 跳过), 文件内重复 tag, live summary on the button', async () => {
      const dialog = await open(duplicates);
      const list = q('backup-duplicates');
      expect(list.getAttribute('role')).toBe('list');
      expect(list.getAttribute('aria-label')).toBe('重复的 OKR');
      const group = q('backup-row-2');
      expect(group.getAttribute('role')).toBe('radiogroup');
      expect(group.getAttribute('aria-label')).toMatch(/^乙，创建于 /);
      expect(list.textContent).toContain('文件内重复');
      const checked = list.querySelectorAll('[role="radio"][aria-checked="true"]');
      expect(Array.from(checked).map((r) => r.textContent!.trim())).toEqual(['跳过', '跳过']);
      // one tab stop for the whole list
      expect(list.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
      const note = q('dialog-note');
      expect(note.textContent!.trim()).toBe('将导入 1 个，跳过 2 个。');
      const start = q('dialog-confirm');
      expect(start.textContent!.trim()).toBe('开始导入');
      expect(start.getAttribute('aria-describedby')).toBe(note.id);
      // Tab order: 全部跳过 → 全部作为副本 → list → 取消 → 开始导入
      const order = Array.from(
        dialog.querySelectorAll<HTMLElement>('button:not([hidden]):not([tabindex="-1"])'),
      ).map((b) => b.dataset['testid'] ?? b.getAttribute('role'));
      expect(order).toEqual([
        'backup-skip-all',
        'backup-copy-all',
        'radio',
        'dialog-cancel',
        'dialog-confirm',
      ]);
    });

    it('keyboard: ←→ switch the row, ↑↓ move between rows; bulk buttons', async () => {
      await open(duplicates);
      const first = q('backup-row-0').querySelector<HTMLElement>('[aria-checked="true"]')!;
      first.focus();
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await settle();
      expect(q('backup-row-0').querySelector('[aria-checked="true"]')!.textContent!.trim()).toBe(
        '作为副本',
      );
      expect(q('dialog-note').textContent!.trim()).toBe('将导入 2 个，跳过 1 个。');
      const nowChecked = q('backup-row-0').querySelector<HTMLElement>('[aria-checked="true"]')!;
      nowChecked.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await settle();
      expect(document.activeElement?.closest('[role="radiogroup"]')).toBe(q('backup-row-2'));
      q('backup-copy-all').click();
      await settle();
      expect(q('dialog-note').textContent!.trim()).toBe('将导入 3 个，跳过 0 个。');
    });

    it('全部跳过 still imports the new ones: 开始导入 stays enabled', async () => {
      await open(duplicates);
      q('backup-skip-all').click();
      await settle();
      expect(q('dialog-confirm').getAttribute('aria-disabled')).toBeNull();
    });

    it('everything a duplicate and skipped: disabled + 「所有项都选了跳过…」', async () => {
      show([makeListItem({ id: 'a' })]);
      api['importPick']!.mockResolvedValue(
        ok({
          outcome: 'confirm',
          token: 't1',
          items: [items[0]],
          conflicts: [{ ...items[0], index: 0, source: 'existing' }],
          memory: false,
          backup: { exportedAt: '2026-10-15T07:58:00.000Z', appVersion: '0.2.0' },
        }),
      );
      q('history-import').click();
      await settle();
      expect(q('dialog-confirm').getAttribute('aria-disabled')).toBe('true');
      expect(q('dialog-note').textContent!.trim()).toBe('所有项都选了跳过，没有要导入的内容。');
      q('dialog-confirm').click();
      expect(api['importCommit']).not.toHaveBeenCalled();
    });
  });
});
