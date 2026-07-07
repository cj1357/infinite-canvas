"use client";

import { useEffect, useState } from "react";
import { Alert, App, Button, Form, Input, InputNumber, Modal, Space, Switch, Table, Tag } from "antd";
import type { TableProps } from "antd";
import { Edit3, Eye, Plus, RefreshCcw } from "lucide-react";

import { useI18n } from "@/i18n/use-i18n";
import { listPromptTemplates, previewPromptTemplate, savePromptTemplate, type PromptTemplate } from "@/services/api/admin-config";

type PromptTemplateForm = Omit<PromptTemplate, "variablesJson"> & {
    variablesJson: string;
};

export default function AdminPromptsPage() {
    const { message } = App.useApp();
    const { t } = useI18n();
    const [form] = Form.useForm<PromptTemplateForm>();
    const [items, setItems] = useState<PromptTemplate[]>([]);
    const [preview, setPreview] = useState("");
    const [loading, setLoading] = useState(false);
    const [previewing, setPreviewing] = useState(false);
    const [editing, setEditing] = useState<PromptTemplate | null>(null);

    async function loadItems() {
        setLoading(true);
        try {
            const result = await listPromptTemplates();
            setItems(result.items);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("error.default"));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadItems();
    }, []);

    function openEditor(item?: PromptTemplate) {
        const value = item || defaultTemplate();
        setEditing(value);
        setPreview("");
        form.setFieldsValue({ ...value, variablesJson: jsonText(value.variablesJson, "{}") });
    }

    async function submit(values: PromptTemplateForm) {
        setLoading(true);
        try {
            await savePromptTemplate({ ...values, id: editing?.id, variablesJson: parseJSON(values.variablesJson, {}) });
            setEditing(null);
            await loadItems();
            message.success(t("common.save"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("error.default"));
        } finally {
            setLoading(false);
        }
    }

    async function previewCurrent() {
        setPreviewing(true);
        try {
            const values = form.getFieldsValue();
            const result = await previewPromptTemplate({ content: values.content, variables: parseJSON(values.variablesJson, {}) as Record<string, unknown> });
            setPreview(result.content);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("error.default"));
        } finally {
            setPreviewing(false);
        }
    }

    const columns: TableProps<PromptTemplate>["columns"] = [
        { title: t("admin.prompts.locale"), dataIndex: "locale", width: 110 },
        { title: t("admin.prompts.templateKey"), dataIndex: "templateKey" },
        { title: t("common.ability"), dataIndex: "ability" },
        { title: t("admin.prompts.family"), dataIndex: "modelFamily" },
        { title: t("admin.prompts.version"), dataIndex: "version", width: 90 },
        {
            title: t("common.status"),
            dataIndex: "enabled",
            width: 110,
            render: (enabled: boolean) => <Tag color={enabled ? "green" : "default"}>{enabled ? t("common.enabled") : t("common.disabled")}</Tag>,
        },
        {
            title: "",
            width: 90,
            render: (_: unknown, item: PromptTemplate) => (
                <Button size="small" icon={<Edit3 className="size-4" />} onClick={() => openEditor(item)}>
                    {t("common.edit")}
                </Button>
            ),
        },
    ];

    return (
        <main className="h-full overflow-y-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6 dark:border-stone-800">
                    <div>
                        <h1 className="text-2xl font-semibold">{t("admin.prompts.title")}</h1>
                        <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">{t("admin.prompts.description")}</p>
                    </div>
                    <Space wrap>
                        <Button icon={<RefreshCcw className="size-4" />} onClick={loadItems} loading={loading}>
                            {t("common.refresh")}
                        </Button>
                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => openEditor()}>
                            {t("common.create")}
                        </Button>
                    </Space>
                </header>
                <Table rowKey="id" columns={columns} dataSource={items} loading={loading} pagination={{ pageSize: 20 }} />
            </div>

            <Modal width={860} title={editing?.id ? t("common.edit") : t("common.create")} open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={loading} destroyOnHidden>
                <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item label={t("admin.prompts.locale")} name="locale" rules={[{ required: true }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item label={t("admin.prompts.templateKey")} name="templateKey" rules={[{ required: true }]}>
                            <Input />
                        </Form.Item>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item label={t("common.ability")} name="ability" rules={[{ required: true }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item label={t("admin.prompts.family")} name="modelFamily">
                            <Input />
                        </Form.Item>
                    </div>
                    <Form.Item label={t("admin.prompts.templateTitle")} name="title">
                        <Input />
                    </Form.Item>
                    <Form.Item label={t("admin.prompts.content")} name="content" rules={[{ required: true }]}>
                        <Input.TextArea rows={8} />
                    </Form.Item>
                    <Form.Item label={t("admin.prompts.variables")} name="variablesJson">
                        <Input.TextArea rows={4} />
                    </Form.Item>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item label={t("admin.prompts.version")} name="version">
                            <InputNumber min={1} className="w-full" />
                        </Form.Item>
                        <Form.Item label={t("common.status")} name="enabled" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                    </div>
                    <Button icon={<Eye className="size-4" />} onClick={previewCurrent} loading={previewing}>
                        {t("common.preview")}
                    </Button>
                    {preview ? <Alert className="mt-4 whitespace-pre-wrap" type="info" title={t("admin.prompts.previewResult")} description={preview} /> : null}
                </Form>
            </Modal>
        </main>
    );
}

function defaultTemplate(): PromptTemplate {
    return {
        locale: "zh-CN",
        templateKey: "image.reference.default",
        ability: "image",
        modelFamily: "generic",
        title: "默认参考图模板",
        content: "{{.Prompt}}",
        variablesJson: { Prompt: "一张电影感人像" },
        version: 1,
        enabled: true,
    };
}

function jsonText(value: unknown, fallback: string) {
    if (value === undefined || value === null) return fallback;
    return JSON.stringify(value, null, 2);
}

function parseJSON(value: string, fallback: unknown) {
    if (!value) return fallback;
    return JSON.parse(value);
}
