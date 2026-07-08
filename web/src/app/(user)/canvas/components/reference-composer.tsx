"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { App, Button, Dropdown, Input, InputNumber, Segmented, Space, Switch } from "antd";
import type { MenuProps } from "antd";
import { ArrowDown, ArrowUp, Image as ImageIcon, LoaderCircle, RefreshCw, Trash2, X } from "lucide-react";

import { useI18n } from "@/i18n/use-i18n";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import {
    compileReferenceSetPreview,
    createReferenceIntent,
    createReferenceSet,
    deleteReferenceIntent,
    getReferenceSet,
    listCreativeAssets,
    mediaObjectUrl,
    uploadMediaObject,
    updateReferenceIntent,
    updateReferenceSet,
    type CreativeAsset,
    type CompileReferenceSetPreviewOutput,
    type ReferenceIntent,
    type ReferenceIntentRole,
    type ReferenceSetDetail,
} from "@/services/api/creative";
import type { CanvasNodeData } from "../types";
import {
    countReferenceSourceIntents,
    getReferenceSourceBinding,
    isReferenceSourceAvailable,
    normalizeReferenceCropRect,
    normalizeReferencePreviewOutput,
    referenceSourceKey,
    type BoundReferenceSources,
    type ReferenceCropRect,
} from "./reference-composer-utils";

const { TextArea } = Input;
const roles: ReferenceIntentRole[] = ["subject", "style", "composition", "element"];

type ReferenceComposerProps = {
    node: CanvasNodeData;
    projectId: string;
    sourceNodes: CanvasNodeData[];
    connectedSourceNodes?: CanvasNodeData[];
    initialDetail?: ReferenceSetDetail | null;
    defaultPrompt?: string;
    onReferenceSetChange: (nodeId: string, detail: ReferenceSetDetail) => void;
    onClose: () => void;
};

type IntentPatch = Partial<Pick<ReferenceIntent, "role" | "weight" | "enabled" | "sortOrder" | "note">>;
type SourceIntentMode = "whole" | "region" | "style";
type SourceIntentOptions = {
    role: ReferenceIntentRole;
    weight?: number;
    note?: string;
    sourceMode: SourceIntentMode;
    cropJson?: ReferenceCropRect;
    regionLabel?: string;
};
type RegionIntentDraft = {
    cropJson: ReferenceCropRect;
    role: ReferenceIntentRole;
    weight: number;
    note: string;
};

const defaultRegionCrop: ReferenceCropRect = { type: "rect", x: 0.2, y: 0.2, width: 0.6, height: 0.6 };

