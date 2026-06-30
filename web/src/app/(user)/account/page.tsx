"use client";

import { useEffect, useState } from "react";
import { App, Button, Form, Input, Progress, Segmented, Space, Statistic } from "antd";
import { LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { fetchBillingSummary, fetchCloudUser, loginCloudUser, logoutCloudUser, registerCloudUser, type BillingSummary } from "@/services/api/server";
import { useUserStore } from "@/stores/use-user-store";

type LoginValues = { email: string; password: string };
type RegisterValues = LoginValues & { username?: string; displayName?: string };

export default function AccountPage() {
    const { message } = App.useApp();
    const user = useUserStore((state) => state.user);
    const [mode, setMode] = useState<"login" | "register">("login");
    const [loading, setLoading] = useState(false);
    const [billing, setBilling] = useState<BillingSummary | null>(null);

    useEffect(() => {
        void fetchCloudUser().catch(() => undefined);
    }, []);

    useEffect(() => {
        if (!user) {
            setBilling(null);
            return;
        }
        void fetchBillingSummary()
            .then(setBilling)
            .catch((error) => message.error(error instanceof Error ? error.message : "读取额度失败"));
    }, [message, user]);

    async function submitLogin(values: LoginValues) {
        setLoading(true);
        try {
            await loginCloudUser(values);
            message.success("登录成功");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        } finally {
            setLoading(false);
        }
    }

    async function submitRegister(values: RegisterValues) {
        setLoading(true);
        try {
            await registerCloudUser(values);
            message.success("注册成功");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "注册失败");
        } finally {
            setLoading(false);
        }
    }

    async function logout() {
        await logoutCloudUser();
        message.success("已退出登录");
    }

    return (
        <main className="h-full overflow-y-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6 dark:border-stone-800">
                    <div>
                        <h1 className="text-2xl font-semibold">会员账号</h1>
                        <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">登录后生成请求会走平台 NewAPI，并按总余额、5 小时额度和 7 天权益周期扣减。</p>
                    </div>
                    {user?.role === "admin" ? (
                        <Button href="/admin/users" icon={<ShieldCheck className="size-4" />}>
                            后台用户
                        </Button>
                    ) : null}
                </header>

                {!user ? (
                    <section className="max-w-md">
                        <Segmented
                            block
                            value={mode}
                            onChange={(value) => setMode(value as "login" | "register")}
                            options={[
                                { label: "登录", value: "login" },
                                { label: "注册", value: "register" },
                            ]}
                        />
                        <div className="mt-5">
                            {mode === "login" ? (
                                <Form layout="vertical" onFinish={submitLogin}>
                                    <Form.Item label="邮箱" name="email" rules={[{ required: true, message: "请输入邮箱" }]}>
                                        <Input autoComplete="email" />
                                    </Form.Item>
                                    <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}>
                                        <Input.Password autoComplete="current-password" />
                                    </Form.Item>
                                    <Button type="primary" htmlType="submit" loading={loading} block>
                                        登录
                                    </Button>
                                </Form>
                            ) : (
                                <Form layout="vertical" onFinish={submitRegister}>
                                    <Form.Item label="邮箱" name="email" rules={[{ required: true, message: "请输入邮箱" }]}>
                                        <Input autoComplete="email" />
                                    </Form.Item>
                                    <Form.Item label="用户名" name="username">
                                        <Input autoComplete="username" />
                                    </Form.Item>
                                    <Form.Item label="显示名称" name="displayName">
                                        <Input />
                                    </Form.Item>
                                    <Form.Item label="密码" name="password" rules={[{ required: true, min: 8, message: "密码至少 8 位" }]}>
                                        <Input.Password autoComplete="new-password" />
                                    </Form.Item>
                                    <Button type="primary" htmlType="submit" loading={loading} block>
                                        注册
                                    </Button>
                                </Form>
                            )}
                        </div>
                    </section>
                ) : (
                    <section className="grid gap-5 lg:grid-cols-[1fr_280px]">
                        <div className="grid gap-5 sm:grid-cols-3">
                            <div className="border border-stone-200 p-5 dark:border-stone-800">
                                <Statistic title="总余额" value={billing?.account.balanceCredits ?? 0} suffix="credits" />
                            </div>
                            <div className="border border-stone-200 p-5 dark:border-stone-800">
                                <Statistic title="5 小时剩余" value={billing?.fiveHourRemaining ?? 0} suffix="credits" />
                                <p className="mt-2 text-xs text-stone-500">已用 {billing?.fiveHourUsed ?? 0}</p>
                            </div>
                            <div className="border border-stone-200 p-5 dark:border-stone-800">
                                <Statistic title="本周期剩余" value={billing?.periodRemainingPercent ?? 0} precision={2} suffix="%" />
                                <Progress percent={billing?.periodRemainingPercent ?? 0} size="small" showInfo={false} />
                            </div>
                        </div>
                        <aside className="border border-stone-200 p-5 dark:border-stone-800">
                            <div className="text-sm font-medium">{user.displayName || user.username}</div>
                            <div className="mt-1 text-xs text-stone-500">{user.email}</div>
                            <dl className="mt-5 space-y-3 text-sm">
                                <div className="flex justify-between gap-4">
                                    <dt className="text-stone-500">套餐</dt>
                                    <dd>{billing?.account.planCode || "未开通"}</dd>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <dt className="text-stone-500">周期结束</dt>
                                    <dd>{formatDate(billing?.account.periodEnd)}</dd>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <dt className="text-stone-500">有效期</dt>
                                    <dd>{formatDate(billing?.account.validUntil)}</dd>
                                </div>
                            </dl>
                            <Space className="mt-6">
                                <Button icon={<LogOut className="size-4" />} onClick={logout}>
                                    退出
                                </Button>
                                <Link href="/canvas">去画布</Link>
                            </Space>
                        </aside>
                    </section>
                )}
            </div>
        </main>
    );
}

function formatDate(value?: string) {
    if (!value) return "-";
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
