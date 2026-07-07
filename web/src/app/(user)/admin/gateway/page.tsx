"use client";

import { useEffect, useState } from "react";
import { Alert, App, Button, Form, Input, InputNumber, Select, Space, Switch, Tag, Typography } from "antd";
import { RefreshCcw, Save, Wifi } from "lucide-react";

import { useI18n } from "@/i18n/use-i18n";
import { getModelGatewaySettings, saveModelGatewaySettings, testModelGatewaySettings, type ModelGatewayInput, type ModelGatewaySettings, type ModelGatewayTestResult } from "@/services/api/admin-config";

const providerOptions = [{ label: "NewAPI", value: "newapi" }];

export default function AdminGatewayPage() {
    const { message } = App.useApp();
    const { t } = useI18n();
    const [form] = Form.useForm<ModelGatewayInput>();
    const [settings, setSettings] = useState<ModelGatewaySettings | null>(null);
    const [testResult, setTestResult] = useState<ModelGatewayTestResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);

    async function loadSettings() {
        setLoading(true);
        try {
            const result = await getModelGatewaySettings();
            setSettings(result);
            form.setFieldsValue({
                provider: result.provider || "newapi",
                baseUrl: result.baseUrl,
                internalUrl: result.internalUrl,
                timeoutSeconds: result.timeoutSeconds || 600,
                enabled: result.enabled,
            });
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("error.default"));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadSettings();
    }, []);

    async function saveSettings(values: ModelGatewayInput) {
        setLoading(true);
        try {
            const result = await saveModelGatewaySettings({ ...values, provider: values.provider || "newapi" });
            setSettings(result);
            form.setFieldValue("token", "");
            message.success(t("admin.gateway.saveSuccess"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("error.default"));
        } finally {
            setLoading(false);
        }
    }

    async function testGateway() {
        setTesting(true);
        try {
            const result = await testModelGatewaySettings();
            setTestResult(result);
            message[result.ok ? "success" : "error"](t(result.ok ? "admin.gateway.testSuccess" : "admin.gateway.testFailed"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("error.default"));
        } finally {
            setTesting(false);
        }
    }

    return (
        <main className="h-full overflow-y-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6 dark:border-stone-800">
                    <div>
                        <h1 className="text-2xl font-semibold">{t("admin.gateway.title")}</h1>
                        <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">{t("admin.gateway.description")}</p>
                    </div>
                    <Space wrap>
                        <Button icon={<RefreshCcw className="size-4" />} onClick={loadSettings} loading={loading}>
                            {t("common.refresh")}
                        </Button>
                        <Button icon={<Wifi className="size-4" />} onClick={testGateway} loading={testing}>
                            {t("admin.gateway.testConnection")}
                        </Button>
                    </Space>
                </header>

                <section className="grid gap-6 lg:grid-cols-[1fr_220px]">
                    <div className="border border-stone-200 p-5 dark:border-stone-800">
                        <Form form={form} layout="vertical" onFinish={saveSettings} initialValues={{ provider: "newapi", enabled: true, timeoutSeconds: 600 }}>
                            <Form.Item label={t("admin.gateway.provider")} name="provider">
                                <Select options={providerOptions} />
                            </Form.Item>
                            <Form.Item label={t("admin.gateway.baseUrl")} name="baseUrl">
                                <Input />
                            </Form.Item>
                            <Form.Item label={t("admin.gateway.internalUrl")} name="internalUrl" extra={t("admin.gateway.internalUrlHelp")}>
                                <Input />
                            </Form.Item>
                            <Form.Item label={t("admin.gateway.token")} name="token" extra={t("admin.gateway.tokenHelp")}>
                                <Input.Password autoComplete="new-password" />
                            </Form.Item>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Form.Item label={t("admin.gateway.timeoutSeconds")} name="timeoutSeconds">
                                    <InputNumber min={5} max={3600} className="w-full" />
                                </Form.Item>
                                <Form.Item label={t("common.status")} name="enabled" valuePropName="checked">
                                    <Switch checkedChildren={t("common.enabled")} unCheckedChildren={t("common.disabled")} />
                                </Form.Item>
                            </div>
                            <Button type="primary" htmlType="submit" icon={<Save className="size-4" />} loading={loading}>
                                {t("common.save")}
                            </Button>
                        </Form>
                    </div>

                    <aside className="border border-stone-200 p-5 dark:border-stone-800">
                        <Typography.Text type="secondary">{t("common.status")}</Typography.Text>
                        <div className="mt-3 flex flex-col gap-3">
                            <Tag color={settings?.enabled ? "green" : "default"} className="mr-0 w-fit">
                                {settings?.enabled ? t("common.enabled") : t("common.disabled")}
                            </Tag>
                            <Tag color={settings?.hasToken ? "blue" : "red"} className="mr-0 w-fit">
                                {settings?.hasToken ? t("admin.gateway.hasToken") : t("admin.gateway.noToken")}
                            </Tag>
                        </div>
                        {testResult ? (
                            <Alert className="mt-5" type={testResult.ok ? "success" : "error"} showIcon title={t(testResult.ok ? "admin.gateway.testSuccess" : "admin.gateway.testFailed")} description={testResult.message || `${testResult.status}`} />
                        ) : null}
                    </aside>
                </section>
            </div>
        </main>
    );
}
