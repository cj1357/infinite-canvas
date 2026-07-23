"use client";

import { useEffect, useState } from "react";
import { Button, Modal } from "antd";
import { Sparkles } from "lucide-react";

import { readImageMeta } from "@/lib/image-utils";
import type { AiConfig } from "@/stores/use-config-store";
import { CanvasAiImageConfigControls } from "./canvas-ai-image-config-controls";

export function CanvasNodeSuperResolveDialog({ dataUrl, open, initialConfig, onMissingConfig, onClose, onConfirm }: { dataUrl: string; open: boolean; initialConfig: AiConfig; onMissingConfig: () => void; onClose: () => void; onConfirm: (config: AiConfig) => void }) {
    const [config, setConfig] = useState<AiConfig>({ ...initialConfig, count: "1" });
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);

    useEffect(() => {
        if (!open) return;
        setConfig({ ...initialConfig, count: "1" });
        setImage(null);
    }, [dataUrl, open]);

    useEffect(() => {
        if (!open) return;
        void readImageMeta(dataUrl).then(setImage);
    }, [dataUrl, open]);

    const updateConfig = (patch: Partial<AiConfig>) => setConfig((current) => ({ ...current, ...patch, count: "1" }));

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={820} centered destroyOnHidden>
            <div className="space-y-5">
                <div>
                    <h2 className="text-xl font-semibold">AI 超分</h2>
                    <p className="mt-1 text-sm opacity-60">基于原图高清重绘，尽量保持主体、构图和文字布局不变</p>
                </div>
                <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_360px]">
                    <div className="rounded-xl border p-4">
                        <div className="grid min-h-[280px] place-items-center rounded-lg bg-black/5">
                            <img src={dataUrl} alt="" className="max-h-[320px] max-w-full rounded-lg object-contain shadow-xl" draggable={false} />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                            <span className="opacity-60">源图</span>
                            <span className="font-semibold">{image ? `${image.width} x ${image.height} px` : "读取中"}</span>
                        </div>
                    </div>
                    <div className="space-y-4 py-2">
                        <CanvasAiImageConfigControls config={config} onConfigChange={updateConfig} onMissingConfig={onMissingConfig} />
                        <div className="rounded-xl border px-4 py-3 text-sm leading-6 opacity-70">超分会走图生图模型请求，并生成一个新的图片节点。建议选择 2K 或 4K 分辨率，宽高比尽量与源图一致。</div>
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button type="primary" size="large" icon={<Sparkles className="size-4" />} onClick={() => onConfirm(config)}>
                        生成超分图
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
