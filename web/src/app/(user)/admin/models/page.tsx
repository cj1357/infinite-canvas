"use client";

import { useEffect, useState } from "react";
import { App, Button, Form, Input, InputNumber, Modal, Space, Switch, Table, Tag } from "antd";
import type { TableProps } from "antd";
import { Edit3, Plus, RefreshCcw } from "lucide-react";

import { useI18n } from "@/i18n/use-i18n";
import { listModelCapabilities, saveModelCapability, type ModelCapability } from "@/services/api/admin-config";

type ModelCapabilityForm = Omit<ModelCapability, "displayNameJson" | "supportedRatiosJson" | "supportedResolutionsJson" | "recommendedRolesJson" | "metadataJson"> & {
    displayNameJson: string;
    supportedRatiosJson: string;
    supportedResolutionsJson: string;
    recommendedRolesJson: string;
    metadataJson: string;
};

export default function AdminModelsPage() {
    const { message } = App.useApp();
    const { t } = useI18n();
    const [form] = Form.useForm<ModelCapabilityForm>();
    const [items, setItems] = useState<ModelCapability[]>([]);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState<ModelCapability | null>(null);

    async function loadItems() {
        setLoading(true);
        try {
            const result = await listModelCapabilities();
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

    function openEditor(item?: ModelCapability) {
        const value = item || defaultCapability();
        setEditing(value);
        form.setFieldsValue({
            ...value,
            displayNameJson: jsonText(value.displayNameJson, "{}"),
            supportedRatiosJson: jsonText(value.supportedRatiosJson, "[]"),
            supportedResolutionsJson: jsonText(value.supportedResolutionsJson, "[]"),
            recommendedRolesJson: jsonText(value.recommendedRolesJson, "[]"),
            metadataJson: jsonText(value.metadataJson, "{}"),
        });
    }

    async function submit(values: ModelCapabilityForm) {
        setLoading(true);
        try {
            await saveModelCapability({
                ...values,
                id: editing?.id,
                displayNameJson: parseJSON(values.displayNameJson, {}),
                supportedRatiosJson: parseJSON(values.supportedRatiosJson, []),
                supportedResolutionsJson: parseJSON(values.supportedResolutionsJson, []),
                recommendedRolesJson: parseJSON(values.recommendedRolesJson, []),
                metadataJson: parseJSON(values.metadataJson, {}),
            });
            setEditing(null);
            await loadItems();
            message.success(t("common.save"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("error.default"));
        } finally {
            setLoading(false);
        }
    }

    const columns: TableProps<ModelCapability>["columns"] = [
        { title: t("common.model"), dataIndex: "model" },
        { title: t("common.ability"), dataIndex: "ability" },
        { title: t("admin.models.family"), dataIndex: "modelFamily" },
        { title: t("admin.models.maxReferences"), dataIndex: "maxReferences", width: 120 },
        { title: t("admin.models.maxOutputs"), dataIndex: "maxOutputs", width: 110 },
        {
            title: t("common.status"),
            dataIndex: "enabled",
            width: 110,
            render: (enabled: boolean) => <Tag color={enabled ? "green" : "default"}>{enabled ? t("common.enabled") : t("common.disabled")}</Tag>,
        },
        {
            title: "",
            width: 90,
            render: (_: unknown, item: ModelCapability) => (
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
                        <h1 className="text-2xl font-semibold">{t("admin.models.title")}</h1>
                        <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">{t("admin.models.description")}</p>
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

            <Modal title={editing?.id ? t("common.edit") : t("common.create")} open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={loading} destroyOnHidden>
                <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
                    <Form.Item label={t("common.model")} name="model" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item label={t("common.ability")} name="ability" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item label={t("admin.models.family")} name="modelFamily">
                        <Input />
                    </Form.Item>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Form.Item label={t("admin.models.maxReferences")} name="maxReferences">
                            <InputNumber min={0} className="w-full" />
                        </Form.Item>
                        <Form.Item label={t("admin.models.maxOutputs")} name="maxOutputs">
                            <InputNumber min={1} className="w-full" />
                        </Form.Item>
                    </div>
                    <Form.Item label={t("admin.models.ratios")} name="supportedRatiosJson">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                    <Form.Item label={t("admin.models.resolutions")} name="supportedResolutionsJson">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                    <Form.Item label={t("admin.models.roles")} name="recommendedRolesJson">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                    <Form.Item label={t("common.status")} name="enabled" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </main>
    );
}

function defaultCapability(): ModelCapability {
    return {
        model: "default",
        ability: "image",
        modelFamily: "generic",
        maxReferences: 4,
        maxOutputs: 4,
        supportsStreaming: false,
        supportsSeed: false,
        supportsMask: false,
        supportsCropReference: false,
        supportsTransparentBackground: false,
        enabled: true,
        displayNameJson: {},
        supportedRatiosJson: ["1:1", "3:4", "4:3"],
        supportedResolutionsJson: ["1024x1024"],
        recommendedRolesJson: ["subject", "style", "composition", "element"],
        metadataJson: {},
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
