import type { CompileReferenceSetPreviewOutput, ReferenceIntent } from "@/services/api/creative";
import type { CanvasNodeData } from "../types";

export type ReferenceSourceBinding = {
    mediaObjectId: string;
    assetId: string;
};

export type BoundReferenceSources = Record<string, Partial<ReferenceSourceBinding>>;

export function normalizeReferencePreviewOutput(output: CompileReferenceSetPreviewOutput): CompileReferenceSetPreviewOutput {
    return {
        compiledPrompt: output.compiledPrompt || "",
        compiledReferenceJson: output.compiledReferenceJson && typeof output.compiledReferenceJson === "object" ? output.compiledReferenceJson : {},
        warnings: Array.isArray(output.warnings) ? output.warnings : [],
        enabledReferences: Array.isArray(output.enabledReferences) ? output.enabledReferences : [],
    };
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
    const binding = getReferenceSourceBinding(node, boundSources);
    return intents.some((intent) => {
        if (binding.mediaObjectId && intent.mediaObjectId === binding.mediaObjectId) return true;
        if (binding.assetId && intent.assetId === binding.assetId) return true;
        return referenceIntentCanvasNodeId(intent) === node.id;
    });
}

function referenceIntentCanvasNodeId(intent: ReferenceIntent) {
    const metadata = intent.metadataJson;
    return metadata && typeof metadata === "object" && !Array.isArray(metadata) && typeof (metadata as { canvasNodeId?: unknown }).canvasNodeId === "string" ? (metadata as { canvasNodeId: string }).canvasNodeId : "";
}
