"use client";

import { useMemo, useState } from "react";
import { App, Button, Tag } from "antd";
import { CheckCircle2, Sparkles } from "lucide-react";
import { nanoid } from "nanoid";

import { useI18n } from "@/i18n/use-i18n";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { applyAgentToolCall, createAgentSession, sendAgentMessage, type AgentMessage, type AgentSession, type AgentToolCall, type SuggestedReferenceIntent } from "@/services/api/creative-agent";
import { createReferenceIntent, createReferenceSet } from "@/services/api/creative";
import { AgentChatComposer, AgentChatMessage, AgentWorkingMessage } from "@/app/(user)/canvas/components/canvas-agent-chat-ui";
import { CanvasNodeType } from "@/app/(user)/canvas/types";
import type { CanvasAgentOp, CanvasAgentSnapshot } from "@/app/(user)/canvas/utils/canvas-agent-ops";

type CreativeAgentPanelProps = {
    snapshot: CanvasAgentSnapshot;
    onApplyOps: (ops?: CanvasAgentOp[]) => CanvasAgentSnapshot;
};

export function CreativeAgentPanel({ snapshot, onApplyOps }: CreativeAgentPanelProps) {
    const { message } = App.useApp();
    const { locale, t } = useI18n();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const user = useUserStore((state) => state.user);
    const [session, setSession] = useState<AgentSession | null>(null);
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [toolCalls, setToolCalls] = useState<AgentToolCall[]>([]);
    const [prompt, setPrompt] = useState("");
    const [sending, setSending] = useState(false);
    const [applyingId, setApplyingId] = useState("");
    const pendingCalls = useMemo(() => toolCalls.filter((item) => item.requiresConfirmation && item.status === "pending"), [toolCalls]);

    async function ensureSession() {
        if (session?.projectId === snapshot.projectId) return session;
        const next = await createAgentSession({ projectId: snapshot.projectId, title: t("creativeAgent.sessionTitle"), locale });
        setSession(next);
        setMessages([]);
        setToolCalls([]);
        return next;
    }

    async function submit() {
        const content = prompt.trim();
        if (!content || sending) return;
        setSending(true);
        try {
            const activeSession = await ensureSession();
            setPrompt("");
            const result = await sendAgentMessage(activeSession.id, {
                content,
                canvasSnapshot: buildAgentSnapshot(snapshot),
                metadataJson: { source: "canvas-product-agent" },
            });
            setSession(result.session);
            setMessages(result.messages);
            setToolCalls(result.toolCalls);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("error.default"));
        } finally {
            setSending(false);
        }
    }

    async function applySuggestion(call: AgentToolCall) {
        const intents = call.outputJson?.suggestedIntents || [];
        if (!intents.length) return;
        setApplyingId(call.id);
        try {
            const reference = await ensureReferenceSet(call.outputJson?.referenceSetId || intents[0]?.referenceSetId || "");
            let count = 0;
            for (const intent of intents) {
                if (!intent.mediaObjectId && !intent.assetId) continue;
                await createReferenceIntent(reference.referenceSetId, {
                    mediaObjectId: intent.mediaObjectId,
                    assetId: intent.assetId,
                    role: intent.role,
                    weight: intent.weight,
                    enabled: intent.enabled,
                    sortOrder: intent.sortOrder,
                    note: intent.note,
                    metadataJson: { source: "creative-agent", sourceNodeId: intent.sourceNodeId },
                });
                count += 1;
            }
            await applyAgentToolCall(call.id, { outputJson: { ...call.outputJson, referenceSetId: reference.referenceSetId, appliedIntentCount: count } });
            setToolCalls((prev) => prev.map((item) => (item.id === call.id ? { ...item, status: "applied", outputJson: { ...item.outputJson, referenceSetId: reference.referenceSetId } } : item)));
            message.success(t("creativeAgent.applySuccess", { count }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("error.default"));
        } finally {
            setApplyingId("");
        }
    }

    async function ensureReferenceSet(existingId: string) {
        if (existingId) return { referenceSetId: existingId };
        const referenceNode = findReferenceNode(snapshot);
        const referenceSet = await createReferenceSet({
            projectId: snapshot.projectId,
            title: t("creativeAgent.referenceSetTitle"),
            source: "agent",
            metadataJson: { source: "creative-agent", canvasNodeId: referenceNode?.id },
        });
        if (referenceNode) {
            onApplyOps([{ type: "update_node", id: referenceNode.id, metadata: { referenceSetId: referenceSet.id, referenceSetTitle: referenceSet.title } }]);
            return { referenceSetId: referenceSet.id };
        }
        const id = `reference_set-${nanoid()}`;
        const position = nextReferencePosition(snapshot);
        onApplyOps([
            {
                type: "add_node",
                id,
                nodeType: CanvasNodeType.ReferenceSet,
                title: referenceSet.title,
                position,
                metadata: { referenceSetId: referenceSet.id, referenceSetTitle: referenceSet.title, referenceIntentCount: 0 },
            },
        ]);
        return { referenceSetId: referenceSet.id };
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b px-4 py-3" style={{ borderColor: theme.node.stroke }}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                    <Sparkles className="size-4" />
                    {t("creativeAgent.title")}
                </div>
                <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                    {t("creativeAgent.description")}
                </div>
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                {messages.length ? (
                    messages.map((item) => <AgentChatMessage key={item.id} item={{ id: item.id, role: item.role, text: item.content }} theme={theme} user={user} />)
                ) : (
                    <div className="grid h-full place-items-center px-6 text-center text-sm leading-6" style={{ color: theme.node.muted }}>
                        {t("creativeAgent.empty")}
                    </div>
                )}
                {toolCalls.map((call) => (
                    <SuggestionCard key={call.id} call={call} loading={applyingId === call.id} onApply={() => void applySuggestion(call)} />
                ))}
                {sending ? <AgentWorkingMessage theme={theme} /> : null}
            </div>
            {pendingCalls.length ? (
                <div className="border-t px-4 py-2 text-xs" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                    {t("creativeAgent.pendingCount", { count: pendingCalls.length })}
                </div>
            ) : null}
            <AgentChatComposer prompt={prompt} sending={sending} placeholder={t("creativeAgent.placeholder")} theme={theme} onPromptChange={setPrompt} onSubmit={submit} />
        </div>
    );
}

