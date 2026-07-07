"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Input, Popconfirm, Space, Table, Tabs, Tag, Typography } from "antd";
import type { TableProps } from "antd";
import { RefreshCcw, RotateCcw, Search, Undo2 } from "lucide-react";

import { useI18n } from "@/i18n/use-i18n";
import {
    listAdminGenerationJobs,
    listAdminGenerationRuns,
    refundAdminGenerationRun,
    retryAdminGenerationRun,
    type AdminGenerationJob,
    type AdminGenerationRun,
} from "@/services/api/admin-config";

export default function AdminGenerationsPage() {
    const { message } = App.useApp();
    const { t } = useI18n();
    const [runs, setRuns] = useState<AdminGenerationRun[]>([]);
    const [jobs, setJobs] = useState<AdminGenerationJob[]>([]);
    const [keyword, setKeyword] = useState("");
    const [loading, setLoading] = useState(false);
    const [actingId, setActingId] = useState("");

    async function loadItems(nextKeyword = keyword) {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: "1", pageSize: "50", keyword: nextKeyword });
            const [runResult, jobResult] = await Promise.all([listAdminGenerationRuns(params), listAdminGenerationJobs(params)]);
            setRuns(runResult.items);
            setJobs(jobResult.items);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("error.default"));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadItems("");
    }, []);

    async function retryRun(run: AdminGenerationRun) {
        setActingId(run.id);
        try {
            await retryAdminGenerationRun(run.id);
            message.success(t("admin.generations.retrySuccess"));
            await loadItems();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("error.default"));
        } finally {
            setActingId("");
        }
    }

    async function refundRun(run: AdminGenerationRun) {
        setActingId(run.id);
        try {
            await refundAdminGenerationRun(run.id);
            message.success(t("admin.generations.refundSuccess"));
            await loadItems();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("error.default"));
        } finally {
            setActingId("");
        }
    }

    const runColumns = useMemo<TableProps<AdminGenerationRun>["columns"]>(
        () => [
            {
                title: "Run ID",
                dataIndex: "id",
                width: 180,
                render: (id: string) => <Typography.Text copyable={{ text: id }}>{shortId(id)}</Typography.Text>,
            },
            { title: t("admin.generations.user"), dataIndex: "userId", width: 180, render: (id: string) => shortId(id) },
            { title: t("common.status"), dataIndex: "status", width: 110, render: (status: string) => <StatusTag status={status} /> },
            { title: t("common.model"), dataIndex: "model", width: 180, render: (model: string, run) => model || run.gatewayModel || "-" },
            {
                title: t("admin.generations.credits"),
                width: 120,
                render: (_: unknown, run) => `${run.settledCredits || 0} / ${run.reservedCredits || 0}`,
            },
            {
                title: t("admin.generations.gatewayRequest"),
                dataIndex: "gatewayRequestId",
                width: 180,
                render: (id: string) => (id ? <Typography.Text copyable={{ text: id }}>{shortId(id)}</Typography.Text> : "-"),
            },
            { title: t("generation.node.prompt"), dataIndex: "prompt", ellipsis: true },
            { title: t("admin.generations.createdAt"), dataIndex: "createdAt", width: 170, render: formatTime },
            {
                title: "",
                width: 170,
                render: (_: unknown, run) => (
                    <Space size={4}>
                        <Button size="small" icon={<RotateCcw className="size-3.5" />} loading={actingId === run.id} disabled={!canRetry(run.status)} onClick={() => void retryRun(run)}>
                            {t("common.retry")}
                        </Button>
                        <Popconfirm title={t("admin.generations.refundConfirm")} okText={t("common.confirm")} cancelText={t("common.cancel")} onConfirm={() => void refundRun(run)}>
                            <Button size="small" danger icon={<Undo2 className="size-3.5" />} loading={actingId === run.id} disabled={run.status === "succeeded"}>
                                {t("admin.generations.refund")}
                            </Button>
                        </Popconfirm>
                    </Space>
                ),
            },
        ],
        [actingId, t],
    );

    const jobColumns = useMemo<TableProps<AdminGenerationJob>["columns"]>(
        () => [
            {
                title: "Job ID",
                dataIndex: "id",
                width: 180,
                render: (id: string) => <Typography.Text copyable={{ text: id }}>{shortId(id)}</Typography.Text>,
            },
            {
                title: "Run ID",
                dataIndex: "generationRunId",
                width: 180,
                render: (id: string) => <Typography.Text copyable={{ text: id }}>{shortId(id)}</Typography.Text>,
            },
            { title: t("common.status"), dataIndex: "status", width: 110, render: (status: string) => <StatusTag status={status} /> },
            { title: t("common.ability"), dataIndex: "ability", width: 160 },
            {
                title: t("admin.generations.attempt"),
                width: 110,
                render: (_: unknown, job) => `${job.attempt || 0} / ${job.maxAttempts || 0}`,
            },
            { title: t("admin.generations.errorKey"), dataIndex: "errorKey", width: 180, ellipsis: true },
            { title: t("admin.generations.errorMessage"), dataIndex: "errorMessage", ellipsis: true },
            { title: t("admin.generations.createdAt"), dataIndex: "createdAt", width: 170, render: formatTime },
        ],
        [t],
    );

    return (
        <main className="h-full overflow-y-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6 dark:border-stone-800">
                    <div>
                        <h1 className="text-2xl font-semibold">{t("admin.generations.title")}</h1>
                        <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">{t("admin.generations.description")}</p>
                    </div>
                    <Space wrap>
                        <Input.Search
                            className="w-72"
                            allowClear
                            prefix={<Search className="size-4 text-stone-400" />}
                            value={keyword}
                            placeholder={t("admin.generations.searchPlaceholder")}
                            onChange={(event) => setKeyword(event.target.value)}
                            onSearch={(value) => void loadItems(value)}
                        />
                        <Button icon={<RefreshCcw className="size-4" />} onClick={() => void loadItems()} loading={loading}>
                            {t("common.refresh")}
                        </Button>
                    </Space>
                </header>

                <Tabs
                    items={[
                        {
                            key: "runs",
                            label: t("admin.generations.runs"),
                            children: <Table rowKey="id" columns={runColumns} dataSource={runs} loading={loading} pagination={{ pageSize: 20 }} scroll={{ x: 1320 }} />,
                        },
                        {
                            key: "jobs",
                            label: t("admin.generations.jobs"),
                            children: <Table rowKey="id" columns={jobColumns} dataSource={jobs} loading={loading} pagination={{ pageSize: 20 }} scroll={{ x: 1120 }} />,
                        },
                    ]}
                />
            </div>
        </main>
    );
}

function StatusTag({ status }: { status: string }) {
    return <Tag color={statusColor(status)}>{status || "-"}</Tag>;
}

function statusColor(status: string) {
    if (status === "succeeded") return "green";
    if (status === "failed" || status === "canceled") return "red";
    if (status === "running") return "blue";
    if (status === "queued" || status === "retrying") return "gold";
    return "default";
}

function canRetry(status: string) {
    return status === "failed" || status === "canceled";
}

function shortId(id: string) {
    return id ? `${id.slice(0, 8)}...` : "-";
}

function formatTime(value?: string) {
    if (!value) return "-";
    return new Date(value).toLocaleString();
}