export function ReferenceComposer({ node, projectId, sourceNodes, connectedSourceNodes = [], initialDetail, defaultPrompt, onReferenceSetChange, onClose }: ReferenceComposerProps) {
    const { message } = App.useApp();
    const { locale, t } = useI18n();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const cloudUserId = useUserStore((state) => state.user?.id || "");
    const [detail, setDetail] = useState<ReferenceSetDetail | null>(initialDetail || null);
    const [title, setTitle] = useState(initialDetail?.referenceSet.title || node.title || t("reference.node.title"));
    const [loading, setLoading] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [previewPrompt, setPreviewPrompt] = useState(defaultPrompt || node.metadata?.prompt || "");
    const [preview, setPreview] = useState<CompileReferenceSetPreviewOutput | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [assets, setAssets] = useState<CreativeAsset[]>([]);
    const [assetsLoading, setAssetsLoading] = useState(false);
    const [boundSources, setBoundSources] = useState<BoundReferenceSources>({});
    const [regionSource, setRegionSource] = useState<CanvasNodeData | null>(null);
    const autoAddingKeysRef = useRef(new Set<string>());
    const sourceKeySet = useMemo(() => new Set((detail?.intents || []).map(intentSourceKey)), [detail?.intents]);
    const orderedIntents = useMemo(() => [...(detail?.intents || [])].sort((a, b) => a.sortOrder - b.sortOrder), [detail?.intents]);

    useEffect(() => {
        if (!cloudUserId) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            try {
                const next = node.metadata?.referenceSetId ? await getReferenceSet(node.metadata.referenceSetId) : await createSet();
                if (cancelled) return;
                setDetail(next);
                setTitle(next.referenceSet.title);
                onReferenceSetChange(node.id, next);
            } catch {
                if (!cancelled) message.error(t("reference.composer.createFailed"));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [cloudUserId, message, node.id, node.metadata?.referenceSetId, onReferenceSetChange, t]);

    const createSet = async () => {
        const referenceSet = await createReferenceSet({
            projectId,
            title: title.trim() || t("reference.node.title"),
            source: "canvas",
            metadataJson: { canvasNodeId: node.id },
        });
        return { referenceSet, intents: [] };
    };

    const refresh = async () => {
        if (!cloudUserId || !detail) return;
        setLoading(true);
        try {
            const next = await getReferenceSet(detail.referenceSet.id);
            setDetail(next);
            setTitle(next.referenceSet.title);
            onReferenceSetChange(node.id, next);
        } finally {
            setLoading(false);
        }
    };

    const loadAssets = async () => {
        if (!cloudUserId) {
            setAssets([]);
            return;
        }
        setAssetsLoading(true);
        try {
            const params = new URLSearchParams({ page: "1", pageSize: "20" });
            const result = await listCreativeAssets(params);
            setAssets(result.items.filter((item) => item.mediaObjectId));
        } catch {
            message.error(t("reference.composer.assetLoadFailed"));
        } finally {
            setAssetsLoading(false);
        }
    };

    useEffect(() => {
        if (!cloudUserId) {
            setAssets([]);
            return;
        }
        void loadAssets();
    }, [cloudUserId]);

    const saveTitle = async () => {
        if (!cloudUserId || !detail) return;
        try {
            const referenceSet = await updateReferenceSet(detail.referenceSet.id, { ...detail.referenceSet, title: title.trim() || t("reference.node.title"), projectId });
            const next = { ...detail, referenceSet };
            setDetail(next);
            onReferenceSetChange(node.id, next);
        } catch {
            message.error(t("reference.composer.saveFailed"));
        }
    };

    const createSourceIntent = async (source: CanvasNodeData, options: SourceIntentOptions) => {
        if (!cloudUserId || !detail) return false;
        if (!isReferenceSourceAvailable(source, boundSources)) return false;
        setSavingId(source.id);
        try {
            const { mediaObjectId, assetId } = await ensureSourceBinding(source);
            if (!mediaObjectId && !assetId) return;
            await createReferenceIntent(detail.referenceSet.id, {
                mediaObjectId,
                assetId,
                role: options.role,
                weight: options.weight ?? 1,
                enabled: true,
                sortOrder: detail.intents.length,
                note: options.note || "",
                cropJson: options.cropJson,
                metadataJson: {
                    canvasNodeId: source.id,
                    canvasNodeTitle: source.title,
                    sourceMode: options.sourceMode,
                    regionLabel: options.regionLabel || options.note || "",
                },
            });
            const next = await getReferenceSet(detail.referenceSet.id);
            setDetail(next);
            onReferenceSetChange(node.id, next);
            return true;
        } catch {
            message.error(t("reference.composer.saveFailed"));
            return false;
        } finally {
            setSavingId(null);
        }
    };

    const addSource = async (source: CanvasNodeData) => {
        await createSourceIntent(source, { role: "subject", sourceMode: "whole" });
    };

    const addStyleSource = async (source: CanvasNodeData) => {
        await createSourceIntent(source, { role: "style", sourceMode: "style" });
    };

    const addRegionSource = async (source: CanvasNodeData, draft: RegionIntentDraft) => {
        const saved = await createSourceIntent(source, {
            role: draft.role,
            weight: draft.weight,
            note: draft.note,
            cropJson: draft.cropJson,
            sourceMode: "region",
            regionLabel: draft.note,
        });
        if (saved) setRegionSource(null);
    };

    const ensureSourceBinding = async (source: CanvasNodeData) => {
        const existing = getReferenceSourceBinding(source, boundSources);
        if (existing.mediaObjectId || existing.assetId) return existing;
        const content = source.metadata?.content || "";
        if (!content) throw new Error("missing reference source content");
        const response = await fetch(content, { credentials: "include" });
        if (!response.ok) throw new Error(`reference source fetch failed: ${response.status}`);
        const blob = await response.blob();
        const mimeType = blob.type || source.metadata?.mimeType || "image/png";
        const media = await uploadMediaObject(new File([blob], referenceSourceFileName(source, mimeType), { type: mimeType }));
        const binding = { mediaObjectId: media.id, assetId: "" };
        setBoundSources((prev) => ({ ...prev, [source.id]: binding }));
        return binding;
    };

    const addAssetSource = async (asset: CreativeAsset) => {
        if (!cloudUserId || !detail) return;
        setSavingId(`asset:${asset.id}`);
        try {
            await createReferenceIntent(detail.referenceSet.id, {
                mediaObjectId: asset.mediaObjectId,
                assetId: asset.id,
                role: "subject",
                weight: 1,
                enabled: true,
                sortOrder: detail.intents.length,
                note: "",
            });
            const next = await getReferenceSet(detail.referenceSet.id);
            setDetail(next);
            onReferenceSetChange(node.id, next);
        } catch {
            message.error(t("reference.composer.saveFailed"));
        } finally {
            setSavingId(null);
        }
    };

    useEffect(() => {
        if (!detail || !connectedSourceNodes.length) return;
        connectedSourceNodes.forEach((source) => {
            const key = referenceSourceKey(source, {});
            if (sourceKeySet.has(key) || autoAddingKeysRef.current.has(key)) return;
            if (!source.metadata?.mediaObjectId && !source.metadata?.assetId) return;
            autoAddingKeysRef.current.add(key);
            void addSource(source).finally(() => {
                autoAddingKeysRef.current.delete(key);
            });
        });
    }, [connectedSourceNodes, detail, sourceKeySet]);

    const patchIntent = async (intent: ReferenceIntent, patch: IntentPatch) => {
        if (!cloudUserId || !detail) return;
        setSavingId(intent.id);
        try {
            const updated = await updateReferenceIntent(intent.id, {
                assetId: intent.assetId,
                mediaObjectId: intent.mediaObjectId,
                role: patch.role || intent.role,
                weight: patch.weight ?? intent.weight,
                enabled: patch.enabled ?? intent.enabled,
                sortOrder: patch.sortOrder ?? intent.sortOrder,
                note: patch.note ?? intent.note,
                cropJson: intent.cropJson,
                analysisJson: intent.analysisJson,
                confirmed: intent.confirmed,
                metadataJson: intent.metadataJson,
            });
            const next = { ...detail, intents: detail.intents.map((item) => (item.id === updated.id ? updated : item)) };
            setDetail(next);
            onReferenceSetChange(node.id, next);
        } catch {
            message.error(t("reference.composer.saveFailed"));
        } finally {
            setSavingId(null);
        }
    };

    const removeIntent = async (intent: ReferenceIntent) => {
        if (!cloudUserId || !detail) return;
        setSavingId(intent.id);
        try {
            await deleteReferenceIntent(intent.id);
            const next = { ...detail, intents: detail.intents.filter((item) => item.id !== intent.id) };
            setDetail(next);
            onReferenceSetChange(node.id, next);
        } catch {
            message.error(t("reference.composer.deleteFailed"));
        } finally {
            setSavingId(null);
        }
    };

    const compilePreview = async () => {
        if (!cloudUserId || !detail) return;
        setPreviewing(true);
        try {
            const next = await compileReferenceSetPreview(detail.referenceSet.id, {
                prompt: previewPrompt,
                locale,
                ability: "image",
                model: node.metadata?.model || "default",
                params: { count: node.metadata?.count || 1, size: node.metadata?.size },
            });
            setPreview(normalizeReferencePreviewOutput(next));
        } catch {
            message.error(t("reference.composer.previewFailed"));
        } finally {
            setPreviewing(false);
        }
    };

    return (
        <div
            data-canvas-no-zoom
            className="w-[560px] rounded-xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                    <ImageIcon className="size-4" />
                    <span>{t("reference.composer.title")}</span>
                </div>
                <div className="flex items-center gap-1">
                    <Button size="small" type="text" className="!h-7 !w-7 !min-w-7 !p-0" icon={loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} onClick={() => void refresh()} />
                    <Button size="small" type="text" className="!h-7 !w-7 !min-w-7 !p-0" icon={<X className="size-3.5" />} onClick={onClose} />
                </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px]">
                <Input size="small" value={title} onChange={(event) => setTitle(event.target.value)} onPressEnter={() => void saveTitle()} onBlur={() => void saveTitle()} />
                <Button size="small" onClick={() => void compilePreview()} loading={previewing}>
                    {t("common.preview")}
                </Button>
            </div>

            <section className="mt-3">
                <SectionTitle>{t("reference.composer.sources")}</SectionTitle>
                <div className="thin-scrollbar flex max-h-28 gap-2 overflow-x-auto pb-1">
                    {sourceNodes.length ? (
                        sourceNodes.map((source) => (
                            <SourceButton
                                key={source.id}
                                node={source}
                                boundSources={boundSources}
                                intentCount={countReferenceSourceIntents(source, boundSources, detail?.intents || [])}
                                saving={savingId === source.id}
                                onAddWhole={() => void addSource(source)}
                                onAddRegion={() => setRegionSource(source)}
                                onAddStyle={() => void addStyleSource(source)}
                            />
                        ))
                    ) : (
                        <EmptyLine text={t("reference.node.empty")} />
                    )}
                </div>
            </section>

            {regionSource ? (
                <RegionSelector source={regionSource} boundSources={boundSources} saving={savingId === regionSource.id} onCancel={() => setRegionSource(null)} onSave={(draft) => void addRegionSource(regionSource, draft)} />
            ) : null}

            <section className="mt-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                    <SectionTitle>{t("reference.composer.assetLibrary")}</SectionTitle>
                    <Button size="small" type="text" className="!h-6 !px-2 !text-[11px]" loading={assetsLoading} onClick={() => void loadAssets()}>
                        {t("common.refresh")}
                    </Button>
                </div>
                <div className="thin-scrollbar flex max-h-28 gap-2 overflow-x-auto pb-1">
                    {assets.length ? (
                        assets.map((asset) => <AssetSourceButton key={asset.id} asset={asset} added={assetAdded(asset, sourceKeySet)} saving={savingId === `asset:${asset.id}`} onAdd={() => void addAssetSource(asset)} />)
                    ) : (
                        <EmptyLine text={assetsLoading ? t("common.loading") : t("reference.node.empty")} />
                    )}
                </div>
            </section>

            <section className="mt-3">
                <SectionTitle>{t("reference.composer.intents")}</SectionTitle>
                <div className="thin-scrollbar max-h-72 space-y-2 overflow-y-auto pr-1">
                    {orderedIntents.length ? (
                        orderedIntents.map((intent) => (
                            <IntentRow key={intent.id} intent={intent} saving={savingId === intent.id} onPatch={(patch) => void patchIntent(intent, patch)} onDelete={() => void removeIntent(intent)} />
                        ))
                    ) : (
                        <EmptyLine text={t("reference.node.empty")} />
                    )}
                </div>
            </section>

            <section className="mt-3">
                <SectionTitle>{t("reference.composer.previewPrompt")}</SectionTitle>
                <TextArea rows={2} value={previewPrompt} onChange={(event) => setPreviewPrompt(event.target.value)} />
                {preview ? (
                    <div className="mt-2 rounded-lg border p-2 text-xs leading-5" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                        {preview.warnings.length ? <div className="mb-2 text-amber-600">{preview.warnings.join(" / ")}</div> : null}
                        <div className="mb-1 font-medium">{t("reference.composer.previewResult")}</div>
                        <pre className="thin-scrollbar max-h-32 whitespace-pre-wrap break-words text-[11px] leading-5">{preview.compiledPrompt}</pre>
                    </div>
                ) : null}
            </section>
        </div>
    );
}

function SourceButton({
    node,
    boundSources,
    intentCount,
    saving,
    onAddWhole,
    onAddRegion,
    onAddStyle,
}: {
    node: CanvasNodeData;
    boundSources: BoundReferenceSources;
    intentCount: number;
    saving: boolean;
    onAddWhole: () => void;
    onAddRegion: () => void;
    onAddStyle: () => void;
}) {
    const { t } = useI18n();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const available = isReferenceSourceAvailable(node, boundSources);
    const menuItems: MenuProps["items"] = [
        { key: "whole", label: t("reference.composer.sourceWhole") },
        { key: "region", label: t("reference.composer.sourceRegion") },
        { key: "style", label: t("reference.composer.sourceStyle") },
    ];
    const onMenuClick: MenuProps["onClick"] = ({ key }) => {
        if (key === "region") {
            onAddRegion();
            return;
        }
        if (key === "style") {
            onAddStyle();
            return;
        }
        onAddWhole();
    };
    return (
        <div className="w-24 shrink-0 rounded-lg border p-1.5" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <SourcePreview node={node} boundSources={boundSources} />
            <div className="mt-1 truncate text-[11px]">{node.title}</div>
            <Dropdown disabled={!available} trigger={["click"]} menu={{ items: menuItems, onClick: onMenuClick }} getPopupContainer={(trigger) => trigger.parentElement || document.body}>
                <Button size="small" className="mt-1 !h-6 !w-full !text-[11px]" disabled={!available} loading={saving}>
                    {available ? sourceActionLabel(t, intentCount) : t("reference.composer.unavailable")}
                </Button>
            </Dropdown>
        </div>
    );
}

function RegionSelector({
    source,
    boundSources,
    saving,
    onCancel,
    onSave,
}: {
    source: CanvasNodeData;
    boundSources: BoundReferenceSources;
    saving: boolean;
    onCancel: () => void;
    onSave: (draft: RegionIntentDraft) => void;
}) {
    const { t } = useI18n();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [crop, setCrop] = useState<ReferenceCropRect>(defaultRegionCrop);
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
    const [role, setRole] = useState<ReferenceIntentRole>("element");
    const [weight, setWeight] = useState(1);
    const [note, setNote] = useState("");
    const [ratio, setRatio] = useState(16 / 9);
    const url = sourceImageUrl(source, boundSources);
    const validCrop = normalizeReferenceCropRect(crop);

    const updateCrop = (event: ReactPointerEvent<HTMLDivElement>, start = dragStart) => {
        if (!start) return;
        const point = pointerPosition(event);
        const next = normalizeReferenceCropRect({
            type: "rect",
            x: Math.min(start.x, point.x),
            y: Math.min(start.y, point.y),
            width: Math.abs(point.x - start.x),
            height: Math.abs(point.y - start.y),
        });
        if (next) setCrop(next);
    };

    return (
        <section className="mt-3 rounded-xl border p-2.5" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-xs font-medium">{t("reference.composer.regionTitle")}</div>
                    <div className="truncate text-[11px] opacity-60">{source.title}</div>
                </div>
                <Button size="small" type="text" className="!h-7 !w-7 !min-w-7 !p-0" icon={<X className="size-3.5" />} onClick={onCancel} />
            </div>

            <div
                className="relative overflow-hidden rounded-lg border bg-black/10"
                style={{ aspectRatio: `${ratio}`, borderColor: theme.node.stroke }}
                onPointerDown={(event) => {
                    const point = pointerPosition(event);
                    setDragStart(point);
                    setCrop({ type: "rect", x: point.x, y: point.y, width: 0.01, height: 0.01 });
                    event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => updateCrop(event)}
                onPointerUp={(event) => {
                    updateCrop(event);
                    setDragStart(null);
                    event.currentTarget.releasePointerCapture(event.pointerId);
                }}
            >
                {url ? (
                    <img
                        src={url}
                        alt=""
                        draggable={false}
                        className="absolute inset-0 h-full w-full select-none object-fill"
                        onLoad={(event) => {
                            const img = event.currentTarget;
                            if (img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight);
                        }}
                    />
                ) : (
                    <div className="grid h-full place-items-center text-xs opacity-60">{t("reference.composer.unavailable")}</div>
                )}
                <div
                    className="absolute border-2 border-cyan-300 bg-cyan-300/20"
                    style={{
                        left: `${crop.x * 100}%`,
                        top: `${crop.y * 100}%`,
                        width: `${crop.width * 100}%`,
                        height: `${crop.height * 100}%`,
                    }}
                />
            </div>

            <div className="mt-2 grid gap-2">
                <Segmented
                    block
                    size="small"
                    className="!w-full [&_.ant-segmented-group]:!grid [&_.ant-segmented-group]:!grid-cols-2 sm:[&_.ant-segmented-group]:!grid-cols-4 [&_.ant-segmented-item-label]:!px-1.5 [&_.ant-segmented-item-label]:!text-[11px]"
                    value={role}
                    options={roles.map((item) => ({ value: item, label: t(`reference.role.${item}`) }))}
                    onChange={(value) => setRole(value as ReferenceIntentRole)}
                />
                <div className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)_96px]">
                    <Space.Compact size="small" className="w-full">
                        <span className="inline-flex h-6 shrink-0 items-center rounded-l-md border px-2 text-xs" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.muted }}>
                            {t("reference.composer.weight")}
                        </span>
                        <InputNumber className="!w-full" size="small" min={0.1} max={2} step={0.1} value={weight} onChange={(value) => setWeight(Number(value) || 1)} />
                    </Space.Compact>
                    <Input size="small" value={note} placeholder={t("reference.composer.regionNotePlaceholder")} onChange={(event) => setNote(event.target.value)} />
                    <Button size="small" type="primary" disabled={!validCrop || !url} loading={saving} onClick={() => validCrop && onSave({ cropJson: validCrop, role, weight, note })}>
                        {t("reference.composer.saveRegion")}
                    </Button>
                </div>
            </div>
        </section>
    );
}