function SuggestionCard({ call, loading, onApply }: { call: AgentToolCall; loading: boolean; onApply: () => void }) {
    const { t } = useI18n();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const intents = call.outputJson?.suggestedIntents || [];
    return (
        <div className="rounded-xl border p-3" style={{ borderColor: theme.node.stroke, background: "transparent", color: theme.node.text }}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-sm font-semibold">{toolTitle(call.toolName, t)}</div>
                    <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                        {call.outputJson?.summary || t("creativeAgent.toolReady")}
                    </div>
                </div>
                <Tag color={call.status === "applied" ? "green" : call.status === "pending" ? "gold" : "default"} className="m-0">
                    {call.status}
                </Tag>
            </div>
            {intents.length ? (
                <div className="mt-3 space-y-2">
                    {intents.map((intent) => (
                        <IntentPreview key={`${intent.sourceNodeId}-${intent.sortOrder}`} intent={intent} />
                    ))}
                </div>
            ) : null}
            {call.requiresConfirmation && call.status === "pending" ? (
                <Button className="mt-3 !h-9 !w-full" icon={<CheckCircle2 className="size-4" />} loading={loading} onClick={onApply}>
                    {t("creativeAgent.apply")}
                </Button>
            ) : null}
        </div>
    );
}

function IntentPreview({ intent }: { intent: SuggestedReferenceIntent }) {
    const { t } = useI18n();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="rounded-lg border px-2.5 py-2 text-xs" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
            <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{intent.title || intent.sourceNodeId}</span>
                <Tag className="m-0 text-[11px]">{t(`reference.role.${intent.role}`)}</Tag>
            </div>
            <div className="mt-1 leading-5" style={{ color: theme.node.muted }}>
                {intent.note} · {intent.weight}
            </div>
        </div>
    );
}

function buildAgentSnapshot(snapshot: CanvasAgentSnapshot) {
    const referenceNode = findReferenceNode(snapshot);
    return {
        projectId: snapshot.projectId,
        title: snapshot.title,
        selectedNodeIds: snapshot.selectedNodeIds,
        nodes: snapshot.nodes.map((node) => ({ id: node.id, type: node.type, title: node.title, metadata: node.metadata || {} })),
        connections: snapshot.connections,
        referenceSetId: String(referenceNode?.metadata?.referenceSetId || ""),
        referenceNodeId: referenceNode?.id || "",
    };
}

function findReferenceNode(snapshot: CanvasAgentSnapshot) {
    const selected = new Set(snapshot.selectedNodeIds);
    return snapshot.nodes.find((node) => selected.has(node.id) && node.type === CanvasNodeType.ReferenceSet) || snapshot.nodes.find((node) => node.type === CanvasNodeType.ReferenceSet);
}

function nextReferencePosition(snapshot: CanvasAgentSnapshot) {
    const maxX = snapshot.nodes.length ? Math.max(...snapshot.nodes.map((node) => node.position.x + node.width)) : 0;
    return { x: maxX + 64, y: 40 };
}

function toolTitle(name: string, t: (key: string) => string) {
    if (name === "suggest_reference_intents") return t("creativeAgent.suggestReferenceIntents");
    if (name === "list_canvas_nodes") return t("creativeAgent.listCanvasNodes");
    return name;
}
