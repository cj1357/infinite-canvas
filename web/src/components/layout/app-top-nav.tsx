"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { AppConfigModal } from "@/components/layout/app-config-modal";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/stores/use-user-store";
import { useState } from "react";

export function AppTopNav() {
    const pathname = usePathname();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const user = useUserStore((state) => state.user);
    const visibleTools = navigationTools.filter((tool) => !("adminOnly" in tool) || !tool.adminOnly || user?.role === "admin");
    const hideHeader = /^\/canvas\/[^/]+/.test(pathname);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = visibleTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;

    return (
        <>
            {!hideHeader ? (
                <header className="sticky top-0 z-20 h-14 shrink-0 border-b border-border/75 bg-background/88 backdrop-blur-xl">
                    <div className="mx-auto flex h-full max-w-[1440px] items-stretch justify-between gap-5 px-4 sm:px-6">
                        <div className="flex min-w-0 items-center">
                            <Link href="/" className="group flex h-full shrink-0 items-center gap-2.5 text-sm font-semibold leading-none text-foreground transition hover:text-cyan-700 dark:hover:text-cyan-200">
                                <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-card/70 transition group-hover:border-cyan-400/70 group-hover:bg-cyan-400/10">
                                    <span
                                        className="size-4 bg-current"
                                        style={{
                                            mask: "url(/logo.svg) center / contain no-repeat",
                                            WebkitMask: "url(/logo.svg) center / contain no-repeat",
                                        }}
                                    />
                                </span>
                                <span className="text-[15px] font-semibold tracking-tight">无限画布</span>
                            </Link>

                            <button
                                type="button"
                                className="studio-focus-ring ml-3 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground md:hidden"
                                onClick={() => setMobileNavOpen(true)}
                                aria-label="打开导航菜单"
                                title="导航菜单"
                            >
                                <Menu className="size-5" />
                            </button>

                            <nav className="hide-scrollbar ml-8 hidden h-14 min-w-0 items-center gap-1 overflow-x-auto md:flex">
                                {visibleTools.map((tool) => {
                                    const Icon = tool.icon;
                                    const active = tool.slug === activeToolSlug;
                                    return (
                                        <Link
                                            key={tool.slug}
                                            href={`/${tool.slug}`}
                                            aria-current={active ? "page" : undefined}
                                            className={cn(
                                                "group relative flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm leading-6 transition",
                                                active
                                                    ? "font-medium text-foreground"
                                                    : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                                            )}
                                        >
                                            <span className={cn("absolute inset-x-3 -bottom-2 h-px origin-center scale-x-0 bg-cyan-500 transition dark:bg-cyan-300", active && "scale-x-100")} />
                                            <Icon className={cn("size-4 transition", active ? "text-cyan-700 dark:text-cyan-300" : "text-muted-foreground group-hover:text-foreground")} />
                                            <span className="truncate">{tool.label}</span>
                                        </Link>
                                    );
                                })}
                            </nav>
                        </div>

                        <div className="my-auto flex h-9 min-w-0 items-center justify-end gap-2 justify-self-end whitespace-nowrap">
                            <UserStatusActions />
                        </div>
                    </div>
                </header>
            ) : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
            <AppConfigModal />
        </>
    );
}
