import { serverRequest, type ListResult } from "@/services/api/server";

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
