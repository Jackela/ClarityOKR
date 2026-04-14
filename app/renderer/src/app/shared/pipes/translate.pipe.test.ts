import { TranslatePipe } from './translate.pipe';
import { I18nService } from '../services/i18n.service';

describe('TranslatePipe', () => {
  let pipe: TranslatePipe;
  let mockI18n: Partial<I18nService>;
  const translateSpy = jest.fn();
  const currentLocaleSpy = jest.fn().mockReturnValue('zh-CN');

  beforeEach(() => {
    translateSpy.mockClear();
    translateSpy.mockImplementation((key: string) => `translated:${key}`);
    currentLocaleSpy.mockClear();

    mockI18n = {
      currentLocale: currentLocaleSpy as unknown as I18nService['currentLocale'],
      translate: translateSpy,
    };

    pipe = new TranslatePipe(mockI18n as I18nService);
  });

  it('should create', () => {
    expect(pipe).toBeTruthy();
  });

  it('should call i18n.translate and return translated value', () => {
    const result = pipe.transform('common.save');

    expect(translateSpy).toHaveBeenCalledWith('common.save', undefined);
    expect(result).toBe('translated:common.save');
  });

  it('should pass interpolation params to translate', () => {
    const params = { count: 5 };
    pipe.transform('wizard.hint', params);

    expect(translateSpy).toHaveBeenCalledWith('wizard.hint', params);
  });

  it('should access currentLocale for reactivity', () => {
    pipe.transform('common.save');

    expect(currentLocaleSpy).toHaveBeenCalled();
  });
});
