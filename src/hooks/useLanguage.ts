import { useState, useEffect, useCallback } from 'react';
import { type Language, type TranslationKey, t, getStoredLanguage, setStoredLanguage } from '@/lib/i18n';

export function useLanguage() {
  const [language, setLanguageState] = useState<Language>(() => getStoredLanguage());

  useEffect(() => {
    // Sync with localStorage on mount
    const stored = getStoredLanguage();
    if (stored !== language) {
      setLanguageState(stored);
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setStoredLanguage(lang);
    setLanguageState(lang);
  }, []);

  const translate = useCallback((key: TranslationKey) => {
    return t(key, language);
  }, [language]);

  return {
    language,
    setLanguage,
    t: translate,
  };
}
