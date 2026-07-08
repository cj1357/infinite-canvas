import type { CompileReferenceSetPreviewOutput, ReferenceIntent } from "@/services/api/creative";
import type { CanvasNodeData } from "../types";

export type ReferenceSourceBinding = {
    mediaObjectId: string;
    assetId: string;
};

export type BoundReferenceSources = Record<string, Partial<ReferenceSourceBinding>>;

export type ReferenceCropRect = {
    type: "rect";
    x: number;
    y: number;
    width: number;
    height: number;
};

export function normalizeReferencePreviewOutput(output: CompileReferenceSetPreviewOutput): CompileReferenceSetPreviewOutput {
    return {
        compiledPrompt: output.compiledPrompt || "",
        compiledReferenceJson: output.compiledReferenceJson && typeof output.compiledReferenceJson === "object" ? output.compiledReferenceJson : {},
        warnings: Array.isArray(output.warnings) ? output.warnings : [],
        enabledReferences: Array.isArray(output.enabledReferences) ? output.enabledReferences : [],
    };
}

export function normalizeReferenceCropRect(input: unknown): ReferenceCropRect | null {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const crop = input as Partial<Record<keyof ReferenceCropRect, unknown>>;
    if (crop.type !== "rect") return null;
    const x = toFiniteNumber(crop.x);
    const y = toFiniteNumber(crop.y);
    const width = toFiniteNumber(crop.width);
    const height = toFiniteNumber(crop.height);
    if (x === null || y === null || width === null || height === null) return null;
    if (x < 0 || y < 0 || width < 0.01 || height < 0.01) return null;
    if (x + width > 1.000001 || y + height > 1.000001) return null;
    return { type: "rect", x, y, width, height };
}

export function getReferenceSourceBinding(node: CanvasNodeData, boundSources: BoundReferenceSources): ReferenceSourceBinding {
    const bound = boundSources[node.id] || {};
    return {
        mediaObjectId: node.metadata?.mediaObjectId || bound.mediaObjectId || "",
        assetId: node.metadata?.assetId || bound.assetId || "",
    };
}

export function isReferenceSourceAvailable(node: CanvasNodeData, boundSources: BoundReferenceSources) {
    const binding = getReferenceSourceBinding(node, boundSources);
    return Boolean(binding.mediaObjectId || binding.assetId || node.metadata?.content);
}

export function referenceSourceKey(node: CanvasNodeData, boundSources: BoundReferenceSources) {
    const binding = getReferenceSourceBinding(node, boundSources);
    return binding.mediaObjectId ? `media:${binding.mediaObjectId}` : binding.assetId ? `asset:${binding.assetId}` : node.id;
}

export function isReferenceSourceAdded(node: CanvasNodeData, boundSources: BoundReferenceSources, intents: ReferenceIntent[]) {
    return countReferenceSourceIntents(node, boundSources, intents) > 0;
}

export function countReferenceSourceIntents(node: CanvasNodeData, boundSources: BoundReferenceSources, intents: ReferenceIntent[]) {
    const binding = getReferenceSourceBinding(node, boundSources);
    return intents.filter((intent) => isReferenceIntentFromSource(intent, node.id, binding)).length;
}

export function referenceIntentCanvasNodeId(intent: ReferenceIntent) {
    const metadata = intent.metadataJson;
    return metadata && typeof metadata === "object" && !Array.isArray(metadata) && typeof (metadata as { canvasNodeId?: unknown }).canvasNodeId === "string" ? (metadata as { canvasNodeId: string }).canvasNodeId : "";
}

function isReferenceIntentFromSource(intent: ReferenceIntent, nodeId: string, binding: ReferenceSourceBinding) {
    if (referenceIntentCanvasNodeId(intent) === nodeId) return true;
    if (binding.mediaObjectId && intent.mediaObjectId === binding.mediaObjectId) return true;
    if (binding.assetId && intent.assetId === binding.assetId) return true;
    return false;
}

function toFiniteNumber(value: unknown) {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : null;
}
