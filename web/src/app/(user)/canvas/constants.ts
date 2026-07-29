import { CanvasNodeType } from "./types";
import type { CanvasNodeMetadata } from "./types";

type CanvasNodeSpec = {
    width: number;
    height: number;
    title: string;
    metadata?: CanvasNodeMetadata;
};

export const NODE_DEFAULT_SIZE = {
    [CanvasNodeType.Media]: { width: 340, height: 240, title: "媒体" },
    [CanvasNodeType.Prompt]: { width: 340, height: 220, title: "提示词" },
    [CanvasNodeType.ReferenceSet]: { width: 360, height: 260, title: "参考图组" },
    [CanvasNodeType.Generation]: { width: 360, height: 340, title: "生成任务" },
    [CanvasNodeType.ResultGroup]: { width: 420, height: 300, title: "结果组" },
    [CanvasNodeType.Note]: { width: 300, height: 180, title: "便签" },
    [CanvasNodeType.Image]: { width: 340, height: 240, title: "New Generation" },
    [CanvasNodeType.Text]: { width: 340, height: 240, title: "Note" },
    [CanvasNodeType.Config]: { width: 340, height: 240, title: "生成配置" },
    [CanvasNodeType.Video]: { width: 420, height: 236, title: "Video" },
    [CanvasNodeType.Audio]: { width: 340, height: 120, title: "Audio" },
} satisfies Record<CanvasNodeType, { width: number; height: number; title: string }>;

export const NODE_SPECS = {
    [CanvasNodeType.Media]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Media],
        metadata: { content: "", status: "idle", mediaKind: "image" },
    },
    [CanvasNodeType.Prompt]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Prompt],
        metadata: { content: "", status: "idle", generationMode: "image", fontSize: 14 },
    },
    [CanvasNodeType.ReferenceSet]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.ReferenceSet],
        metadata: { status: "idle" },
    },
    [CanvasNodeType.Generation]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Generation],
        metadata: { content: "", status: "idle", generationMode: "image" },
    },
    [CanvasNodeType.ResultGroup]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.ResultGroup],
        metadata: { status: "idle" },
    },
    [CanvasNodeType.Note]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Note],
        metadata: { content: "", status: "idle", fontSize: 14 },
    },
    [CanvasNodeType.Image]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Image],
        metadata: { content: "", status: "idle", mediaKind: "image" },
    },
    [CanvasNodeType.Text]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Text],
        metadata: { content: "", status: "idle", fontSize: 14 },
    },
    [CanvasNodeType.Config]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Config],
        metadata: { content: "", status: "idle", generationMode: "image" },
    },
    [CanvasNodeType.Video]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Video],
        metadata: { content: "", status: "idle", mediaKind: "video" },
    },
    [CanvasNodeType.Audio]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Audio],
        metadata: { content: "", status: "idle", mediaKind: "audio" },
    },
} satisfies Record<CanvasNodeType, CanvasNodeSpec>;

export function getNodeSpec(type: CanvasNodeType) {
    return NODE_SPECS[type];
}
