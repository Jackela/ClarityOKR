import { I18nService } from './i18n.service';

it('provides the default translations synchronously on the first render', () => {
  const service = new I18nService();
  expect(service.translate('common.save')).toBe('保存');
  expect(service.translate('app.startClarification')).toBe('开始澄清');
});
