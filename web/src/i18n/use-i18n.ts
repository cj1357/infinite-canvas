"use client";

import { useCallback } from "react";

import { translate, type Locale } from "@/i18n";
import { useLocaleStore } from "@/stores/use-locale-store";

export function useI18n() {
    const locale = useLocaleStore((state) => state.locale);
    const setLocale = useLocaleStore((state) => state.setLocale);
    const t = useCallback((key: string, params?: Record<string, string | number>) => translate(locale, key, params), [locale]);

    return { locale, setLocale, t };
}

export type { Locale };
