"use client";

import { create } from "zustand";

export type LocalUser = {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
};

export type CloudUser = LocalUser & {
    email: string;
    role: "user" | "admin";
    status: "active" | "disabled";
    createdAt?: string;
    updatedAt?: string;
};

type UserStore = {
    user: CloudUser | null;
    setUser: (user: CloudUser | null) => void;
    clearSession: () => void;
};

export const useUserStore = create<UserStore>()((set) => ({
    user: null,
    setUser: (user) => set({ user }),
    clearSession: () => set({ user: null }),
}));
