"use client";

import { Button, Input, InputNumber, Select, Space } from "antd";
import { LoaderCircle, Play, RotateCcw, Square } from "lucide-react";

import { useI18n } from "@/i18n/use-i18n";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { GenerationRunDetail } from "@/services/api/creative";
import type { CanvasNodeData, CanvasNodeMetadata } from "../types";

const { TextArea } = Input;

type ReferenceOption = {
    id: string;
    title: string;
};

type GenerationNodeProps = {
    node: CanvasNodeData;
    detail?: GenerationRunDetail | null;
    referenceSets: ReferenceOption[];
    onPatch: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (node: CanvasNodeData) => void;
    onRetry: (node: CanvasNodeData) => void;
    onCancel: (node: CanvasNodeData) => void;
};

export function GenerationNode({ node, detail, referenceSets, onPatch, onGenerate, onRetry, onCancel }: GenerationNodeProps) {
    const { t } = useI18n();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const status = detail?.run.status || node.metadata?.status || "idle";
    const statusKey = status === "success" ? "succeeded" : status === "error" ? "failed" : status;
    const running = status === "queued" || status === "running" || status === "retrying" || status === "loading";
    const failed = status === "failed" || status === "error";
    const canGenerate = Boolean((node.metadata?.prompt || node.metadata?.content || "").trim() && node.metadata?.referenceSetId && !running);

    return (
        <div className="flex h-full w-full cursor-move flex-col px-3 pb-3 pt-7 text-sm" style={{ color: theme.node.text }} onWheel={(event) => event.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-2">
                <div className="truncate text-sm font-semibold">{node.title || t("generation.node.title")}</div>
                <span className="rounded-md border px-2 py-1 text-[11px]" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.muted }}>
                    {t(`generation.status.${statusKey}`)}
                </span>
            </div>

            <div className="grid gap-2" onMouseDown={(event) => event.stopPropagation()}>
                <Select
                    size="small"
                    value={node.metadata?.referenceSetId || undefined}
                    placeholder={t("generation.node.referenceSet")}
                    options={referenceSets.map((item) => ({ value: item.id, label: item.title }))}
                    onChange={(referenceSetId) => onPatch(node.id, { referenceSetId })}
                />
                <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-2">
                    <Input size="small" value={node.metadata?.model || ""} placeholder={t("common.model")} onChange={(event) => onPatch(node.id, { model: event.target.value })} />
                    <Space.Compact size="small" className="w-full">
                        <span className="inline-flex h-6 shrink-0 items-center rounded-l-md border px-2 text-xs" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.muted }}>
                            {t("generation.node.outputCount")}
                        </span>
                        <InputNumber className="!w-full" size="small" min={1} max={8} value={node.metadata?.count || 1} onChange={(count) => onPatch(node.id, { count: Number(count) || 1 })} />
                    </Space.Compact>
                </div>
                <TextArea size="small" rows={3} value={node.metadata?.prompt || node.metadata?.content || ""} placeholder={t("generation.node.prompt")} onChange={(event) => onPatch(node.id, { prompt: event.target.value })} />
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 text-[11px]" style={{ color: theme.node.muted }}>
                <span>{detail?.run.reservedCredits ? `${detail.run.reservedCredits.toLocaleString()} credits` : node.metadata?.referenceSetId ? "" : t("generation.node.noReferenceSet")}</span>
                <span>{detail?.job ? `${detail.job.status} #${detail.job.attempt}/${detail.job.maxAttempts}` : ""}</span>
            </div>

            <div className="mt-auto flex gap-2" onMouseDown={(event) => event.stopPropagation()}>
                {running ? (
                    <Button className="!h-8 !flex-1" danger icon={<Square className="size-3.5 fill-current" />} onClick={() => onCancel(node)}>
                        {t("generation.node.stop")}
                    </Button>
                ) : failed ? (
                    <Button className="!h-8 !flex-1" icon={<RotateCcw className="size-3.5" />} onClick={() => onRetry(node)}>
                        {t("generation.node.retry")}
                    </Button>
                ) : (
                    <Button type="primary" className="!h-8 !flex-1" disabled={!canGenerate} icon={<Play className="size-3.5" />} onClick={() => onGenerate(node)}>
                        {t("generation.node.generate")}
                    </Button>
                )}
                {running ? <LoaderCircle className="mt-1.5 size-5 animate-spin" /> : null}
            </div>
        </div>
    );
}
