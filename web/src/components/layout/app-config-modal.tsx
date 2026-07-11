"use client";

import { App, Button, Form, Input, Modal, Select } from "antd";

import { audioFormatOptions, audioVoiceOptions, normalizeAudioSpeedValue } from "@/lib/audio-generation";
import { useConfigStore } from "@/stores/use-config-store";

export function AppConfigModal() {
    const { message } = App.useApp();
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);

    const normalizeImageCount = (value: string) => {
        return String(Math.max(1, Math.min(15, Math.floor(Math.abs(Number(value)) || 3))));
    };

    return (
        <Modal
            title={
                <div>
                    <div className="text-lg font-semibold">生成偏好配置</div>
                    <div className="mt-1 text-xs font-normal text-stone-500">画布默认生图张数、音频参数和系统提示词</div>
                </div>
            }
            open={isConfigOpen}
            width={620}
            centered
            onCancel={() => setConfigDialogOpen(false)}
            footer={
                <Button type="primary" onClick={() => setConfigDialogOpen(false)}>
                    完成
                </Button>
            }
        >
            <Form layout="vertical" requiredMark={false} className="py-4">
                <div className="grid gap-4 md:grid-cols-2">
                    <Form.Item label="画布默认生图张数" extra="新建画布生图和配置节点默认使用，单个节点仍可单独覆盖。" className="mb-4">
                        <Input
                            type="number"
                            min={1}
                            max={15}
                            value={config.canvasImageCount}
                            onChange={(event) => updateConfig("canvasImageCount", event.target.value)}
                            onBlur={(event) => updateConfig("canvasImageCount", normalizeImageCount(event.target.value))}
                        />
                    </Form.Item>
                    <Form.Item label="默认音频声音" className="mb-4">
                        <Select value={config.audioVoice} options={audioVoiceOptions} onChange={(value) => updateConfig("audioVoice", value)} />
                    </Form.Item>
                    <Form.Item label="默认音频格式" className="mb-4">
                        <Select value={config.audioFormat} options={audioFormatOptions} onChange={(value) => updateConfig("audioFormat", value)} />
                    </Form.Item>
                    <Form.Item label="默认音频语速" className="mb-4">
                        <Input
                            type="number"
                            min={0.25}
                            max={4}
                            step={0.05}
                            value={config.audioSpeed}
                            onChange={(event) => updateConfig("audioSpeed", event.target.value)}
                            onBlur={(event) => updateConfig("audioSpeed", normalizeAudioSpeedValue(event.target.value))}
                        />
                    </Form.Item>
                </div>
                <Form.Item label="默认音频指令" className="mb-4">
                    <Input.TextArea rows={2} value={config.audioInstructions} placeholder="例如：自然、温暖、适合旁白。" onChange={(event) => updateConfig("audioInstructions", event.target.value)} />
                </Form.Item>
                <Form.Item label="系统提示词" className="mb-0">
                    <Input.TextArea rows={4} value={config.systemPrompt} placeholder="例如：你是一位擅长电影感写实摄影的视觉导演。" onChange={(event) => updateConfig("systemPrompt", event.target.value)} />
                </Form.Item>
            </Form>
        </Modal>
    );
}
