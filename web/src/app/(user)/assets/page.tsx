"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Empty, Form, Image, Input, InputNumber, Modal, Pagination, Select, Switch, Tag } from "antd";
import { Heart, Image as ImageIcon, RefreshCw, Search, Star, Trash2, Upload } from "lucide-react";

import { createCreativeAsset, deleteCreativeAsset, listCreativeAssets, mediaObjectUrl, updateCreativeAsset, uploadMediaObject, type CreativeAsset } from "@/services/api/creative";

type AssetFormValues = {
    title: string;
    description?: string;
    tagsJson?: string[];
    favorite?: boolean;
    rating?: number;
};

const kindOptions = [
    { label: "全部", value: "all" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
];

export default function AssetsPage() {
    const { message } = App.useApp();
    const [form] = Form.useForm<AssetFormValues>();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [items, setItems] = useState<CreativeAsset[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [keyword, setKeyword] = useState("");
    const [kind, setKind] = useState("all");
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState<CreativeAsset | null>(null);
    const [preview, setPreview] = useState<CreativeAsset | null>(null);
    const [deleting, setDeleting] = useState<CreativeAsset | null>(null);
    const filteredItems = useMemo(() => (kind === "all" ? items : items.filter((item) => item.kind === kind)), [items, kind]);

    const load = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), keyword });
            const result = await listCreativeAssets(params);
            setItems(result.items);
            setTotal(result.total);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材加载失败");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, [page, pageSize]);

    const search = () => {
        setPage(1);
        void load();
    };

    const uploadAsset = async (file?: File) => {
        if (!file) return;
        setLoading(true);
        try {
            const media = await uploadMediaObject(file);
            await createCreativeAsset({
                mediaObjectId: media.id,
                kind: media.kind || "image",
                title: file.name,
                tagsJson: [],
                favorite: false,
                rating: 0,
                metadataJson: { source: "asset-page" },
            });
            message.success("素材已上传");
            await load();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材上传失败");
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const openEdit = (asset: CreativeAsset) => {
        setEditing(asset);
        form.setFieldsValue({
            title: asset.title,
            description: asset.description,
            tagsJson: asset.tagsJson || [],
            favorite: asset.favorite,
            rating: asset.rating,
        });
    };

    const saveEdit = async () => {
        if (!editing) return;
        const values = await form.validateFields();
        await updateCreativeAsset(editing.id, { ...editing, ...values });
        message.success("素材已更新");
        setEditing(null);
        await load();
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        await deleteCreativeAsset(deleting.id);
        message.success("素材已删除");
        setDeleting(null);
        await load();
    };

    return (
        <main className="h-full overflow-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5 dark:border-stone-800">
                    <div>
                        <p className="text-xs text-stone-500">云端素材库</p>
                        <h1 className="mt-2 text-3xl font-semibold">我的素材</h1>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Input.Search className="w-72" allowClear prefix={<Search className="size-4 text-stone-400" />} value={keyword} placeholder="搜索标题、描述或类型" onChange={(event) => setKeyword(event.target.value)} onSearch={search} />
                        <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void load()}>
                            刷新
                        </Button>
                        <Button type="primary" icon={<Upload className="size-4" />} onClick={() => fileInputRef.current?.click()}>
                            上传素材
                        </Button>
                    </div>
                </header>

                <div className="flex flex-wrap gap-2">
                    {kindOptions.map((option) => (
                        <Tag.CheckableTag key={option.value} checked={kind === option.value} onChange={() => setKind(option.value)} className={kind === option.value ? "border-stone-950 bg-stone-950 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950" : ""}>
                            {option.label}
                        </Tag.CheckableTag>
                    ))}
                </div>

                {filteredItems.length ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {filteredItems.map((asset) => (
                            <AssetCard key={asset.id} asset={asset} onOpen={() => setPreview(asset)} onEdit={() => openEdit(asset)} onDelete={() => setDeleting(asset)} />
                        ))}
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={loading ? "加载中" : "暂无素材"} className="py-20" />
                )}

                <div className="flex justify-center">
                    <Pagination current={page} pageSize={pageSize} total={total} showSizeChanger onChange={(nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); }} />
                </div>
            </div>

            <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={(event) => void uploadAsset(event.target.files?.[0])} />

            <Modal title="编辑素材" open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => void saveEdit()} okText="保存" cancelText="取消" destroyOnHidden>
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="description" label="描述">
                        <Input.TextArea rows={3} />
                    </Form.Item>
                    <Form.Item name="tagsJson" label="标签">
                        <Select mode="tags" tokenSeparators={[",", "，"]} />
                    </Form.Item>
                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="favorite" label="收藏" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                        <Form.Item name="rating" label="评分">
                            <InputNumber min={0} max={5} className="w-full" />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>

            <Modal title="素材预览" open={Boolean(preview)} footer={null} onCancel={() => setPreview(null)} width={760}>
                {preview ? <AssetPreview asset={preview} /> : null}
            </Modal>

            <Modal title="删除素材" open={Boolean(deleting)} onCancel={() => setDeleting(null)} onOk={() => void confirmDelete()} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除「{deleting?.title}」吗？
            </Modal>
        </main>
    );
}

