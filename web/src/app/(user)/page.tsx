"use client";

import { ArrowRight, Boxes, FileText, ImageIcon, Layers3, Maximize2, Sparkles, Video, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { App, Button, Image, Tag } from "antd";

import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import { cn } from "@/lib/utils";
import { getPromptShowcaseLayoutClass, homeQuickActions, homeStats, homeWorkflowCards, type HomeQuickAction } from "./home-content";

const actionIconMap: Record<HomeQuickAction["tone"], typeof Maximize2> = {
    primary: Maximize2,
    canvas: Video,
    media: ImageIcon,
    library: FileText,
};

const actionToneClass: Record<HomeQuickAction["tone"], string> = {
    primary: "border-cyan-400/40 bg-cyan-400/12 text-cyan-800 dark:text-cyan-100",
    canvas: "border-cyan-400/25 bg-cyan-400/10 text-cyan-800 dark:text-cyan-100",
    media: "border-cyan-400/25 bg-cyan-400/10 text-cyan-800 dark:text-cyan-100",
    library: "border-cyan-400/25 bg-cyan-400/10 text-cyan-800 dark:text-cyan-100",
};

export default function IndexPage() {
    const { message } = App.useApp();
    const [promptShowcase, setPromptShowcase] = useState<Prompt[]>([]);
    const [promptLoading, setPromptLoading] = useState(true);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [previewOpen, setPreviewOpen] = useState(false);

    const previewItems = useMemo(() => promptShowcase.filter((item) => Boolean(item.coverUrl)), [promptShowcase]);

    useEffect(() => {
        setPromptLoading(true);
        void fetchPrompts({ pageSize: 12 })
            .then((data) => setPromptShowcase(data.items))
            .catch((error) => message.error(error instanceof Error ? error.message : "获取提示词失败"))
            .finally(() => setPromptLoading(false));
    }, [message]);

    const openPromptPreview = (item: Prompt) => {
        if (!item.coverUrl) return;
        const index = previewItems.findIndex((preview) => preview.id === item.id);
        if (index < 0) return;
        setPreviewIndex(index);
        setPreviewOpen(true);
    };

    return (
        <main className="studio-grid relative h-full overflow-y-auto text-foreground">
            <section className="mx-auto grid min-h-[calc(100dvh-3.5rem)] w-full max-w-[1440px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-center lg:py-12">
                <div className="max-w-3xl">
                    <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/70 px-3 py-2 text-xs font-medium text-muted-foreground backdrop-blur">
                        <span className="size-1.5 rounded-full bg-cyan-500 shadow-[0_0_18px_rgba(34,211,238,.8)]" />
                        创作操作系统
                    </div>
                    <h1 className="mt-7 text-balance text-5xl font-semibold leading-[0.96] tracking-tight text-foreground sm:text-7xl lg:text-8xl">无限画布</h1>
                    <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
                        把提示词、参考图、模型参数和生成结果放进同一个创作空间。
                    </p>
                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <Button type="primary" size="large" href="/canvas?mode=recent" icon={<ArrowRight className="size-4" />} iconPlacement="end">
                            开始创作
                        </Button>
                        <Button size="large" href="/canvas">
                            打开画布
                        </Button>
                    </div>

                    <div className="mt-10 grid gap-3 sm:grid-cols-2">
                        {homeQuickActions.map((item) => {
                            const Icon = actionIconMap[item.tone];
                            return (
                                <a key={item.href} href={item.href} className="studio-focus-ring group rounded-xl border border-border bg-card/62 p-4 backdrop-blur transition hover:-translate-y-0.5 hover:border-cyan-400/50 hover:bg-card/90">
                                    <div className="flex items-start gap-3">
                                        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg border", actionToneClass[item.tone])}>
                                            <Icon className="size-5" />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                                            <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                                        </span>
                                    </div>
                                </a>
                            );
                        })}
                    </div>
                </div>

                <ProductPreviewPanel />
            </section>

            <section className="mx-auto w-full max-w-[1440px] px-4 pb-16 sm:px-6">
                <div className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
                    <div className="studio-surface rounded-2xl p-5 sm:p-6">
                        <div className="mb-5 flex items-center justify-between gap-4">
                            <div>
                                <h2 className="text-2xl font-semibold tracking-tight">今日创作入口</h2>
                                <p className="mt-2 text-sm leading-6 text-muted-foreground">从一次生成进入画布，再把稳定结果沉淀成资产。</p>
                            </div>
                            <Boxes className="size-5 text-cyan-700 dark:text-cyan-300" />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {homeWorkflowCards.map((item, index) => (
                                <article key={item.title} className="rounded-xl border border-border bg-background/58 p-4">
                                    <div className="mb-4 inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-accent px-2 font-mono text-xs text-accent-foreground">{String(index + 1).padStart(2, "0")}</div>
                                    <h3 className="font-semibold">{item.title}</h3>
                                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                                </article>
                            ))}
                        </div>
                    </div>

                    <div className="studio-surface rounded-2xl p-5 sm:p-6">
                        <div className="mb-5 flex items-center justify-between gap-4">
                            <div>
                                <h2 className="text-2xl font-semibold tracking-tight">产品状态</h2>
                                <p className="mt-2 text-sm leading-6 text-muted-foreground">当前版本优先保证本地创作流畅，SaaS 能力逐步接入。</p>
                            </div>
                            <Sparkles className="size-5 text-cyan-700 dark:text-cyan-300" />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {homeStats.map((item) => (
                                <article key={item.label} className="rounded-xl border border-border bg-background/58 p-4">
                                    <div className="text-xs text-muted-foreground">{item.label}</div>
                                    <div className="mt-2 text-lg font-semibold">{item.value}</div>
                                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="mx-auto w-full max-w-[1440px] px-4 pb-20 sm:px-6">
                <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-10">
                    <div>
                        <h2 className="text-3xl font-semibold tracking-tight">沉淀每一次好结果</h2>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">收藏稳定出图的提示词、参考风格和结果图片，让下一次创作从已有经验开始。</p>
                    </div>
                    <Button type="link" href="/prompts" icon={<ArrowRight className="size-4" />} iconPlacement="end">
                        查看提示词库
                    </Button>
                </div>

                {promptLoading ? <PromptShowcaseSkeleton /> : null}
                {!promptLoading && promptShowcase.length ? (
                    <div className="grid auto-rows-[210px] gap-3 md:grid-cols-4">
                        {promptShowcase.map((item, index) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => openPromptPreview(item)}
                                className={cn(
                                    "studio-focus-ring group relative cursor-pointer overflow-hidden rounded-xl border border-border bg-card text-left transition hover:-translate-y-0.5 hover:border-cyan-400/60",
                                    getPromptShowcaseLayoutClass(index),
                                )}
                            >
                                {item.coverUrl ? <img src={item.coverUrl} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /> : <PromptCoverFallback title={item.title} />}
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/88 via-slate-950/48 to-transparent p-4 text-white">
                                    <div className="mb-2 flex flex-wrap gap-1.5">
                                        {item.tags.slice(0, 2).map((tag) => (
                                            <Tag key={tag} className="m-0 rounded-md border-white/10 bg-white/14 text-[11px] text-white backdrop-blur">
                                                {tag}
                                            </Tag>
                                        ))}
                                    </div>
                                    <h3 className="text-sm font-semibold">{item.title}</h3>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/76">{item.prompt}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                ) : null}
                {!promptLoading && !promptShowcase.length ? (
                    <div className="studio-surface flex min-h-64 flex-col items-center justify-center rounded-2xl text-center">
                        <FileText className="mb-4 size-10 text-muted-foreground" />
                        <h3 className="text-lg font-semibold">暂无可展示提示词</h3>
                        <p className="mt-2 text-sm text-muted-foreground">提示词库加载完成后，这里会展示可复用的创作样例。</p>
                    </div>
                ) : null}
            </section>

            <Image.PreviewGroup
                preview={{
                    open: previewOpen,
                    current: previewIndex,
                    onOpenChange: setPreviewOpen,
                    onChange: setPreviewIndex,
                }}
            >
                <div className="hidden">
                    {previewItems.map((item) => (
                        <Image key={item.id} src={item.coverUrl} alt={item.title} />
                    ))}
                </div>
            </Image.PreviewGroup>
        </main>
    );
}

function ProductPreviewPanel() {
    return (
        <div className="studio-surface relative overflow-hidden rounded-2xl p-4 sm:p-5">
            <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(34,211,238,.08),transparent)]" />
            <div className="relative rounded-xl border border-border bg-background/72 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold">无限画布 1</div>
                        <div className="mt-1 text-xs text-muted-foreground">节点、参考和结果在同一空间推进</div>
                    </div>
                    <Tag className="m-0 rounded-md border-cyan-400/25 bg-cyan-400/10 text-cyan-700 dark:text-cyan-200">Studio OS</Tag>
                </div>
                <div className="grid gap-3">
                    <PreviewNode icon={WandSparkles} title="生成配置" description="提示词 + 参考图 + 模型参数" active />
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <PreviewNode icon={Layers3} title="参考图组" description="主体 / 风格 / 构图" />
                        <div className="h-px w-8 bg-cyan-400/60" />
                        <PreviewNode icon={ImageIcon} title="结果组" description="保存、复用、下载" />
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                    {["1:1", "3 张", "自动"].map((item) => (
                        <div key={item} className="rounded-lg border border-border bg-card/70 px-3 py-2 text-center font-mono text-xs text-muted-foreground">
                            {item}
                        </div>
                    ))}
                </div>
            </div>
            <div className="relative mt-3 grid grid-cols-3 gap-3">
                {["提示词", "参考", "生成"].map((item, index) => (
                    <div key={item} className="rounded-xl border border-border bg-card/62 p-3">
                        <div className="mb-3 flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">{item}</span>
                            <span className="size-1.5 rounded-full bg-cyan-400" style={{ opacity: 0.5 + index * 0.2 }} />
                        </div>
                        <div className="h-12 rounded-lg bg-accent/60" />
                    </div>
                ))}
            </div>
        </div>
    );
}

function PreviewNode({ icon: Icon, title, description, active = false }: { icon: typeof ImageIcon; title: string; description: string; active?: boolean }) {
    return (
        <div className={cn("rounded-xl border bg-card/78 p-3", active ? "border-cyan-400/60 shadow-[0_0_0_1px_rgba(34,211,238,.12)]" : "border-border")}>
            <div className="flex items-start gap-3">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", active ? "bg-cyan-400/16 text-cyan-700 dark:text-cyan-200" : "bg-accent text-muted-foreground")}>
                    <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{description}</span>
                </span>
            </div>
        </div>
    );
}

function PromptCoverFallback({ title }: { title: string }) {
    return (
        <div className="flex h-full w-full flex-col justify-between bg-[linear-gradient(135deg,rgba(34,211,238,.18),rgba(15,23,42,.04))] p-4 dark:bg-[linear-gradient(135deg,rgba(34,211,238,.16),rgba(15,23,42,.72))]">
            <div className="grid size-11 place-items-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-700 dark:text-cyan-200">
                <ImageIcon className="size-5" />
            </div>
            <div>
                <div className="mb-3 h-px w-full bg-cyan-400/25" />
                <div className="text-xs font-medium text-muted-foreground">未设置封面</div>
                <div className="mt-1 line-clamp-2 text-sm font-semibold">{title}</div>
            </div>
        </div>
    );
}

function PromptShowcaseSkeleton() {
    return (
        <div className="grid auto-rows-[210px] gap-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className={cn("overflow-hidden rounded-xl border border-border bg-card", getPromptShowcaseLayoutClass(index))}>
                    <div className="h-full w-full animate-pulse bg-accent" />
                </div>
            ))}
        </div>
    );
}
