import { Images, SlidersHorizontal } from "lucide-react";

import { useI18n } from "@/i18n/use-i18n";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ReferenceIntent, ReferenceSetDetail } from "@/services/api/creative";
import type { CanvasNodeData } from "../types";

type ReferenceSetNodeProps = {
    node: CanvasNodeData;
    detail?: ReferenceSetDetail | null;
    onOpen: () => void;
};

const roles = ["subject", "style", "composition", "element"] as const;
type RoleCounts = Partial<Record<(typeof roles)[number], number>>;

export function ReferenceSetNode({ node, detail, onOpen }: ReferenceSetNodeProps) {
    const { t } = useI18n();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const intents = detail?.intents || [];
    const roleCounts = intents.length ? countRoles(intents) : node.metadata?.referenceRoleCounts || {};
    const total = intents.length || node.metadata?.referenceIntentCount || 0;

    return (
        <div className="flex h-full w-full cursor-move flex-col px-3 pb-3 pt-7 text-left" style={{ color: theme.node.text }}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        <Images className="size-4" />
                        <span className="truncate">{detail?.referenceSet.title || node.metadata?.referenceSetTitle || node.title || t("reference.node.title")}</span>
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: theme.node.muted }}>
                        {total ? t("reference.node.count", { count: total }) : t("reference.node.empty")}
                    </div>
                </div>
                <button
                    type="button"
                    className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border"
                    style={{ borderColor: theme.node.stroke, background: theme.node.fill }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation();
                        onOpen();
                    }}
                    aria-label={t("reference.composer.title")}
                >
                    <SlidersHorizontal className="size-4" />
                </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-1.5">
                {roles.map((role) => (
                    <div key={role} className="min-w-0 rounded-md border px-2 py-1.5" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                        <div className="truncate text-[11px] font-medium">{t(`reference.role.${role}`)}</div>
                        <div className="mt-1 text-xs" style={{ color: theme.node.muted }}>
                            {roleCounts[role] || 0}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function countRoles(intents: ReferenceIntent[]) {
    return intents.reduce<RoleCounts>((result, intent) => {
        result[intent.role] = (result[intent.role] || 0) + 1;
        return result;
    }, {});
}
