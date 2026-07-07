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
    sessionChecked: boolean;
    setUser: (user: CloudUser | null) => void;
    markSessionChecked: () => void;
    clearSession: () => void;
};

export const useUserStore = create<UserStore>()((set) => ({
    user: null,
    sessionChecked: false,
    setUser: (user) => set({ user, sessionChecked: true }),
    markSessionChecked: () => set({ sessionChecked: true }),
    clearSession: () => set({ user: null, sessionChecked: true }),
}));
