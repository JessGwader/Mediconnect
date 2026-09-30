import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

// Architecture is extensible: adding a language later is "drop a new
// locales/xx.json file + one line here" — nothing in the component tree
// hard-codes English strings (see LanguageSwitcher + t() calls throughout).
export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
];

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  lng: localStorage.getItem("mc_lang") || "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => localStorage.setItem("mc_lang", lng));

export default i18n;