function AssetSourceButton({ asset, added, saving, onAdd }: { asset: CreativeAsset; added: boolean; saving: boolean; onAdd: () => void }) {
    const { t } = useI18n();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="w-24 shrink-0 rounded-lg border p-1.5" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <img src={mediaObjectUrl(asset.mediaObjectId)} alt="" className="h-14 w-full rounded-md object-cover" />
            <div className="mt-1 truncate text-[11px]">{asset.title}</div>
            <Button size="small" className="mt-1 !h-6 !w-full !text-[11px]" disabled={added} loading={saving} onClick={onAdd}>
                {added ? t("reference.composer.added") : t("reference.composer.add")}
            </Button>
        </div>
    );
}

function IntentRow({ intent, saving, onPatch, onDelete }: { intent: ReferenceIntent; saving: boolean; onPatch: (patch: IntentPatch) => void; onDelete: () => void }) {
    const { t } = useI18n();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div data-reference-intent-row className="rounded-lg border p-2.5" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <div className="flex flex-wrap items-center gap-2">
                <div className="w-24 shrink-0">
                    <IntentPreview intent={intent} />
                </div>
                <div className="min-w-[220px] flex-1">
                    <Segmented
                        block
                        size="small"
                        className="!w-full [&_.ant-segmented-group]:!grid [&_.ant-segmented-group]:!grid-cols-2 sm:[&_.ant-segmented-group]:!grid-cols-4 [&_.ant-segmented-item-label]:!px-1.5 [&_.ant-segmented-item-label]:!text-[11px]"
                        value={intent.role}
                        options={roles.map((role) => ({ value: role, label: t(`reference.role.${role}`) }))}
                        onChange={(value) => onPatch({ role: value as ReferenceIntentRole })}
                    />
                </div>
                <Switch className="shrink-0" size="small" checked={intent.enabled} loading={saving} onChange={(enabled) => onPatch({ enabled })} />
                <Button size="small" danger type="text" className="!h-7 !w-7 !min-w-7 !p-0" icon={<Trash2 className="size-3.5" />} loading={saving} onClick={onDelete} />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[64px_132px_minmax(0,1fr)]">
                <div className="flex gap-1">
                    <Button size="small" className="!h-7 !w-7 !min-w-7 !p-0" icon={<ArrowUp className="size-3.5" />} onClick={() => onPatch({ sortOrder: Math.max(0, intent.sortOrder - 1) })} />
                    <Button size="small" className="!h-7 !w-7 !min-w-7 !p-0" icon={<ArrowDown className="size-3.5" />} onClick={() => onPatch({ sortOrder: intent.sortOrder + 1 })} />
                </div>
                <Space.Compact size="small" className="w-full">
                    <span className="inline-flex h-6 shrink-0 items-center rounded-l-md border px-2 text-xs" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.muted }}>
                        {t("reference.composer.weight")}
                    </span>
                    <InputNumber className="!w-full" size="small" min={0.1} max={2} step={0.1} value={intent.weight} onChange={(value) => onPatch({ weight: Number(value) || 1 })} />
                </Space.Compact>
                <Input size="small" defaultValue={intent.note} placeholder={t("reference.composer.notePlaceholder")} onBlur={(event) => event.target.value !== intent.note && onPatch({ note: event.target.value })} />
            </div>
        </div>
    );
}

