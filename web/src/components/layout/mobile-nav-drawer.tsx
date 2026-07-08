"use client";

import { Drawer } from "antd";
import Link from "next/link";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/stores/use-user-store";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, onClose }: MobileNavDrawerProps) {
    const user = useUserStore((state) => state.user);
    const visibleTools = navigationTools.filter((tool) => !("adminOnly" in tool) || !tool.adminOnly || user?.role === "admin");
    return (
        <Drawer title={null} placement="left" size={320} open={open} onClose={onClose} className="md:hidden">
            <div className="mb-5 rounded-xl border border-border bg-accent/35 p-4">
                <div className="text-lg font-semibold text-foreground">无限画布</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">从画布、工作台和素材库继续你的创作流程。</p>
                <Link href="/canvas?mode=recent" onClick={onClose} className="mt-4 inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:opacity-90">
                    继续最近画布
                </Link>
            </div>
            <div className="space-y-1">
                {visibleTools.map((tool) => {
                    const Icon = tool.icon;
                    const active = tool.slug === activeToolSlug;
                    return (
                        <Link
                            key={tool.slug}
                            href={`/${tool.slug}`}
                            onClick={onClose}
                            className={cn(
                                "studio-focus-ring flex items-center gap-3 rounded-lg px-3 py-3 text-base transition",
                                active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                            )}
                        >
                            <Icon className={cn("size-5", active && "text-cyan-700 dark:text-cyan-300")} />
                            <span>{tool.label}</span>
                        </Link>
                    );
                })}
            </div>
        </Drawer>
    );
}
