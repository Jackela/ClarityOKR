import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { DraftKeyResult } from '../okr-sticky/state/edit-mode.store';
import { TextEditComponent, type TextSaveFailure } from './text-edit.component';

@Component({
  standalone: true,
  imports: [TextEditComponent],
  template: `<clarityokr-text-edit
    [objective]="objective"
    [keyResults]="keyResults"
    [canUndo]="canUndo"
    [canRedo]="canRedo"
    [canSave]="canSave"
    [saving]="saving"
    [saveError]="saveError"
    [focusTarget]="focusTarget"
    (objectiveChange)="objective = $event; log.push('objective')"
    (statementChange)="log.push('statement:' + $event.id + ':' + $event.value)"
    (metricChange)="log.push('metric:' + $event.id + ':' + $event.value)"
    (undo)="log.push('undo')"
    (redo)="log.push('redo')"
    (save)="log.push('save')"
    (cancel)="log.push('cancel')"
    (boundary)="log.push('boundary')"
  />`,
})
class Host {
  objective = '提升团队交付效率';
  keyResults: DraftKeyResult[] = [
    { id: 'a', statement: '把发布频率提到每周 3 次', successMetric: '' },
    { id: 'b', statement: '缺陷逃逸率降到 5% 以下', successMetric: '每周缺陷数' },
  ];
  canUndo = false;
  canRedo = false;
  canSave = false;
  saving = false;
  saveError: TextSaveFailure = 'none';
  focusTarget: { id: string; field: 'statement' | 'metric' } | null = null;
  log: string[] = [];
}

