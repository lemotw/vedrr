import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhTW from "./zh-TW.json";
import zhCN from "./zh-CN.json";
import en from "./en.json";
import ja from "./ja.json";

const saved = localStorage.getItem("vedrr-locale");
const defaultLng =
  saved ||
  (navigator.language === "zh-CN" || navigator.language === "zh-SG"
    ? "zh-CN"
    : navigator.language.startsWith("zh")
      ? "zh-TW"
      : navigator.language.startsWith("ja")
        ? "ja"
        : "en");

i18n.use(initReactI18next).init({
  resources: {
    "zh-TW": { translation: zhTW },
    "zh-CN": { translation: zhCN },
    en: { translation: en },
    ja: { translation: ja },
  },
  lng: defaultLng,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
