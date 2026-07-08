import type { Asset } from "@/stores/use-asset-store";

export type InsertAssetPayload =
    | { kind: "text"; content: string; title: string }
    | { kind: "image"; dataUrl: string; title: string; storageKey?: string; width?: number; height?: number; bytes?: number; mimeType?: string; mediaObjectId?: string; assetId?: string }
    | { kind: "video"; url: string; title: string; storageKey?: string; width?: number; height?: number; bytes?: number; mimeType?: string; mediaObjectId?: string; assetId?: string };

export function buildInsertAssetPayload(asset: Asset): InsertAssetPayload {
    if (asset.kind === "text") return { kind: "text", content: asset.data.content, title: asset.title };
    const mediaObjectId = stringMeta(asset.metadata?.mediaObjectId);
    const assetId = stringMeta(asset.metadata?.assetId);
    if (asset.kind === "video") {
        return {
            kind: "video",
            url: asset.data.url || asset.coverUrl,
            storageKey: asset.data.storageKey,
            title: asset.title,
            width: asset.data.width,
            height: asset.data.height,
            bytes: asset.data.bytes,
            mimeType: asset.data.mimeType,
            mediaObjectId,
            assetId,
        };
    }
    return {
        kind: "image",
        dataUrl: asset.data.dataUrl || asset.coverUrl,
        storageKey: asset.data.storageKey,
        title: asset.title,
        width: asset.data.width,
        height: asset.data.height,
        bytes: asset.data.bytes,
        mimeType: asset.data.mimeType,
        mediaObjectId,
        assetId,
    };
}

function stringMeta(value: unknown) {
    return typeof value === "string" && value ? value : undefined;
}
