"use client";

import { useEffect, useState } from "react";
import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag } from "antd";
import type { TableProps } from "antd";

import { adjustUserCredits, grantUserEntitlement, listAdminUsers, resetUserFiveHourWindow, resetUserPeriod } from "@/services/api/server";
import type { CloudUser } from "@/stores/use-user-store";

type ActionState = { type: "grant" | "adjust"; user: CloudUser } | null;

export default function AdminUsersPage() {
    const { message, modal } = App.useApp();
    const [users, setUsers] = useState<CloudUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [action, setAction] = useState<ActionState>(null);
    const [form] = Form.useForm();

    async function loadUsers() {
        setLoading(true);
        try {
            const result = await listAdminUsers();
            setUsers(result.items);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取用户失败");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadUsers();
    }, []);

    async function submitAction(values: Record<string, unknown>) {
        if (!action) return;
        setLoading(true);
        try {
            if (action.type === "grant") await grantUserEntitlement(action.user.id, values);
            else await adjustUserCredits(action.user.id, values);
            message.success("操作已保存");
            setAction(null);
            form.resetFields();
            await loadUsers();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "操作失败");
        } finally {
            setLoading(false);
        }
    }

    function confirmReset(user: CloudUser, type: "period" | "fiveHour") {
        modal.confirm({
            title: type === "period" ? "重置 7 天周期" : "清空 5 小时窗口",
            content: user.email,
            okText: "确认",
            cancelText: "取消",
            onOk: async () => {
                if (type === "period") await resetUserPeriod(user.id);
                else await resetUserFiveHourWindow(user.id);
                message.success("已重置");
            },
        });
    }

    const columns: TableProps<CloudUser>["columns"] = [
        { title: "邮箱", dataIndex: "email" },
        { title: "用户名", dataIndex: "username" },
        {
            title: "角色",
            dataIndex: "role",
            render: (role: CloudUser["role"]) => <Tag color={role === "admin" ? "gold" : "default"}>{role === "admin" ? "管理员" : "用户"}</Tag>,
        },
        {
            title: "状态",
            dataIndex: "status",
            render: (status: CloudUser["status"]) => <Tag color={status === "active" ? "green" : "red"}>{status === "active" ? "正常" : "禁用"}</Tag>,
        },
        {
            title: "操作",
            width: 360,
            render: (_, user) => (
                <Space wrap>
                    <Button size="small" onClick={() => setAction({ type: "grant", user })}>
                        开通
                    </Button>
                    <Button size="small" onClick={() => setAction({ type: "adjust", user })}>
                        调额度
                    </Button>
                    <Button size="small" onClick={() => confirmReset(user, "period")}>
                        重置周期
                    </Button>
                    <Button size="small" onClick={() => confirmReset(user, "fiveHour")}>
                        重置 5 小时
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <main className="h-full overflow-y-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6 dark:border-stone-800">
                    <div>
                        <h1 className="text-2xl font-semibold">用户后台</h1>
                        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">手动开通套餐、调整总余额，并重置 7 天周期或 5 小时窗口。</p>
                    </div>
                    <Button onClick={loadUsers} loading={loading}>
                        刷新
                    </Button>
                </header>
                <Table rowKey="id" columns={columns} dataSource={users} loading={loading} pagination={{ pageSize: 20 }} />
            </div>

            <Modal title={action?.type === "grant" ? "开通/续期套餐" : "调整总余额"} open={Boolean(action)} onCancel={() => setAction(null)} onOk={() => form.submit()} confirmLoading={loading} destroyOnHidden>
                <Form form={form} layout="vertical" onFinish={submitAction} preserve={false} initialValues={action?.type === "grant" ? { validDays: 30 } : { mode: "add" }}>
                    {action?.type === "grant" ? (
                        <>
                            <Form.Item label="套餐代码" name="planCode" rules={[{ required: true, message: "请输入套餐代码" }]}>
                                <Input placeholder="pro-monthly" />
                            </Form.Item>
                            <Form.Item label="赠送总额度" name="balanceGrant" rules={[{ required: true, message: "请输入额度" }]}>
                                <InputNumber min={0} className="w-full" />
                            </Form.Item>
                            <Form.Item label="5 小时限额" name="fiveHourLimit" rules={[{ required: true, message: "请输入限额" }]}>
                                <InputNumber min={0} className="w-full" />
                            </Form.Item>
                            <Form.Item label="7 天周期限额" name="periodLimit" rules={[{ required: true, message: "请输入限额" }]}>
                                <InputNumber min={0} className="w-full" />
                            </Form.Item>
                            <Form.Item label="有效天数" name="validDays" rules={[{ required: true, message: "请输入有效天数" }]}>
                                <InputNumber min={1} className="w-full" />
                            </Form.Item>
                            <Form.Item label="备注" name="note">
                                <Input.TextArea rows={3} />
                            </Form.Item>
                        </>
                    ) : (
                        <>
                            <Form.Item label="模式" name="mode">
                                <Select
                                    options={[
                                        { label: "增加", value: "add" },
                                        { label: "扣减", value: "subtract" },
                                        { label: "设为", value: "set" },
                                    ]}
                                />
                            </Form.Item>
                            <Form.Item label="额度" name="amount" rules={[{ required: true, message: "请输入额度" }]}>
                                <InputNumber min={0} className="w-full" />
                            </Form.Item>
                            <Form.Item label="备注" name="note">
                                <Input.TextArea rows={3} />
                            </Form.Item>
                        </>
                    )}
                </Form>
            </Modal>
        </main>
    );
}