function AssetCard({ asset, onOpen, onEdit, onDelete }: { asset: CreativeAsset; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
    return (
        <article className="overflow-hidden rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
            <button type="button" className="block w-full text-left" onClick={onOpen}>
                <AssetThumb asset={asset} className="aspect-[4/3] w-full" />
                <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                        <h2 className="line-clamp-1 text-sm font-semibold">{asset.title}</h2>
                        <Tag className="m-0 shrink-0 text-[11px]">{kindLabel(asset.kind)}</Tag>
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-stone-500">{asset.description || "无描述"}</p>
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-stone-500">
                        <span className="inline-flex items-center gap-1">
                            <Heart className={`size-3.5 ${asset.favorite ? "fill-current text-rose-500" : ""}`} />
                            {asset.usageCount || 0}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <Star className="size-3.5" />
                            {asset.rating || 0}
                        </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                        {(asset.tagsJson || []).slice(0, 3).map((tag) => (
                            <Tag key={tag} className="m-0 text-[11px]">
                                {tag}
                            </Tag>
                        ))}
                    </div>
                </div>
            </button>
            <div className="flex gap-2 px-4 pb-4">
                <Button size="small" onClick={onEdit}>
                    编辑
                </Button>
                <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={onDelete}>
                    删除
                </Button>
            </div>
        </article>
    );
}

function AssetPreview({ asset }: { asset: CreativeAsset }) {
    return (
        <div className="space-y-4">
            <AssetThumb asset={asset} className="max-h-[520px] w-full rounded-lg" />
            <div>
                <h2 className="text-lg font-semibold">{asset.title}</h2>
                <p className="mt-2 text-sm text-stone-500">{asset.description || "无描述"}</p>
            </div>
        </div>
    );
}

function AssetThumb({ asset, className }: { asset: CreativeAsset; className: string }) {
    const src = asset.mediaObjectId ? mediaObjectUrl(asset.mediaObjectId) : "";
    if (!src) {
        return (
            <div className={`grid place-items-center bg-stone-100 text-stone-400 dark:bg-stone-900 ${className}`}>
                <ImageIcon className="size-8" />
            </div>
        );
    }
    if (asset.kind === "video") return <video src={src} className={`bg-black object-cover ${className}`} controls />;
    if (asset.kind === "audio") return <audio src={src} className="w-full" controls />;
    return <Image src={src} alt={asset.title} className={className} preview={false} />;
}

function kindLabel(kind: string) {
    if (kind === "video") return "视频";
    if (kind === "audio") return "音频";
    return "图片";
}
