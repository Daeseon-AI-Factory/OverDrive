import i18n from './index';

describe('English workout copy', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('uses singular and plural set counts', () => {
    expect(i18n.t('logger.sessionSetCount', { count: 1 })).toContain('1 set this session');
    expect(i18n.t('logger.sessionSetCount', { count: 2 })).toContain('2 sets this session');
  });
});
