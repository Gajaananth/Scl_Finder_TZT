import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { type Language, translations } from './i18n';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, replacements?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('en');

  const t = useCallback(
    (key: string, replacements?: Record<string, string>) => {
      let text = translations[language][key] ?? key;
      if (replacements) {
        for (const [placeholder, value] of Object.entries(replacements)) {
          text = text.replace(`{${placeholder}}`, value);
        }
      }
      return text;
    },
    [language]
  );

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}
