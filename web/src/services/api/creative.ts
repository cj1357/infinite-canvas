import { SERVER_API_PREFIX, serverRequest, type ListResult } from "@/services/api/server";

export type CloudCanvasProjectData = {
    nodes?: unknown[];
    connections?: unknown[];
    chatSessions?: unknown[];
    activeChatId?: string | null;
    backgroundMode?: string;
    showImageInfo?: boolean;
    viewport?: unknown;
};

export type CloudCanvasProject = {
    id: string;
    userId: string;
    title: string;
    description: string;
    dataJson?: CloudCanvasProjectData;
    metadataJson?: Record<string, unknown>;
    version: number;
    createdAt: string;
    updatedAt: string;
};

export type CloudCanvasProjectInput = {
    id?: string;
    title: string;
    description?: string;
    dataJson?: CloudCanvasProjectData;
    metadataJson?: Record<string, unknown>;
};

export type MediaObject = {
    id: string;
    userId: string;
    kind: string;
    storageKey: string;
    thumbnailKey: string;
    mimeType: string;
    byteSize: number;
    width: number;
    height: number;
    durationMs: number;
    sha256: string;
    metadataJson?: unknown;
};

export type CreativeAsset = {
    id: string;
    userId: string;
    mediaObjectId: string;
    kind: string;
    title: string;
    description: string;
    tagsJson?: string[];
    favorite: boolean;
    rating: number;
    defaultReferenceIntentJson?: Record<string, unknown>;
    localizedTextJson?: Record<string, unknown>;
    usageCount: number;
    lastUsedAt?: string;
    metadataJson?: Record<string, unknown>;
};

export type ReferenceSet = {
    id: string;
    userId: string;
    projectId: string;
    title: string;
    description: string;
    source: string;
    metadataJson?: unknown;
};

export type ReferenceIntentRole = "subject" | "style" | "composition" | "element";

export type ReferenceIntent = {
    id: string;
    userId: string;
    referenceSetId: string;
    assetId: string;
    mediaObjectId: string;
    role: ReferenceIntentRole;
    weight: number;
    enabled: boolean;
    sortOrder: number;
    note: string;
    cropJson?: unknown;
    analysisJson?: unknown;
    confirmed: boolean;
    metadataJson?: unknown;
};

export type ReferenceSetDetail = {
    referenceSet: ReferenceSet;
    intents: ReferenceIntent[];
};

export type CompileReferenceSetPreviewInput = {
    prompt: string;
    locale: string;
    ability: string;
    model: string;
    params?: Record<string, unknown>;
};

export type CompileReferenceSetPreviewOutput = {
    compiledPrompt: string;
    compiledReferenceJson: Record<string, unknown>;
    warnings: string[];
    enabledReferences: ReferenceIntent[];
};

export type GenerationRun = {
    id: string;
    userId: string;
    projectId: string;
    referenceSetId: string;
    parentRunId: string;
    ability: string;
    model: string;
    prompt: string;
    compiledPrompt: string;
    status: string;
    reservedCredits: number;
    settledCredits: number;
    usageId: string;
    errorKey: string;
    errorMessage: string;
};

export type GenerationJob = {
    id: string;
    userId: string;
    generationRunId: string;
    status: string;
    ability: string;
    priority: number;
    attempt: number;
    maxAttempts: number;
    errorKey: string;
    errorMessage: string;
};

export type GenerationOutput = {
    id: string;
    userId: string;
    generationRunId: string;
    mediaObjectId: string;
    canvasNodeId: string;
    status: string;
    rating: number;
    selected: boolean;
    note: string;
};

export type GenerationRunDetail = {
    run: GenerationRun;
    job?: GenerationJob;
    outputs: GenerationOutput[];
};

export type CreateGenerationRunInput = {
    projectId?: string;
    referenceSetId: string;
    parentRunId?: string;
    ability: string;
    model: string;
    prompt: string;
    params?: Record<string, unknown>;
};

export function listCanvasProjects(params = new URLSearchParams()) {
    const query = params.toString();
    return serverRequest<ListResult<CloudCanvasProject>>(`/canvas-projects${query ? `?${query}` : ""}`);
}

