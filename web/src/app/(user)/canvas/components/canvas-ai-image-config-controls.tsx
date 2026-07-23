"use client";

import { ModelPicker } from "@/components/model-picker";
import type { AiConfig } from "@/stores/use-config-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";

export function CanvasAiImageConfigControls({ config, onConfigChange, onMissingConfig }: { config: AiConfig; onConfigChange: (patch: Partial<AiConfig>) => void; onMissingConfig: () => void }) {
    return (
        <div className="space-y-2 rounded-xl border p-3">
            <div className="text-sm font-medium opacity-75">模型参数</div>
            <div className="grid min-w-0 gap-2">
                <ModelPicker className="h-9" config={config} value={config.model} capability="image" fullWidth onMissingConfig={onMissingConfig} onChange={(model) => onConfigChange({ model, imageModel: model })} />
                <CanvasImageSettingsPopover
                    config={config}
                    placement="bottomRight"
                    buttonClassName="!h-9 !w-full !justify-start !rounded-full !px-3"
                    maxCount={1}
                    quickCount={1}
                    onConfigChange={(key, value) => onConfigChange({ [key]: value } as Partial<AiConfig>)}
                />
            </div>
        </div>
    );
}