describe('TextEditComponent (spec §3.9, §3.9a, T13)', () => {
  let fixture: ComponentFixture<Host>;
  const host = (): Host => fixture.componentInstance;
  const root = (): HTMLElement => fixture.nativeElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
    root().querySelector(`[data-testid="${id}"]`);
  const area = (id: string): HTMLTextAreaElement => q<HTMLTextAreaElement>(id)!;
  const render = (): void => fixture.detectChanges();
  const key = (
    init: KeyboardEventInit,
    target: HTMLElement = area('edit-objective'),
  ): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    render();
    return event;
  };
  const create = (): void => {
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    render();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host] });
    create();
  });
  afterEach(() => fixture.nativeElement.remove());

  it('has real labels: 目标, 关键结果 n, and 关键结果 n 的度量 (with the visible 度量 text)', () => {
    const labelOf = (id: string): string =>
      root()
        .querySelector(`label[for="${area(id).id}"]`)!
        .textContent!.replace(/\s+/g, ' ')
        .trim();
    expect(labelOf('edit-objective')).toBe('目标');
    expect(labelOf('edit-kr-0')).toBe('关键结果 1');
    expect(labelOf('edit-kr-1')).toBe('关键结果 2');
    expect(labelOf('edit-metric-0')).toBe('关键结果 1 的度量（怎样算 0–100%）');
    expect(labelOf('edit-metric-1')).toBe('关键结果 2 的度量（怎样算 0–100%）');
  });

  it('has exactly two inputs per key result (text and metric) and no remove entry (G10)', () => {
    expect(root().querySelectorAll('textarea')).toHaveLength(1 + 2 * 2);
    expect(root().textContent).not.toMatch(/移除关键结果|删除关键结果/);
    const names = Array.from(root().querySelectorAll('button')).map((b) => b.textContent!.trim());
    expect(names.some((n) => n.includes('移除') || n.includes('删除'))).toBe(false);
  });

  it('shows the emoji-counts-as-one explanation and the progress note once, above the fields', () => {
    expect(q('edit-explain')!.textContent).toBe('字数按字符计，一个 emoji 算 1 个字符。');
    expect(root().textContent).toContain('进度与状态请在编辑完成后更新。');
  });

  it('every field has a permanent counter with its own limit (200 each)', () => {
    const counts = [
      'edit-objective',
      'edit-kr-0',
      'edit-metric-0',
      'edit-kr-1',
      'edit-metric-1',
    ].map((id) => q(`${id}-count`)!.textContent!.replace(/\s+/g, ''));
    expect(counts).toEqual(['8/200', '13/200', '0/200', '13/200', '5/200']);
  });

  it('uses the spec placeholders for the metric and for a key result', () => {
    expect(area('edit-metric-0').placeholder).toBe(
      '例如：每周正式发布次数（0% = 每周 1 次，100% = 每周 3 次）',
    );
    expect(area('edit-kr-0').placeholder).toBe('写下一个可衡量的关键结果');
  });

  it('Tab order in the DOM: objective → KR1 → KR1 metric → KR2 → KR2 metric → 撤销 → 重做 → 取消 → 保存', () => {
    host().canUndo = true;
    host().canRedo = true;
    host().canSave = true;
    render();
    const order = Array.from(root().querySelectorAll<HTMLElement>('textarea, button')).map((el) =>
      el.getAttribute('data-testid'),
    );
    expect(order).toEqual([
      'edit-objective',
      'edit-kr-0',
      'edit-metric-0',
      'edit-kr-1',
      'edit-metric-1',
      'edit-undo',
      'edit-redo',
      'edit-cancel',
      'edit-save',
    ]);
  });

  it('focuses the objective on open', () => {
    expect(document.activeElement).toBe(area('edit-objective'));
  });

  it('focuses the new key result when the add flow asks for it', () => {
    fixture.nativeElement.remove();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.focusTarget = { id: 'b', field: 'statement' };
    document.body.appendChild(fixture.nativeElement);
    render();
    expect(document.activeElement).toBe(area('edit-kr-1'));
  });

  it('focuses a metric for 添加度量', () => {
    fixture.nativeElement.remove();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.focusTarget = { id: 'a', field: 'metric' };
    document.body.appendChild(fixture.nativeElement);
    render();
    expect(document.activeElement).toBe(area('edit-metric-0'));
  });

  describe('bottom bar', () => {
    it('undo / redo / save are disabled without history, change or validity; cancel is not', () => {
      expect(q<HTMLButtonElement>('edit-undo')!.disabled).toBe(true);
      expect(q<HTMLButtonElement>('edit-redo')!.disabled).toBe(true);
      expect(q<HTMLButtonElement>('edit-save')!.disabled).toBe(true);
      expect(q<HTMLButtonElement>('edit-cancel')!.disabled).toBe(false);
      host().canUndo = true;
      host().canSave = true;
      render();
      expect(q<HTMLButtonElement>('edit-undo')!.disabled).toBe(false);
      expect(q<HTMLButtonElement>('edit-redo')!.disabled).toBe(true);
      expect(q<HTMLButtonElement>('edit-save')!.disabled).toBe(false);
    });

    it('undo / redo show icon + text and their tooltips name the shortcuts', () => {
      const undo = root().querySelector('clarityokr-button[title]')!;
      expect(undo.getAttribute('title')).toBe('撤销文字修改（Ctrl/⌘+Z）');
      expect(root().querySelectorAll('clarityokr-button[title]')[1]!.getAttribute('title')).toBe(
        '重做文字修改（Ctrl/⌘+Shift+Z）',
      );
      expect(q('edit-undo')!.textContent).toContain('撤销');
      expect(q('edit-undo')!.querySelector('svg')).not.toBeNull();
      expect(q('edit-undo')!.getAttribute('aria-label')).toBe('撤销文字修改');
      expect(q('edit-redo')!.getAttribute('aria-label')).toBe('重做文字修改');
    });

    it('clicks emit undo / redo / cancel / save', () => {
      host().canUndo = host().canRedo = host().canSave = true;
      render();
      q('edit-undo')!.click();
      q('edit-redo')!.click();
      q('edit-cancel')!.click();
      q('edit-save')!.click();
      expect(host().log).toEqual(['undo', 'redo', 'cancel', 'save']);
    });

    it('shows nothing about progress in the bar', () => {
      expect(q('edit-bar')!.textContent).not.toMatch(/进度|状态/);
    });
  });

  describe('keyboard', () => {
    beforeEach(() => {
      host().canUndo = host().canRedo = host().canSave = true;
      render();
    });

    it('Ctrl/⌘+Z undoes (native undo is suppressed), Ctrl/⌘+Shift+Z and Ctrl+Y redo', () => {
      expect(key({ key: 'z', ctrlKey: true }).defaultPrevented).toBe(true);
      expect(key({ key: 'z', metaKey: true }).defaultPrevented).toBe(true);
      expect(key({ key: 'Z', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
      expect(key({ key: 'z', metaKey: true, shiftKey: true }).defaultPrevented).toBe(true);
      expect(key({ key: 'y', ctrlKey: true }).defaultPrevented).toBe(true);
      expect(host().log).toEqual(['undo', 'undo', 'redo', 'redo', 'redo']);
    });

    it('does not undo / redo when there is nothing to undo / redo', () => {
      host().canUndo = host().canRedo = false;
      render();
      key({ key: 'z', ctrlKey: true });
      key({ key: 'y', ctrlKey: true });
      expect(host().log).toEqual([]);
    });

    it('Ctrl/⌘+Enter saves, but not when saving is not allowed (over the limit)', () => {
      key({ key: 'Enter', ctrlKey: true });
      key({ key: 'Enter', metaKey: true });
      expect(host().log).toEqual(['save', 'save']);
      host().canSave = false;
      render();
      key({ key: 'Enter', ctrlKey: true });
      key({ key: 's', ctrlKey: true });
      expect(host().log).toEqual(['save', 'save']);
    });

    it('a plain Enter does not save (it is a text area)', () => {
      expect(key({ key: 'Enter' }).defaultPrevented).toBe(false);
      expect(host().log).toEqual([]);
    });

    it('Esc asks to cancel (the parent decides about the confirmation)', () => {
      key({ key: 'Escape' });
      expect(host().log).toEqual(['cancel']);
    });

    it('nothing runs while a save is pending', () => {
      host().saving = true;
      render();
      key({ key: 'Escape' });
      key({ key: 'z', ctrlKey: true });
      expect(host().log).toEqual([]);
      expect(area('edit-objective').readOnly).toBe(true);
    });
  });

  describe('IME composition (design ruling)', () => {
    it('Esc during a composition only ends the composition: no cancel', () => {
      host().log = [];
      const event = key({ key: 'Escape', isComposing: true });
      expect(event.defaultPrevented).toBe(false);
      expect(host().log).toEqual([]);
      key({ key: 'Escape' });
      expect(host().log).toEqual(['cancel']);
    });

    it('keyCode 229 (what IMEs send) is treated as composing too', () => {
      host().log = [];
      area('edit-objective').dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          keyCode: 229,
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(host().log).toEqual([]);
    });

    it('Ctrl/⌘+Z, Shift+Z, Y and Ctrl+Enter / S do nothing during a composition', () => {
      host().canUndo = host().canRedo = host().canSave = true;
      render();
      host().log = [];
      for (const init of [
        { key: 'z', ctrlKey: true },
        { key: 'z', metaKey: true, shiftKey: true },
        { key: 'y', ctrlKey: true },
        { key: 'Enter', ctrlKey: true },
        { key: 's', ctrlKey: true },
      ]) {
        expect(key({ ...init, isComposing: true }).defaultPrevented).toBe(false);
      }
      expect(host().log).toEqual([]);
    });

    it('provisional composition text does not reach the owner; the final text does, once', () => {
      host().log = [];
      const field = area('edit-objective');
      field.dispatchEvent(new Event('compositionstart', { bubbles: true }));
      field.value = '目标ni';
      field.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
      field.value = '目标你';
      field.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
      render();
      expect(host().log).toEqual([]);
      field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      render();
      expect(host().log).toEqual(['objective']);
    });
  });

  describe('undo step boundaries (spec §3.9)', () => {
    const input = (id: string, value: string): void => {
      area(id).value = value;
      area(id).dispatchEvent(new Event('input', { bubbles: true }));
      render();
    };

    it('leaving an input (blur) ends the step', () => {
      host().log = [];
      area('edit-objective').dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      expect(host().log).toEqual(['boundary']);
    });

    it('a paste ends the running step before the pasted text, and the text after it', async () => {
      host().log = [];
      area('edit-objective').dispatchEvent(new Event('paste', { bubbles: true }));
      input('edit-objective', '粘贴的内容');
      input('edit-objective', '粘贴的内容再输入');
      expect(host().log).toEqual(['boundary', 'objective', 'boundary', 'objective']);
    });

    it('a paste without an input event does not leave the flag behind', async () => {
      jest.useFakeTimers();
      try {
        host().log = [];
        area('edit-objective').dispatchEvent(new Event('paste', { bubbles: true }));
        jest.runAllTimers();
        input('edit-objective', '之后正常输入');
        expect(host().log).toEqual(['boundary', 'objective']);
      } finally {
        jest.useRealTimers();
      }
    });

    it('plain typing emits no boundary', () => {
      host().log = [];
      input('edit-objective', '一');
      input('edit-objective', '一二');
      expect(host().log).toEqual(['objective', 'objective']);
    });
  });

  describe('validation', () => {
    const type = (id: string, text: string): void => {
      area(id).value = text;
      area(id).dispatchEvent(new Event('input', { bubbles: true }));
      render();
    };

    it('typing emits the change of the right field', () => {
      type('edit-kr-1', '新的文字');
      type('edit-metric-0', '度量甲');
      type('edit-objective', '新目标');
      expect(host().log).toEqual(['statement:b:新的文字', 'metric:a:度量甲', 'objective']);
    });

    it('an emptied key result shows its error after it was touched; an untouched one does not', () => {
      expect(q('edit-kr-0-error')!.textContent!.trim()).toBe('');
      host().keyResults = [{ ...host().keyResults[0]!, statement: '' }, host().keyResults[1]!];
      type('edit-kr-0', '');
      expect(q('edit-kr-0-error')!.textContent).toContain('关键结果不能为空。');
      expect(area('edit-kr-0').getAttribute('aria-invalid')).toBe('true');
    });

    it('an empty new key result shows its error once the focus leaves it', () => {
      host().keyResults = [...host().keyResults, { id: 'n', statement: '', successMetric: '' }];
      render();
      expect(q('edit-kr-2-error')!.textContent!.trim()).toBe('');
      area('edit-kr-2').focus();
      area('edit-kr-2').blur();
      render();
      expect(q('edit-kr-2-error')!.textContent).toContain('关键结果不能为空。');
    });

    it('over-limit text shows the counter, error row and describes the disabled save button', () => {
      host().keyResults = [
        host().keyResults[0]!,
        { ...host().keyResults[1]!, successMetric: '度'.repeat(236) },
      ];
      render();
      expect(q('edit-metric-1-count')!.textContent!.replace(/\s+/g, '')).toBe('⚠236/200');
      expect(q('edit-metric-1-error')!.textContent).toContain('超出 36 个字符，请删减后再保存。');
      expect(area('edit-metric-1').getAttribute('aria-describedby')).toContain('edit-metric-');
      const save = q<HTMLButtonElement>('edit-save')!;
      expect(save.disabled).toBe(true);
      expect(save.getAttribute('aria-describedby')).toBe(q('edit-metric-1-error')!.id);
    });

    it('a disabled save with an empty field is explained by a hidden sentence', () => {
      host().keyResults = [{ ...host().keyResults[0]!, statement: '' }, host().keyResults[1]!];
      render();
      const save = q<HTMLButtonElement>('edit-save')!;
      expect(save.getAttribute('aria-describedby')).toBe('edit-save-hint');
      expect(root().querySelector('#edit-save-hint')!.textContent).toBe(
        '还有内容没有填写，暂时不能保存。',
      );
    });

    it('a failed save keeps the form and says so in an alert; the raw error is never shown', () => {
      host().saveError = 'failed';
      render();
      const alert = q('edit-save-failed')!;
      expect(alert.getAttribute('role')).toBe('alert');
      expect(alert.textContent).toContain('没能保存，你写的内容还在。');
      host().saveError = 'over_limit';
      render();
      expect(q('edit-save-failed')!.textContent).toContain('没能保存：内容超出字数上限。');
    });
  });
});
