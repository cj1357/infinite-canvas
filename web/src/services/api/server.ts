import { useUserStore, type CloudUser } from "@/stores/use-user-store";

export const SERVER_API_PREFIX = "/api/server";

export type ServerResponse<T> = {
    code: number;
    data?: T;
    msg: string;
    errorKey?: string;
};

export type ListResult<T> = {
    items: T[];
    total: number;
    page: number;
    size: number;
};

export type CreditAccount = {
    id: string;
    userId: string;
    balanceCredits: number;
    fiveHourLimit: number;
    periodLimit: number;
    periodStart: string;
    periodEnd: string;
    fiveHourResetAt: string;
    planCode: string;
    validUntil: string;
};

export type BillingSummary = {
    account: CreditAccount;
    fiveHourUsed: number;
    fiveHourRemaining: number;
    fiveHourNextRestoreAt: string;
    periodUsed: number;
    periodRemaining: number;
    periodRemainingPercent: number;
    entitlementActive: boolean;
    entitlementExpired: boolean;
};

export type EstimateRequest = {
    ability: string;
    model?: string;
    params?: Record<string, unknown>;
};

export type EstimateResponse = {
    estimateCredits: number;
    ability: string;
    model: string;
};

export function isServerAIEnabled() {
    return true;
}

export function serverAIUrl(path: string) {
    return `${SERVER_API_PREFIX}/ai${path}`;
}

export function serverAIHeaders(contentType?: string) {
    return contentType ? { "Content-Type": contentType } : {};
}

export class ServerApiError extends Error {
    constructor(
        public errorKey: string,
        message: string,
        public status: number,
        public data?: unknown,
    ) {
        super(message);
        this.name = "ServerApiError";
    }
}

export async function serverRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${SERVER_API_PREFIX}${path}`, {
        ...init,
        credentials: "include",
        headers: {
            ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
            ...init?.headers,
        },
    });
    const payload = (await response.json().catch(() => null)) as ServerResponse<T> | null;
    if (!response.ok || !payload || payload.code !== 0) {
        throw new ServerApiError(payload?.errorKey || payload?.msg || "error.default", payload?.msg || `请求失败：${response.status}`, response.status, payload?.data);
    }
    return payload.data as T;
}

export async function registerCloudUser(input: { email: string; username?: string; displayName?: string; password: string }) {
    const data = await serverRequest<{ user: CloudUser }>("/auth/register", { method: "POST", body: JSON.stringify(input) });
    useUserStore.getState().setUser(data.user);
    return data.user;
}

export async function loginCloudUser(input: { email: string; password: string }) {
    const data = await serverRequest<{ user: CloudUser }>("/auth/login", { method: "POST", body: JSON.stringify(input) });
    useUserStore.getState().setUser(data.user);
    return data.user;
}

export async function logoutCloudUser() {
    await serverRequest<null>("/auth/logout", { method: "POST" });
    useUserStore.getState().clearSession();
}

export async function fetchCloudUser() {
    const data = await serverRequest<{ user: CloudUser }>("/auth/me");
    useUserStore.getState().setUser(data.user);
    return data.user;
}

export function fetchBillingSummary() {
    return serverRequest<BillingSummary>("/billing/me");
}

export function estimateBilling(input: EstimateRequest) {
    return serverRequest<EstimateResponse>("/billing/estimate", { method: "POST", body: JSON.stringify(input) });
}

export function listAdminUsers(params = new URLSearchParams()) {
    const query = params.toString();
    return serverRequest<ListResult<CloudUser>>(`/admin/users${query ? `?${query}` : ""}`);
}

export function grantUserEntitlement(userId: string, input: Record<string, unknown>) {
    return serverRequest<CreditAccount>(`/admin/users/${userId}/grant-entitlement`, { method: "POST", body: JSON.stringify(input) });
}

export function adjustUserCredits(userId: string, input: Record<string, unknown>) {
    return serverRequest<CreditAccount>(`/admin/users/${userId}/adjust-credits`, { method: "POST", body: JSON.stringify(input) });
}

export function resetUserPeriod(userId: string) {
    return serverRequest<CreditAccount>(`/admin/users/${userId}/reset-period`, { method: "POST" });
}

export function resetUserFiveHourWindow(userId: string) {
    return serverRequest<CreditAccount>(`/admin/users/${userId}/reset-five-hour-window`, { method: "POST" });
}
