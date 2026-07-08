export type HomeQuickAction = {
    label: string;
    description: string;
    href: string;
    tone: "primary" | "canvas" | "media" | "library";
};

export type HomeStat = {
    label: string;
    value: string;
    description: string;
};

export type HomeWorkflowCard = {
    title: string;
    description: string;
};

export const homeQuickActions: HomeQuickAction[] = [
    {
        label: "继续画布",
        description: "回到最近项目，把节点、参考和结果接着往下推。",
        href: "/canvas?mode=recent",
        tone: "primary",
    },
    {
        label: "生图工作台",
        description: "用提示词、参考图和参数快速完成单次生成。",
        href: "/image",
        tone: "media",
    },
    {
        label: "视频创作台",
        description: "把镜头想法整理成可复用的视频生成流程。",
        href: "/video",
        tone: "canvas",
    },
    {
        label: "提示词库",
        description: "查找、复制和沉淀稳定出结果的提示词。",
        href: "/prompts",
        tone: "library",
    },
];

export const homeStats: HomeStat[] = [
    {
        label: "创作结构",
        value: "画布 + 工作台",
        description: "适合从一次生成延展成连续推演。",
    },
    {
        label: "模型入口",
        value: "OpenAI 兼容",
        description: "通过配置统一接入兼容模型网关。",
    },
    {
        label: "素材沉淀",
        value: "提示词 / 媒体",
        description: "结果可复用为参考、素材和下一次输入。",
    },
    {
        label: "存储状态",
        value: "本地优先",
        description: "当前创作数据以本地和已实现接口为准。",
    },
];

export const homeWorkflowCards: HomeWorkflowCard[] = [
    {
        title: "开始",
        description: "从最近画布、工作台或提示词进入，不需要重新组织上下文。",
    },
    {
        title: "组合",
        description: "把提示词、参考图、模型参数和素材放进同一条创作链路。",
    },
    {
        title: "生成",
        description: "跟踪结果，把满意输出保存、下载或继续作为参考使用。",
    },
    {
        title: "整理",
        description: "把稳定方法沉淀到提示词库和素材库，让下一次更快开始。",
    },
];

export function getPromptShowcaseLayoutClass(index: number) {
    if (index === 0) return "md:col-span-2 md:row-span-2";
    if (index === 3) return "md:col-span-2";
    return "";
}
