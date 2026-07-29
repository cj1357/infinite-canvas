"use client";

import type { CSSProperties } from "react";
import { Button, Input, Select } from "antd";
import { LoaderCircle, Play, RotateCcw, Square } from "lucide-react";

import { ModelPicker } from "@/components/model-picker";
import { useI18n } from "@/i18n/use-i18n";
import { canvasThemes } from "@/lib/canvas-theme";
import { defaultConfig, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import type { GenerationRunDetail } from "@/services/api/creative";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
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
    inputSummary: { textCount: number; imageCount: number; videoCount: number; audioCount: number };
    onPatch: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onGenerate: (node: CanvasNodeData) => void;
    onRetry: (node: CanvasNodeData) => void;
    onCancel: (node: CanvasNodeData) => void;
};

export function GenerationNode({ node, detail, referenceSets, inputSummary, onPatch, onGenerate, onRetry, onCancel }: GenerationNodeProps) {
    const { t } = useI18n();
    const globalConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const config = buildGenerationNodeConfig(globalConfig, node);
    const status = detail?.run.status || node.metadata?.status || "idle";
    const statusKey = status === "success" ? "succeeded" : status === "error" ? "failed" : status;
    const running = status === "queued" || status === "running" || status === "retrying" || status === "loading";
    const failed = status === "failed" || status === "error";
    const prompt = node.metadata?.prompt || node.metadata?.content || "";
    const canGenerate = Boolean((prompt.trim() || inputSummary.textCount > 0) && !running);
    const chipStyle = { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text };
    const generationErrorMessage = failed ? formatGenerationErrorMessage(detail?.run.errorMessage || detail?.job?.errorMessage || node.metadata?.errorDetails || "") : "";

    return (
        <div className="flex h-full w-full cursor-move flex-col overflow-y-auto px-3 pb-3 pt-7 text-sm" style={{ color: theme.node.text }} onWheel={(event) => event.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-2">
                <div className="truncate text-sm font-semibold">{node.title || t("generation.node.title")}</div>
                <span className="rounded-md border px-2 py-1 text-[11px]" style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.muted }}>
                    {t(`generation.status.${statusKey}`)}
                </span>
            </div>

            <div className="grid gap-2" onMouseDown={(event) => event.stopPropagation()}>
                <Select
                    allowClear
                    size="small"
                    value={node.metadata?.referenceSetId || undefined}
                    placeholder={t("generation.node.referenceSet")}
                    options={referenceSets.map((item) => ({ value: item.id, label: item.title }))}
                    onChange={(referenceSetId) => onPatch(node.id, { referenceSetId: referenceSetId || "" })}
                />
                <div className="flex flex-wrap gap-1.5">
                    <InputChip label="上游文本" value={`${inputSummary.textCount} 个`} style={chipStyle} />
                    <InputChip label="上游参考图" value={`${inputSummary.imageCount} 张`} style={chipStyle} />
                    <InputChip label="参考图组" value={node.metadata?.referenceSetId ? "已选" : "可选"} style={chipStyle} />
                </div>
                <div className="grid min-w-0 gap-2">
                    <ModelPicker className="canvas-compact-control h-9" config={config} value={config.model} capability="image" fullWidth onMissingConfig={() => openConfigDialog(true)} onChange={(model) => onPatch(node.id, { model })} />
                    <CanvasImageSettingsPopover config={config} placement="topRight" buttonClassName="canvas-compact-control !h-9 !w-full !justify-start !rounded-lg !px-2" onConfigChange={(key, value) => onPatch(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })} />
                </div>
                <TextArea size="small" rows={3} value={prompt} placeholder={t("generation.node.prompt")} onChange={(event) => onPatch(node.id, { prompt: event.target.value })} />
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 text-[11px]" style={{ color: theme.node.muted }}>
                <span>{detail?.run.reservedCredits ? `${detail.run.reservedCredits.toLocaleString()} credits` : ""}</span>
                <span>{detail?.job ? `${detail.job.status} #${detail.job.attempt}/${detail.job.maxAttempts}` : ""}</span>
            </div>
            {generationErrorMessage ? (
                <div className="mt-2 line-clamp-3 rounded-lg border px-2 py-1 text-[11px] leading-relaxed" title={generationErrorMessage} style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}>
                    {generationErrorMessage}
                </div>
            ) : null}

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

function formatGenerationErrorMessage(message: string) {
    const text = message.trim();
    if (!text) return "";
    try {
        const parsed = JSON.parse(text) as { error?: { message?: string } };
        return parsed.error?.message || text;
    } catch {
        return text;
    }
}

function InputChip({ label, value, style }: { label: string; value: string; style: CSSProperties }) {
    return (
        <div className="inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11px]" style={style}>
            <span>{label}</span>
            <span className="font-medium">{value}</span>
        </div>
    );
}

function buildGenerationNodeConfig(globalConfig: AiConfig, node: CanvasNodeData): AiConfig {
    return {
        ...globalConfig,
        model: node.metadata?.model || globalConfig.imageModel || globalConfig.model || defaultConfig.model,
        quality: node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
        size: node.metadata?.size || globalConfig.size || defaultConfig.size,
        count: String(node.metadata?.count || globalConfig.canvasImageCount || globalConfig.count || defaultConfig.count),
    };
}
