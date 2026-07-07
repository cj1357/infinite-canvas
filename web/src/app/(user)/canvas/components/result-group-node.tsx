"use client";

import { Button } from "antd";
import { Image as ImageIcon, Star } from "lucide-react";

import { useI18n } from "@/i18n/use-i18n";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { mediaObjectUrl, type GenerationOutput } from "@/services/api/creative";
import type { CanvasNodeData, CanvasNodeMetadata } from "../types";

type ResultGroupNodeProps = {
    node: CanvasNodeData;
    outputs: GenerationOutput[];
    onPatch: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onSaveAsset: (output: GenerationOutput) => void;
};

export function ResultGroupNode({ node, outputs, onPatch, onSaveAsset }: ResultGroupNodeProps) {
    const { t } = useI18n();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const selectedOutputId = node.metadata?.generationOutputId || outputs.find((item) => item.selected)?.id || "";
    const selectedOutput = outputs.find((item) => item.id === selectedOutputId) || outputs[0];

    return (
        <div className="flex h-full w-full cursor-move flex-col px-3 pb-3 pt-7 text-sm" style={{ color: theme.node.text }}>
            <div className="mb-2 flex items-center justify-between gap-2">
                <div className="truncate text-sm font-semibold">{node.title || t("generation.node.resultGroup")}</div>
                {selectedOutput ? (
                    <Button
                        size="small"
                        type="text"
                        className="!h-7 !px-2 !text-[11px]"
                        icon={<Star className="size-3.5" />}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={() => onSaveAsset(selectedOutput)}
                    >
                        {t("generation.node.saveAsset")}
                    </Button>
                ) : (
                    <span className="text-[11px]" style={{ color: theme.node.muted }}>
                        {t("generation.node.noOutputs")}
                    </span>
                )}
            </div>
            {outputs.length ? (
                <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-hidden">
                    {outputs.slice(0, 4).map((output) => {
                        const selected = selectedOutputId === output.id;
                        return (
                            <button
                                key={output.id}
                                type="button"
                                className="relative min-h-0 overflow-hidden rounded-lg border"
                                style={{ borderColor: selected ? theme.node.activeStroke : theme.node.stroke, background: theme.node.fill }}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => onPatch(node.id, { generationOutputId: output.id, mediaObjectId: output.mediaObjectId })}
                            >
                                {output.mediaObjectId ? <img src={mediaObjectUrl(output.mediaObjectId)} alt="" className="h-full w-full object-cover" /> : <EmptyPreview />}
                                {selected ? <span className="absolute right-1 top-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">{t("generation.node.selected")}</span> : null}
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="grid flex-1 place-items-center rounded-lg border text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                    {t("generation.node.noOutputs")}
                </div>
            )}
        </div>
    );
}

function EmptyPreview() {
    return (
        <span className="grid h-full w-full place-items-center bg-black/10">
            <ImageIcon className="size-5" />
        </span>
    );
}
