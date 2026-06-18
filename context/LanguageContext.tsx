import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Language, translations, TranslationKeys } from '@/lib/i18n';
import * as SecureStore from 'expo-secure-store';
import { getLocales } from 'expo-localization';

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("ja");
  const [isInitialized, setIsInitialized] = useState(false);

  // アプリ起動時に言語設定を決定：端末設定 > 保存設定
  useEffect(() => {
    const initializeLanguage = async () => {
      // 1. 保存済み設定を確認
      const savedLanguage = await SecureStore.getItemAsync('app_language');
      if (savedLanguage === 'ja' || savedLanguage === 'en') {
        setLanguageState(savedLanguage as Language);
        setIsInitialized(true);
        return;
      }

      // 2. 保存設定がない場合 → 端末の言語設定を参照
      const locales = getLocales();
      const deviceLanguage = locales[0]?.languageCode ?? 'en';
      const detectedLang: Language = deviceLanguage === 'ja' ? 'ja' : 'en';
      setLanguageState(detectedLang);
      // 初回は検出した言語を保存しておく
      await SecureStore.setItemAsync('app_language', detectedLang);
      setIsInitialized(true);
    };

    initializeLanguage();
  }, []);

  // 言語設定を保存して状態を更新
  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    await SecureStore.setItemAsync('app_language', lang);
  };

  const t = (key: TranslationKeys, params?: Record<string, string | number>): string => {
    let text: string = (translations[language] as Record<TranslationKeys, string>)[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}