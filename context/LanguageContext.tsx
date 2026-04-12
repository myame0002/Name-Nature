import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Language, translations, TranslationKeys } from '@/lib/i18n';
import * as SecureStore from 'expo-secure-store';

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("ja");

  // 言語設定を保存して状態を更新
  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    await SecureStore.setItemAsync('app_language', lang);
  };

  // アプリ起動時に保存された言語設定を読み込み
  useEffect(() => {
    const loadSavedLanguage = async () => {
      const savedLanguage = await SecureStore.getItemAsync('app_language');
      if (savedLanguage === 'ja' || savedLanguage === 'en') {
        setLanguageState(savedLanguage as Language);
      }
    };
    loadSavedLanguage();
  }, []);

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