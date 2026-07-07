"use client";

import { useEffect, useState } from "react";
import { App, Button, Form, Input, InputNumber, Modal, Space, Switch, Table, Tag } from "antd";
import type { TableProps } from "antd";
import { Edit3, Plus, RefreshCcw } from "lucide-react";

import { useI18n } from "@/i18n/use-i18n";
import { listModelRateRules, saveModelRateRule, type ModelRateRule } from "@/services/api/admin-config";

type RateRuleForm = Omit<ModelRateRule, "resolutionMultiplierJson" | "qualityMultiplierJson" | "paramsJson"> & {
    resolutionMultiplierJson: string;
    qualityMultiplierJson: string;
    paramsJson: string;
};

export default function AdminRatesPage() {
    const { message } = App.useApp();
    const { t } = useI18n();
    const [form] = Form.useForm<RateRuleForm>();
    const [items, setItems] = useState<ModelRateRule[]>([]);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState<ModelRateRule | null>(null);

    async function loadItems() {
        setLoading(true);
        try {
            const result = await listModelRateRules();
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

    function openEditor(item?: ModelRateRule) {
        const value = item || defaultRule();
        setEditing(value);
        form.setFieldsValue({
            ...value,
            resolutionMultiplierJson: jsonText(value.resolutionMultiplierJson, "{}"),
            qualityMultiplierJson: jsonText(value.qualityMultiplierJson, "{}"),
            paramsJson: jsonText(value.paramsJson, "{}"),
        });
    }

    async function submit(values: RateRuleForm) {
        setLoading(true);
        try {
            await saveModelRateRule({
                ...values,
                id: editing?.id,
                resolutionMultiplierJson: parseJSON(values.resolutionMultiplierJson, {}),
                qualityMultiplierJson: parseJSON(values.qualityMultiplierJson, {}),
                paramsJson: parseJSON(values.paramsJson, {}),
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

    const columns: TableProps<ModelRateRule>["columns"] = [
        { title: t("common.ability"), dataIndex: "ability" },
        { title: t("common.model"), dataIndex: "model" },
        { title: t("admin.rates.baseCredits"), dataIndex: "baseCredits", width: 120 },
        { title: t("admin.rates.perOutputCredits"), dataIndex: "perOutputCredits", width: 130 },
        { title: t("admin.rates.perReferenceCredits"), dataIndex: "perReferenceCredits", width: 140 },
        {
            title: t("common.status"),
            dataIndex: "enabled",
            width: 110,
            render: (enabled: boolean) => <Tag color={enabled ? "green" : "default"}>{enabled ? t("common.enabled") : t("common.disabled")}</Tag>,
        },
        {
            title: "",
            width: 90,
            render: (_: unknown, item: ModelRateRule) => (
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
                        <h1 className="text-2xl font-semibold">{t("admin.rates.title")}</h1>
                        <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">{t("admin.rates.description")}</p>
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
                    <Form.Item label={t("common.ability")} name="ability" rules={[{ required: true }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item label={t("common.model")} name="model">
                        <Input />
                    </Form.Item>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Form.Item label={t("admin.rates.baseCredits")} name="baseCredits">
                            <InputNumber min={0} className="w-full" />
                        </Form.Item>
                        <Form.Item label={t("admin.rates.perOutputCredits")} name="perOutputCredits">
                            <InputNumber min={0} className="w-full" />
                        </Form.Item>
                        <Form.Item label={t("admin.rates.perReferenceCredits")} name="perReferenceCredits">
                            <InputNumber min={0} className="w-full" />
                        </Form.Item>
                    </div>
                    <Form.Item label={t("admin.rates.resolutionMultiplier")} name="resolutionMultiplierJson">
                        <Input.TextArea rows={3} />
                    </Form.Item>
                    <Form.Item label={t("admin.rates.qualityMultiplier")} name="qualityMultiplierJson">
                        <Input.TextArea rows={3} />
                    </Form.Item>
                    <Form.Item label={t("common.notes")} name="notes">
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

function defaultRule(): ModelRateRule {
    return {
        ability: "image_generation",
        model: "",
        baseCredits: 1,
        unitCredits: 0,
        unitParam: "",
        perOutputCredits: 10,
        perReferenceCredits: 1,
        resolutionMultiplierJson: {},
        qualityMultiplierJson: {},
        enabled: true,
        notes: "",
        paramsJson: {},
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
