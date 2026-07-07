import { serverRequest, type ListResult } from "@/services/api/server";

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

export type ModelCapability = {
    id?: string;
    model: string;
    displayNameJson?: unknown;
    ability: string;
    modelFamily: string;
    maxReferences: number;
    maxOutputs: number;
    supportedRatiosJson?: unknown;
    supportedResolutionsJson?: unknown;
    supportsStreaming: boolean;
    supportsSeed: boolean;
    supportsMask: boolean;
    supportsCropReference: boolean;
    supportsTransparentBackground: boolean;
    enabled: boolean;
    recommendedRolesJson?: unknown;
    metadataJson?: unknown;
};

export type ModelRateRule = {
    id?: string;
    ability: string;
    model: string;
    baseCredits: number;
    unitCredits: number;
    unitParam: string;
    perOutputCredits: number;
    perReferenceCredits: number;
    resolutionMultiplierJson?: unknown;
    qualityMultiplierJson?: unknown;
    enabled: boolean;
    notes: string;
    paramsJson?: unknown;
};

export type PromptTemplate = {
    id?: string;
    locale: string;
    templateKey: string;
    ability: string;
    modelFamily: string;
    title: string;
    content: string;
    variablesJson?: unknown;
    version: number;
    enabled: boolean;
};

export type AdminGenerationRun = {
    id: string;
    userId: string;
    projectId: string;
    referenceSetId: string;
    ability: string;
    model: string;
    prompt: string;
    status: string;
    reservedCredits: number;
    settledCredits: number;
    usageId: string;
    gateway: string;
    gatewayRequestId: string;
    gatewayModel: string;
    errorKey: string;
    errorMessage: string;
    createdAt: string;
    updatedAt: string;
};

export type AdminGenerationJob = {
    id: string;
    userId: string;
    generationRunId: string;
    status: string;
    ability: string;
    priority: number;
    attempt: number;
    maxAttempts: number;
    errorKey: string;
    errorCode: string;
    errorMessage: string;
    createdAt: string;
    updatedAt: string;
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

export function listModelCapabilities() {
    return serverRequest<ListResult<ModelCapability>>("/admin/model-capabilities");
}

export function saveModelCapability(input: ModelCapability) {
    const method = input.id ? "PATCH" : "POST";
    const path = input.id ? `/admin/model-capabilities/${input.id}` : "/admin/model-capabilities";
    return serverRequest<ModelCapability>(path, { method, body: JSON.stringify(input) });
}

export function listModelRateRules() {
    return serverRequest<ListResult<ModelRateRule>>("/admin/model-rate-rules");
}

export function saveModelRateRule(input: ModelRateRule) {
    const method = input.id ? "PATCH" : "POST";
    const path = input.id ? `/admin/model-rate-rules/${input.id}` : "/admin/model-rate-rules";
    return serverRequest<ModelRateRule>(path, { method, body: JSON.stringify(input) });
}

export function listPromptTemplates() {
    return serverRequest<ListResult<PromptTemplate>>("/admin/prompt-templates");
}

export function savePromptTemplate(input: PromptTemplate) {
    const method = input.id ? "PATCH" : "POST";
    const path = input.id ? `/admin/prompt-templates/${input.id}` : "/admin/prompt-templates";
    return serverRequest<PromptTemplate>(path, { method, body: JSON.stringify(input) });
}

export function previewPromptTemplate(input: { templateId?: string; content?: string; variables?: Record<string, unknown> }) {
    return serverRequest<{ content: string }>("/admin/prompt-templates/preview", { method: "POST", body: JSON.stringify(input) });
}

export function listAdminGenerationRuns(params = new URLSearchParams()) {
    const query = params.toString();
    return serverRequest<ListResult<AdminGenerationRun>>(`/admin/generation-runs${query ? `?${query}` : ""}`);
}

export function listAdminGenerationJobs(params = new URLSearchParams()) {
    const query = params.toString();
    return serverRequest<ListResult<AdminGenerationJob>>(`/admin/generation-jobs${query ? `?${query}` : ""}`);
}

export function retryAdminGenerationRun(id: string) {
    return serverRequest<AdminGenerationJob>(`/admin/generation-runs/${id}/retry`, { method: "POST" });
}

export function refundAdminGenerationRun(id: string) {
    return serverRequest<AdminGenerationRun>(`/admin/generation-runs/${id}/refund`, { method: "POST" });
}
