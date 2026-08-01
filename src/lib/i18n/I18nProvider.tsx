'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { dictionaries, isLocale, type Dictionary, type Locale } from '@/lib/i18n/dictionaries';

const STORAGE_KEY = 'fvs_locale';

type I18nValue = {
  locale: Locale;
  t: Dictionary;
  setLocale: (l: Locale) => void;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) setLocaleState(saved);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  }, []);

  const value = useMemo(
    () => ({ locale, t: dictionaries[locale], setLocale }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export function LangSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
      <span style={{ color: '#8f8578' }}>{t.lang}</span>
      <button
        type="button"
        onClick={() => setLocale('zh')}
        style={btn(locale === 'zh')}
      >
        中文
      </button>
      <button
        type="button"
        onClick={() => setLocale('en')}
        style={btn(locale === 'en')}
      >
        EN
      </button>
    </div>
  );
}

function btn(on: boolean): React.CSSProperties {
  return {
    border: `1px solid ${on ? '#c4a57499' : '#ffffff22'}`,
    background: on ? '#c4a57422' : 'transparent',
    color: on ? '#f0e2cf' : '#b5a893',
    padding: '0.2rem 0.45rem',
    cursor: 'pointer',
    font: 'inherit',
  };
}
