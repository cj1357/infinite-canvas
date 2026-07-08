"use client";

import { Copy, FolderPlus, Image as ImageIcon } from "lucide-react";
import { Button, Modal, Space, Tag } from "antd";

import { formatPromptDate, type Prompt } from "@/services/api/prompts";

export function PromptDetailDialog({ prompt, onClose, onCopy, onSaveAsset }: { prompt: Prompt | null; onClose: () => void; onCopy: (prompt: string) => void; onSaveAsset?: (prompt: Prompt) => void }) {
    const coverUrl = prompt?.coverUrl.trim();

    return (
        <>
            <Modal title={prompt?.title} open={Boolean(prompt)} onCancel={onClose} footer={null} width={860}>
                {prompt ? (
                    <>
                        <div className="grid gap-5 md:grid-cols-[300px_minmax(0,1fr)]">
                            <div className="space-y-3">
                                {coverUrl ? <img src={coverUrl} alt={prompt.title} className="aspect-[4/3] w-full rounded-lg object-cover" /> : <PromptCoverFallback title={prompt.title} />}
                                {prompt.preview ? <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-stone-100 p-3 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">{prompt.preview}</pre> : null}
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap gap-1.5">
                                    {prompt.tags.map((tag) => (
                                        <Tag key={tag} className="m-0">
                                            {tag}
                                        </Tag>
                                    ))}
                                </div>
                                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-stone-800 dark:text-stone-300">{prompt.prompt}</p>
                                <div className="mt-4 text-xs text-stone-500 dark:text-stone-400">
                                    创建：{formatPromptDate(prompt.createdAt)} · 更新：{formatPromptDate(prompt.updatedAt)}
                                </div>
                                <Space wrap className="mt-5">
                                    <Button type="primary" icon={<Copy className="size-4" />} onClick={() => onCopy(prompt.prompt)}>
                                        复制提示词
                                    </Button>
                                    {onSaveAsset ? (
                                        <Button icon={<FolderPlus className="size-4" />} onClick={() => onSaveAsset(prompt)}>
                                            加入我的素材
                                        </Button>
                                    ) : null}
                                </Space>
                            </div>
                        </div>
                    </>
                ) : null}
            </Modal>
        </>
    );
}

function PromptCoverFallback({ title }: { title: string }) {
    return (
        <div className="flex aspect-[4/3] w-full flex-col justify-between rounded-lg bg-stone-100 p-4 text-stone-500 dark:bg-stone-900 dark:text-stone-400">
            <div className="grid size-10 place-items-center rounded-lg border border-stone-200 bg-white/70 dark:border-stone-800 dark:bg-stone-950/70">
                <ImageIcon className="size-5" />
            </div>
            <div>
                <div className="text-xs">未设置封面</div>
                <div className="mt-1 line-clamp-2 text-sm font-semibold text-stone-800 dark:text-stone-200">{title}</div>
            </div>
        </div>
    );
}
