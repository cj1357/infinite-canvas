import { enUS } from "./locales/en-US";
import { zhCN } from "./locales/zh-CN";

export const locales = ["zh-CN", "en-US"] as const;
export type Locale = (typeof locales)[number];
export type MessageKey = keyof typeof zhCN | keyof typeof enUS;

export const defaultLocale: Locale = "zh-CN";

export const messages: Record<Locale, Record<string, string>> = {
    "zh-CN": zhCN,
    "en-US": enUS,
};

export function normalizeLocale(value?: string | null): Locale {
    if (!value) return defaultLocale;
    const normalized = value.toLowerCase();
    if (normalized.startsWith("zh")) return "zh-CN";
    if (normalized.startsWith("en")) return "en-US";
    return defaultLocale;
}

export function translate(locale: Locale, key: string, params?: Record<string, string | number>) {
    const template = messages[locale]?.[key] || messages[defaultLocale][key] || key;
    if (!params) return template;
    return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
}
