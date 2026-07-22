export const CANVAS_NODE_TOOLBAR_HIDE_DELAY_MS = 280;

export function resolveCanvasToolbarNodeId(hoverNodeId: string | null, selectedNodeIds: Set<string>) {
    if (hoverNodeId) return hoverNodeId;
    if (selectedNodeIds.size !== 1) return null;
    return selectedNodeIds.values().next().value ?? null;
}
