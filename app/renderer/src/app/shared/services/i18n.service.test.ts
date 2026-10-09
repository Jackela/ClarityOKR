import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslatePipe } from '../pipes/translate.pipe';
import { I18nService, type InterpolationParams } from './i18n.service';

@Component({
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <button>{{ 'common.save' | translate }}</button>
    <p>{{ 'okr.sticky.editMode.charCount' | translate: params }}</p>
  `,
})
class TranslationHost {
  readonly i18n = inject(I18nService);
  params: InterpolationParams = { current: 0, max: 100 };
}

describe('I18nService public language contracts', () => {
  afterEach(() => {
    jest.dontMock('../i18n/messages.en-US.json');
    jest.restoreAllMocks();
    jest.resetModules();
  });

  function service(): I18nService {
    TestBed.configureTestingModule({});
    return TestBed.inject(I18nService);
  }

  it('provides default Chinese synchronously through the actual template pipe', () => {
    TestBed.configureTestingModule({ imports: [TranslationHost] });
    const fixture = TestBed.createComponent(TranslationHost);
    fixture.detectChanges();
    expect(fixture.componentInstance.i18n.getLocale()).toBe('zh-CN');
    expect(fixture.nativeElement.querySelector('button').textContent).toBe('保存');
    expect(fixture.nativeElement.querySelector('p').textContent).toBe('0/100');
  });

  it('updates an existing DOM translation after locale changes with unchanged keys', async () => {
    TestBed.configureTestingModule({ imports: [TranslationHost] });
    const fixture = TestBed.createComponent(TranslationHost);
    fixture.detectChanges();
    await fixture.componentInstance.i18n.setLocale('en-US');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button').textContent).toBe('Save');
    await fixture.componentInstance.i18n.setLocale('zh-CN');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button').textContent).toBe('保存');
    fixture.componentInstance.params = { current: 5, max: 20 };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('p').textContent).toBe('5/20');
  });

  it('loads the real English message pack and switches back to cached Chinese', async () => {
    const i18n = service();
    await i18n.setLocale('en-US');
    expect(i18n.currentLocale()).toBe('en-US');
    expect(i18n.translate('app.startClarification')).toBe('Start clarification');
    expect(i18n.hasTranslation('common.save')).toBe(true);
    await i18n.setLocale('zh-CN');
    expect(i18n.getLocale()).toBe('zh-CN');
    expect(i18n.translate('common.save')).toBe('保存');
    await i18n.setLocale('en-US');
    expect(i18n.translate('common.close')).toBe('Close');
  });

  it('preserves unknown keys and rejects object or primitive traversal as translations', () => {
    const i18n = service();
    for (const key of ['missing', 'common.missing.next', 'common.save.next', 'common', '']) {
      expect(i18n.translate(key)).toBe(key);
      expect(i18n.hasTranslation(key)).toBe(false);
    }
    expect(i18n.hasTranslation('clarification.wizard.ready.title')).toBe(true);
  });

  it('interpolates zero and string values while retaining missing placeholders', () => {
    const i18n = service();
    expect(i18n.translate('okr.sticky.editMode.charCount', { current: 0, max: 100 })).toBe('0/100');
    expect(i18n.translate('okr.sticky.editMode.charCount', { current: '$&' })).toBe('$&/{max}');
    expect(i18n.translate('okr.sticky.editMode.charCount', {})).toBe('{current}/{max}');
    expect(i18n.translate('clarification.wizard.keyboardHint', { count: 3 })).toBe(
      '提示：按数字键 1-3 快速选择',
    );
    expect(i18n.translate('common.save', { irrelevant: 1 })).toBe('保存');
  });

  it('uses Chinese fallback for missing, null and non-string English entries', async () => {
    jest.doMock('../i18n/messages.en-US.json', () => ({
      __esModule: true,
      common: { save: null, error: 42 },
      broken: null,
    }));
    const i18n = service();
    await i18n.setLocale('en-US');
    expect(i18n.getLocale()).toBe('en-US');
    expect(i18n.translate('common.save')).toBe('保存');
    expect(i18n.translate('common.error')).toBe('错误');
    expect(i18n.translate('clarification.wizard.keyboardHint', { count: 4 })).toBe(
      '提示：按数字键 1-4 快速选择',
    );
    expect(i18n.hasTranslation('common.save')).toBe(true);
    expect(i18n.translate('broken.child')).toBe('broken.child');
    expect(i18n.hasTranslation('broken.child')).toBe(false);
    expect(i18n.translate('missing')).toBe('missing');
    expect(i18n.hasTranslation('missing')).toBe(false);
  });

  it('accepts a default-export message module and keeps missing-key fallback', async () => {
    jest.doMock('../i18n/messages.en-US.json', () => ({
      __esModule: true,
      default: { common: { save: 'Module save' } },
    }));
    const i18n = service();
    await i18n.setLocale('en-US');
    expect(i18n.translate('common.save')).toBe('Module save');
    expect(i18n.translate('common.close')).toBe('关闭');
    expect(i18n.hasTranslation('common.close')).toBe(true);
  });

  it('warns once on message loading failure and continues with Chinese fallback', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.doMock('../i18n/messages.en-US.json', () => {
      throw new Error('Controlled message loader failure');
    });
    const i18n = service();
    await expect(i18n.setLocale('en-US')).resolves.toBeUndefined();
    expect(i18n.getLocale()).toBe('en-US');
    expect(i18n.translate('common.save')).toBe('保存');
    expect(i18n.hasTranslation('common.save')).toBe(true);
    expect(i18n.translate('missing')).toBe('missing');
    expect(i18n.hasTranslation('missing')).toBe(false);
    await i18n.setLocale('en-US');
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      '[I18nService] Failed to load locale: en-US',
      expect.objectContaining({ message: 'Controlled message loader failure' }),
    );
  });
});
