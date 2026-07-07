import { serverRequest } from "@/services/api/server";

export type AgentSession = {
    id: string;
    userId: string;
    projectId: string;
    title: string;
    locale: string;
    status: string;
    metadataJson?: unknown;
};

export type AgentMessage = {
    id: string;
    userId: string;
    sessionId: string;
    role: "user" | "assistant" | "system" | "tool" | "error";
    content: string;
    metadataJson?: unknown;
};

export type SuggestedReferenceIntent = {
    sourceNodeId: string;
    title: string;
    mediaObjectId: string;
    assetId: string;
    role: "subject" | "style" | "composition" | "element";
    weight: number;
    enabled: boolean;
    sortOrder: number;
    note: string;
    referenceSetId?: string;
};

export type AgentToolCallOutput = {
    summary?: string;
    suggestedIntents?: SuggestedReferenceIntent[];
    referenceSetId?: string;
    referenceNodeId?: string;
};

export type AgentToolCall = {
    id: string;
    userId: string;
    sessionId: string;
    toolName: string;
    inputJson?: unknown;
    outputJson?: AgentToolCallOutput;
    status: "pending" | "completed" | "applied" | "rejected";
    requiresConfirmation: boolean;
    appliedAt?: string;
};

export type AgentMessageResponse = {
    session: AgentSession;
    messages: AgentMessage[];
    toolCalls: AgentToolCall[];
};

export type AgentCanvasSnapshot = {
    projectId: string;
    title: string;
    selectedNodeIds: string[];
    nodes: Array<{ id: string; type: string; title: string; metadata?: Record<string, unknown> }>;
    connections: unknown[];
    referenceSetId?: string;
    referenceNodeId?: string;
};

export function createAgentSession(input: { projectId: string; title?: string; locale?: string; metadataJson?: unknown }) {
    return serverRequest<AgentSession>("/agent/sessions", { method: "POST", body: JSON.stringify(input) });
}

export function sendAgentMessage(sessionId: string, input: { content: string; canvasSnapshot: AgentCanvasSnapshot; metadataJson?: unknown }) {
    return serverRequest<AgentMessageResponse>(`/agent/sessions/${sessionId}/messages`, { method: "POST", body: JSON.stringify(input) });
}

export function applyAgentToolCall(id: string, input: { outputJson?: unknown }) {
    return serverRequest<AgentToolCall>(`/agent/tool-calls/${id}/apply`, { method: "POST", body: JSON.stringify(input) });
}