function SourcePreview({ node, boundSources }: { node: CanvasNodeData; boundSources: BoundReferenceSources }) {
    const url = sourceImageUrl(node, boundSources);
    if (url) return <img src={url} alt="" className="h-14 w-full rounded-md object-cover" />;
    return <span className="grid h-14 w-full place-items-center rounded-md bg-black/10"><ImageIcon className="size-4" /></span>;
}

function IntentPreview({ intent }: { intent: ReferenceIntent }) {
    const url = intent.mediaObjectId ? mediaObjectUrl(intent.mediaObjectId) : "";
    const crop = normalizeReferenceCropRect(intent.cropJson);
    if (url && crop) {
        return (
            <span className="relative block h-10 w-full overflow-hidden rounded-md bg-black/10">
                <img
                    src={url}
                    alt=""
                    className="absolute max-w-none"
                    style={{
                        width: `${100 / crop.width}%`,
                        height: `${100 / crop.height}%`,
                        left: `${(-crop.x / crop.width) * 100}%`,
                        top: `${(-crop.y / crop.height) * 100}%`,
                        objectFit: "fill",
                    }}
                />
            </span>
        );
    }
    if (url) return <img src={url} alt="" className="h-10 w-full rounded-md object-cover" />;
    return <span className="grid h-10 w-full place-items-center rounded-md bg-black/10"><ImageIcon className="size-4" /></span>;
}