export function createCanvasProject(input: CloudCanvasProjectInput) {
    return serverRequest<CloudCanvasProject>("/canvas-projects", { method: "POST", body: JSON.stringify(input) });
}

export function updateCanvasProject(id: string, input: CloudCanvasProjectInput) {
    return serverRequest<CloudCanvasProject>(`/canvas-projects/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteCanvasProject(id: string) {
    return serverRequest<null>(`/canvas-projects/${id}`, { method: "DELETE" });
}

export function uploadMediaObject(file: File) {
    const form = new FormData();
    form.append("file", file);
    return serverRequest<MediaObject>("/media/upload", { method: "POST", body: form });
}

export function mediaObjectUrl(id: string) {
    return `${SERVER_API_PREFIX}/media/${id}`;
}

export async function fetchMediaObjectBlob(id: string) {
    const response = await fetch(mediaObjectUrl(id), { credentials: "include" });
    if (!response.ok) throw new Error(`媒体读取失败：${response.status}`);
    return response.blob();
}

export function deleteMediaObject(id: string) {
    return serverRequest<null>(`/media/${id}`, { method: "DELETE" });
}

export function listCreativeAssets(params = new URLSearchParams()) {
    const query = params.toString();
    return serverRequest<ListResult<CreativeAsset>>(`/creative-assets${query ? `?${query}` : ""}`);
}

export function createCreativeAsset(input: Partial<CreativeAsset>) {
    return serverRequest<CreativeAsset>("/creative-assets", { method: "POST", body: JSON.stringify(input) });
}

export function updateCreativeAsset(id: string, input: Partial<CreativeAsset>) {
    return serverRequest<CreativeAsset>(`/creative-assets/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteCreativeAsset(id: string) {
    return serverRequest<null>(`/creative-assets/${id}`, { method: "DELETE" });
}

export function listReferenceSets(params = new URLSearchParams()) {
    const query = params.toString();
    return serverRequest<ListResult<ReferenceSet>>(`/reference-sets${query ? `?${query}` : ""}`);
}

export function createReferenceSet(input: Partial<ReferenceSet>) {
    return serverRequest<ReferenceSet>("/reference-sets", { method: "POST", body: JSON.stringify(input) });
}

export function getReferenceSet(id: string) {
    return serverRequest<ReferenceSetDetail>(`/reference-sets/${id}`);
}

export function updateReferenceSet(id: string, input: Partial<ReferenceSet>) {
    return serverRequest<ReferenceSet>(`/reference-sets/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function createReferenceIntent(referenceSetId: string, input: Partial<ReferenceIntent>) {
    return serverRequest<ReferenceIntent>(`/reference-sets/${referenceSetId}/intents`, { method: "POST", body: JSON.stringify(input) });
}

export function updateReferenceIntent(id: string, input: Partial<ReferenceIntent>) {
    return serverRequest<ReferenceIntent>(`/reference-intents/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function compileReferenceSetPreview(referenceSetId: string, input: CompileReferenceSetPreviewInput) {
    return serverRequest<CompileReferenceSetPreviewOutput>(`/reference-sets/${referenceSetId}/compile-preview`, { method: "POST", body: JSON.stringify(input) });
}

export function createGenerationRun(input: CreateGenerationRunInput) {
    return serverRequest<GenerationRun>("/generation-runs", { method: "POST", body: JSON.stringify(input) });
}

export function getGenerationRun(id: string) {
    return serverRequest<GenerationRun>(`/generation-runs/${id}`);
}

export function getGenerationRunDetail(id: string) {
    return serverRequest<GenerationRunDetail>(`/generation-runs/${id}/detail`);
}

export function getGenerationJob(id: string) {
    return serverRequest<GenerationJob>(`/generation-jobs/${id}`);
}

export function retryGenerationRun(id: string) {
    return serverRequest<GenerationJob>(`/generation-runs/${id}/retry`, { method: "POST" });
}

export function cancelGenerationRun(id: string) {
    return serverRequest<GenerationRun>(`/generation-runs/${id}/cancel`, { method: "POST" });
}
