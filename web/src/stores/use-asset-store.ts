"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import { cleanupUnusedImages, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { cleanupUnusedMedia, resolveMediaUrl } from "@/services/file-storage";
import { isServerAIEnabled } from "@/services/api/server";
import { createCreativeAsset, updateCreativeAsset, deleteCreativeAsset, uploadMediaObject } from "@/services/api/creative";

export type AssetKind = "text" | "image" | "video";
export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type Asset = TextAsset | ImageAsset | VideoAsset;

type AssetBase<T extends AssetKind> = {
    id: string;
    kind: T;
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
};

type AssetStore = {
    hydrated: boolean;
    assets: Asset[];
    addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => string;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    removeAsset: (id: string) => void;
    replaceAssets: (assets: Asset[]) => void;
    cleanupImages: (extra?: unknown) => void;
};

const ASSET_STORE_KEY = "infinite-canvas:asset_store";

const assetStorage: PersistStorage<AssetStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<AssetStore>;
        parsed.state.assets = await Promise.all(
            parsed.state.assets.map(async (asset) => {
                if (asset.kind === "video" && asset.data.storageKey) return { ...asset, data: { ...asset.data, url: await resolveMediaUrl(asset.data.storageKey, asset.data.url) } };
                if (asset.kind !== "image") return asset;
                if (asset.data.storageKey)
                    return {
                        ...asset,
                        coverUrl: asset.coverUrl.startsWith("blob:") ? await resolveImageUrl(asset.data.storageKey, asset.coverUrl) : asset.coverUrl,
                        data: { ...asset.data, dataUrl: await resolveImageUrl(asset.data.storageKey, asset.data.dataUrl) },
                    };
                if (!asset.data.dataUrl.startsWith("data:image/")) return asset;
                const image = await uploadImage(asset.data.dataUrl);
                return { ...asset, coverUrl: asset.coverUrl.startsWith("data:image/") ? image.url : asset.coverUrl, data: { ...asset.data, dataUrl: image.url, storageKey: image.storageKey, bytes: image.bytes, mimeType: image.mimeType } };
            }),
        );
        return parsed;
    },
    setItem: (name, value) => localForageStorage.setItem(name, JSON.stringify(value)),
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useAssetStore = create<AssetStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            assets: [],
            addAsset: (asset) => {
                const now = new Date().toISOString();
                const id = nanoid();
                set((state) => ({ assets: [{ ...asset, id, createdAt: now, updatedAt: now } as Asset, ...state.assets] }));

                if (isServerAIEnabled()) {
                    void (async () => {
                        try {
                            let mediaObjectId = "";
                            if (asset.kind === "image" && (asset as ImageAsset).data?.dataUrl) {
                                const imgAsset = asset as ImageAsset;
                                const response = await fetch(imgAsset.data.dataUrl);
                                const blob = await response.blob();
                                const file = new File([blob], imgAsset.title || "image.png", { type: blob.type || imgAsset.data.mimeType || "image/png" });
                                const media = await uploadMediaObject(file);
                                mediaObjectId = media.id;
                            } else if (asset.kind === "video" && (asset as VideoAsset).data?.url) {
                                const vidAsset = asset as VideoAsset;
                                const response = await fetch(vidAsset.data.url);
                                const blob = await response.blob();
                                const file = new File([blob], vidAsset.title || "video.mp4", { type: blob.type || vidAsset.data.mimeType || "video/mp4" });
                                const media = await uploadMediaObject(file);
                                mediaObjectId = media.id;
                            }
                            await createCreativeAsset({
                                id,
                                mediaObjectId,
                                kind: asset.kind,
                                title: asset.title,
                                description: asset.note || "",
                                tagsJson: asset.tags || [],
                                metadataJson: asset.metadata || {},
                            });
                        } catch (err) {
                              console.error("同步创建云端资产失败:", err);
                        }
                    })();
                }
                return id;
            },
            updateAsset: (id, patch) => {
                set((state) => ({
                    assets: state.assets.map((asset) => (asset.id === id ? ({ ...asset, ...patch, updatedAt: new Date().toISOString() } as Asset) : asset)),
                }));

                if (isServerAIEnabled()) {
                    void (async () => {
                        try {
                            const input: Record<string, any> = {};
                            if (patch.title !== undefined) input.title = patch.title;
                            if (patch.tags !== undefined) input.tagsJson = patch.tags;
                            if (patch.note !== undefined) input.description = patch.note;
                            if (patch.metadata !== undefined) input.metadataJson = patch.metadata;

                            await updateCreativeAsset(id, input);
                        } catch (err) {
                            console.error("同步更新云端资产失败:", err);
                        }
                    })();
                }
            },
            removeAsset: (id) => {
                set((state) => {
                    const assets = state.assets.filter((asset) => asset.id !== id);
                    get().cleanupImages({ assets });
                    return { assets };
                });

                if (isServerAIEnabled()) {
                    void deleteCreativeAsset(id).catch((err) => {
                        console.error("同步删除云端资产失败:", err);
                    });
                }
            },
            replaceAssets: (assets) => set({ assets }),
            cleanupImages: (extra) => {
                window.setTimeout(async () => {
                    const { useCanvasStore } = await import("@/app/(user)/canvas/stores/use-canvas-store");
                    await cleanupUnusedImages({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                    await cleanupUnusedMedia({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                }, 0);
            },
        }),
        {
            name: ASSET_STORE_KEY,
            storage: assetStorage,
            partialize: (state) => ({ assets: state.assets }) as StorageValue<AssetStore>["state"],
            onRehydrateStorage: () => () => {
                useAssetStore.setState({ hydrated: true });
            },
        },
    ),
);
