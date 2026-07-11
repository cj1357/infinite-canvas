"use client";

import { type ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AppTopNav } from "@/components/layout/app-top-nav";
import { useUserStore } from "@/stores/use-user-store";

export default function UserLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const user = useUserStore((state) => state.user);
    const sessionChecked = useUserStore((state) => state.sessionChecked);

    useEffect(() => {
        if (sessionChecked && !user && pathname !== "/account") {
            router.replace("/account");
        }
    }, [sessionChecked, user, pathname, router]);

    if (!sessionChecked) {
        return (
            <div className="flex h-dvh items-center justify-center bg-background text-sm text-stone-500">
                正在加载...
            </div>
        );
    }

    if (!user && pathname !== "/account") {
        return null;
    }

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
            <AppTopNav />
            <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </div>
    );
}
