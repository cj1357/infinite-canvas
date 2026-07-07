"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { defaultLocale, normalizeLocale, type Locale } from "@/i18n";

type LocaleStore = {
    locale: Locale;
    setLocale: (locale: Locale) => void;
};

function initialLocale() {
    if (typeof navigator === "undefined") return defaultLocale;
    return normalizeLocale(navigator.language);
}

export const useLocaleStore = create<LocaleStore>()(
    persist(
        (set) => ({
            locale: initialLocale(),
            setLocale: (locale) => set({ locale }),
        }),
        {
            name: "infinite-canvas:locale",
            merge: (persisted, current) => {
                const value = (persisted || {}) as Partial<LocaleStore>;
                return { ...current, locale: normalizeLocale(value.locale) };
            },
        },
    ),
);
