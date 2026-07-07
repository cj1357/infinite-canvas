"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Input, InputNumber, Segmented, Switch } from "antd";
import { ArrowDown, ArrowUp, Image as ImageIcon, LoaderCircle, RefreshCw, X } from "lucide-react";

import { useI18n } from "@/i18n/use-i18n";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import {
    compileReferenceSetPreview,
    createReferenceIntent,
    createReferenceSet,
    getReferenceSet,
    listCreativeAssets,
    mediaObjectUrl,
    updateReferenceIntent,
    updateReferenceSet,
    type CreativeAsset,
    type CompileReferenceSetPreviewOutput,
    type ReferenceIntent,
    type ReferenceIntentRole,
    type ReferenceSetDetail,
} from "@/services/api/creative";
import type { CanvasNodeData } from "../types";

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

export function ReferenceComposer({ node, projectId, sourceNodes, connectedSourceNodes = [], initialDetail, defaultPrompt, onReferenceSetChange, onClose }: ReferenceComposerProps) {
    const { message } = App.useApp();
    const { locale, t } = useI18n();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [detail, setDetail] = useState<ReferenceSetDetail | null>(initialDetail || null);
    const [title, setTitle] = useState(initialDetail?.referenceSet.title || node.title || t("reference.node.title"));
    const [loading, setLoading] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [previewPrompt, setPreviewPrompt] = useState(defaultPrompt || node.metadata?.prompt || "");
    const [preview, setPreview] = useState<CompileReferenceSetPreviewOutput | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [assets, setAssets] = useState<CreativeAsset[]>([]);
    const [assetsLoading, setAssetsLoading] = useState(false);
    const autoAddingKeysRef = useRef(new Set<string>());
    const sourceKeySet = useMemo(() => new Set((detail?.intents || []).map(intentSourceKey)), [detail?.intents]);
    const orderedIntents = useMemo(() => [...(detail?.intents || [])].sort((a, b) => a.sortOrder - b.sortOrder), [detail?.intents]);

    useEffect(() => {
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
    }, [message, node.id, node.metadata?.referenceSetId, onReferenceSetChange, t]);

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
        if (!detail) return;
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
        void loadAssets();
    }, []);

    const saveTitle = async () => {
        if (!detail) return;
        try {
            const referenceSet = await updateReferenceSet(detail.referenceSet.id, { ...detail.referenceSet, title: title.trim() || t("reference.node.title"), projectId });
            const next = { ...detail, referenceSet };
            setDetail(next);
            onReferenceSetChange(node.id, next);
        } catch {
            message.error(t("reference.composer.saveFailed"));
        }
    };

    const addSource = async (source: CanvasNodeData) => {
        if (!detail) return;
        const mediaObjectId = source.metadata?.mediaObjectId || "";
        const assetId = source.metadata?.assetId || "";
        if (!mediaObjectId && !assetId) return;
        setSavingId(source.id);
        try {
            await createReferenceIntent(detail.referenceSet.id, {
                mediaObjectId,
                assetId,
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

    const addAssetSource = async (asset: CreativeAsset) => {
        if (!detail) return;
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
            const key = sourceKey(source);
            if (sourceKeySet.has(key) || autoAddingKeysRef.current.has(key)) return;
            if (!source.metadata?.mediaObjectId && !source.metadata?.assetId) return;
            autoAddingKeysRef.current.add(key);
            void addSource(source).finally(() => {
                autoAddingKeysRef.current.delete(key);
            });
        });
    }, [connectedSourceNodes, detail, sourceKeySet]);

    const patchIntent = async (intent: ReferenceIntent, patch: IntentPatch) => {
        if (!detail) return;
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

    const compilePreview = async () => {
        if (!detail) return;
        setPreviewing(true);
        try {
            const next = await compileReferenceSetPreview(detail.referenceSet.id, {
                prompt: previewPrompt,
                locale,
                ability: "image",
                model: node.metadata?.model || "default",
                params: { count: node.metadata?.count || 1, size: node.metadata?.size },
            });
            setPreview(next);
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
                    {sourceNodes.length ? sourceNodes.map((source) => <SourceButton key={source.id} node={source} added={sourceKeySet.has(sourceKey(source))} saving={savingId === source.id} onAdd={() => void addSource(source)} />) : <EmptyLine text={t("reference.node.empty")} />}
                </div>
            </section>

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
                            <IntentRow key={intent.id} intent={intent} saving={savingId === intent.id} onPatch={(patch) => void patchIntent(intent, patch)} />
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

function SourceButton({ node, added, saving, onAdd }: { node: CanvasNodeData; added: boolean; saving: boolean; onAdd: () => void }) {
    const { t } = useI18n();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const bound = Boolean(node.metadata?.mediaObjectId || node.metadata?.assetId);
    return (
        <div className="w-24 shrink-0 rounded-lg border p-1.5" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <SourcePreview node={node} />
            <div className="mt-1 truncate text-[11px]">{node.title}</div>
            <Button size="small" className="mt-1 !h-6 !w-full !text-[11px]" disabled={!bound || added} loading={saving} onClick={onAdd}>
                {bound ? t("reference.composer.add") : t("reference.composer.unavailable")}
            </Button>
        </div>
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
                {t("reference.composer.add")}
            </Button>
        </div>
    );
}

function IntentRow({ intent, saving, onPatch }: { intent: ReferenceIntent; saving: boolean; onPatch: (patch: IntentPatch) => void }) {
    const { t } = useI18n();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="rounded-lg border p-2" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <div className="grid gap-2 sm:grid-cols-[96px_minmax(0,1fr)_72px_56px]">
                <IntentPreview intent={intent} />
                <Segmented size="small" value={intent.role} options={roles.map((role) => ({ value: role, label: t(`reference.role.${role}`) }))} onChange={(value) => onPatch({ role: value as ReferenceIntentRole })} />
                <InputNumber size="small" min={0.1} max={2} step={0.1} value={intent.weight} onChange={(value) => onPatch({ weight: Number(value) || 1 })} addonBefore={t("reference.composer.weight")} />
                <Switch size="small" checked={intent.enabled} loading={saving} onChange={(enabled) => onPatch({ enabled })} />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[56px_minmax(0,1fr)]">
                <div className="flex gap-1">
                    <Button size="small" className="!h-7 !w-7 !min-w-7 !p-0" icon={<ArrowUp className="size-3.5" />} onClick={() => onPatch({ sortOrder: Math.max(0, intent.sortOrder - 1) })} />
                    <Button size="small" className="!h-7 !w-7 !min-w-7 !p-0" icon={<ArrowDown className="size-3.5" />} onClick={() => onPatch({ sortOrder: intent.sortOrder + 1 })} />
                </div>
                <Input size="small" defaultValue={intent.note} placeholder={t("reference.composer.notePlaceholder")} onBlur={(event) => event.target.value !== intent.note && onPatch({ note: event.target.value })} />
            </div>
        </div>
    );
}

function SourcePreview({ node }: { node: CanvasNodeData }) {
    const url = node.metadata?.content || (node.metadata?.mediaObjectId ? mediaObjectUrl(node.metadata.mediaObjectId) : "");
    if (url) return <img src={url} alt="" className="h-14 w-full rounded-md object-cover" />;
    return <span className="grid h-14 w-full place-items-center rounded-md bg-black/10"><ImageIcon className="size-4" /></span>;
}

function IntentPreview({ intent }: { intent: ReferenceIntent }) {
    const url = intent.mediaObjectId ? mediaObjectUrl(intent.mediaObjectId) : "";
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

function sourceKey(node: CanvasNodeData) {
    return node.metadata?.mediaObjectId ? `media:${node.metadata.mediaObjectId}` : node.metadata?.assetId ? `asset:${node.metadata.assetId}` : node.id;
}

function intentSourceKey(intent: ReferenceIntent) {
    return intent.mediaObjectId ? `media:${intent.mediaObjectId}` : intent.assetId ? `asset:${intent.assetId}` : intent.id;
}

function assetAdded(asset: CreativeAsset, keys: Set<string>) {
    return keys.has(`asset:${asset.id}`) || keys.has(`media:${asset.mediaObjectId}`);
}
