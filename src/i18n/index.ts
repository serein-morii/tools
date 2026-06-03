import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";

export type Language = "zh" | "en" | "ja" | "ko";

const DEFAULT_LANGUAGE: Language = "zh";
const STORAGE_KEY = "language";

const LANGUAGES: readonly Language[] = ["zh", "en", "ja", "ko"];

function isLanguage(value: string | null | undefined): value is Language {
  return LANGUAGES.includes(value as Language);
}

function getInitialLanguage(): Language {
  // 1. Check stored preference
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isLanguage(stored)) return stored;
    } catch {
      // localStorage may be unavailable
    }
  }

  // 2. Detect from browser
  if (typeof navigator !== "undefined") {
    const lang = (navigator.language ?? navigator.languages?.[0] ?? "").toLowerCase();
    for (const code of LANGUAGES) {
      if (lang.startsWith(code)) {
        // Persist detected language for next visit
        try {
          window.localStorage.setItem(STORAGE_KEY, code);
        } catch {
          // ignore
        }
        return code;
      }
    }
  }

  return DEFAULT_LANGUAGE;
}

const resources = {
  en: { translation: en },
  zh: { translation: zh },
  ja: { translation: ja },
  ko: { translation: ko },
};

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
  debug: false,
});

export default i18n;
