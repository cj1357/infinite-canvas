import { serverRequest } from "@/services/api/server";

export type ModelGatewaySettings = {
    provider: string;
    baseUrl: string;
    internalUrl: string;
    enabled: boolean;
    hasToken: boolean;
    timeoutSeconds: number;
};

export type ModelGatewayInput = {
    provider: string;
    baseUrl: string;
    internalUrl?: string;
    token?: string;
    timeoutSeconds: number;
    enabled: boolean;
};

export type ModelGatewayTestResult = {
    ok: boolean;
    status: number;
    provider: string;
    baseUrl: string;
    message: string;
};

export function getModelGatewaySettings() {
    return serverRequest<ModelGatewaySettings>("/admin/model-gateway");
}

export function saveModelGatewaySettings(input: ModelGatewayInput) {
    return serverRequest<ModelGatewaySettings>("/admin/model-gateway", { method: "PATCH", body: JSON.stringify(input) });
}

export function testModelGatewaySettings() {
    return serverRequest<ModelGatewayTestResult>("/admin/model-gateway/test", { method: "POST" });
}