function EmptyLine({ text }: { text: string }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return <div className="rounded-lg border px-3 py-5 text-center text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>{text}</div>;
}

function SectionTitle({ children }: { children: string }) {
    return <div className="mb-1.5 text-[11px] font-medium opacity-65">{children}</div>;
}

function sourceActionLabel(t: ReturnType<typeof useI18n>["t"], count: number) {
    if (count > 1) return t("reference.composer.intentCount").replace("{count}", String(count));
    if (count === 1) return t("reference.composer.added");
    return t("reference.composer.add");
}

function sourceImageUrl(node: CanvasNodeData, boundSources: BoundReferenceSources) {
    const binding = getReferenceSourceBinding(node, boundSources);
    return node.metadata?.content || (binding.mediaObjectId ? mediaObjectUrl(binding.mediaObjectId) : "");
}

function pointerPosition(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
        x: clamp01((event.clientX - rect.left) / Math.max(1, rect.width)),
        y: clamp01((event.clientY - rect.top) / Math.max(1, rect.height)),
    };
}

function clamp01(value: number) {
    return Math.max(0, Math.min(1, value));
}

function intentSourceKey(intent: ReferenceIntent) {
    return intent.mediaObjectId ? `media:${intent.mediaObjectId}` : intent.assetId ? `asset:${intent.assetId}` : intent.id;
}

function assetAdded(asset: CreativeAsset, keys: Set<string>) {
    return keys.has(`asset:${asset.id}`) || keys.has(`media:${asset.mediaObjectId}`);
}

function referenceSourceFileName(source: CanvasNodeData, mimeType: string) {
    const base = (source.title || source.id || "reference").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 40) || "reference";
    return `${base}.${mimeExtension(mimeType)}`;
}

function mimeExtension(mimeType: string) {
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    return "png";
}
