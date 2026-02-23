import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhTW from "./zh-TW.json";
import en from "./en.json";

const saved = localStorage.getItem("vedrr-locale");
const defaultLng = saved || (navigator.language.startsWith("zh") ? "zh-TW" : "en");

i18n.use(initReactI18next).init({
  resources: { "zh-TW": { translation: zhTW }, en: { translation: en } },
  lng: defaultLng,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
