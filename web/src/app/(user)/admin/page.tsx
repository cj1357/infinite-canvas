"use client";

import Link from "next/link";
import { Activity, Gauge, KeyRound, ListChecks, ReceiptText, Users } from "lucide-react";

import { useI18n } from "@/i18n/use-i18n";

const adminSections = [
    { href: "/admin/gateway", titleKey: "admin.gateway.title", descriptionKey: "admin.gateway.description", icon: KeyRound },
    { href: "/admin/models", titleKey: "admin.models.title", descriptionKey: "admin.models.description", icon: Gauge },
    { href: "/admin/rates", titleKey: "admin.rates.title", descriptionKey: "admin.rates.description", icon: ReceiptText },
    { href: "/admin/prompts", titleKey: "admin.prompts.title", descriptionKey: "admin.prompts.description", icon: ListChecks },
    { href: "/admin/generations", titleKey: "admin.generations.title", descriptionKey: "admin.generations.description", icon: Activity },
    { href: "/admin/users", titleKey: "admin.users.title", descriptionKey: "admin.users.description", icon: Users },
] as const;

export default function AdminHomePage() {
    const { t } = useI18n();
    return (
        <main className="h-full overflow-y-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
                <header className="border-b border-stone-200 pb-6 dark:border-stone-800">
                    <h1 className="text-2xl font-semibold">{t("admin.index.title")}</h1>
                    <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">{t("admin.index.description")}</p>
                </header>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {adminSections.map((section) => {
                        const Icon = section.icon;
                        return (
                            <Link key={section.href} href={section.href} className="group border border-stone-200 bg-white p-5 transition hover:border-stone-400 dark:border-stone-800 dark:bg-stone-950 dark:hover:border-stone-600">
                                <div className="flex items-start gap-4">
                                    <span className="grid size-10 shrink-0 place-items-center border border-stone-200 text-stone-500 transition group-hover:text-stone-950 dark:border-stone-800 dark:text-stone-400 dark:group-hover:text-stone-100">
                                        <Icon className="size-5" />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-base font-semibold">{t(section.titleKey)}</span>
                                        <span className="mt-2 line-clamp-3 block text-sm leading-6 text-stone-500 dark:text-stone-400">{t(section.descriptionKey)}</span>
                                    </span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </main>
    );
}
