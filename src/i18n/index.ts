import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';
import ko from './locales/ko.json';
import zh from './locales/zh.json';

// Default language is ENGLISH (builder requirement). Device auto-detect (expo-localization) is a
// fast-follow that needs a native rebuild; for now the language comes from User.locale (DB) and
// the settings switcher, with 'en' as default + fallback. Adding a language = drop a JSON + a line.

export const SUPPORTED_LOCALES = ['en', 'ko', 'es', 'zh'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = 'en';

export const LOCALE_LABEL: Record<AppLocale, string> = {
  en: 'English',
  ko: '한국어',
  es: 'Español',
  zh: '中文',
};

export const resources = {
  en: { translation: en },
  ko: { translation: ko },
  es: { translation: es },
  zh: { translation: zh },
} as const;

export function isSupportedLocale(x: string | null | undefined): x is AppLocale {
  return !!x && (SUPPORTED_LOCALES as readonly string[]).includes(x);
}

// Synchronous init at module load → first render already has strings (no missing-key flash).
// Boot overrides the language from the DB once settings hydrate.
// eslint-disable-next-line import/no-named-as-default-member -- i18next's default export exposes .use (standard init)
i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: SUPPORTED_LOCALES as unknown as string[],
  compatibilityJSON: 'v4', // Hermes Intl plural coverage is uneven; v4 keeps plurals deterministic
  // Catalogs use SINGLE-brace placeholders ({count}); i18next defaults to {{double}}, so set the
  // delimiters to single braces or interpolation silently no-ops (renders the literal "{count}").
  interpolation: { escapeValue: false, prefix: '{', suffix: '}' }, // React already escapes
  returnNull: false,
});

export default i18n;
