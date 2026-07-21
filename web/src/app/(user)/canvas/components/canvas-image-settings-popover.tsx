"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { LoaderCircle, Settings2 } from "lucide-react";
import { Button } from "antd";

import { ImageSettingsPanel, imageQualityLabel, imageSizeLabel } from "@/components/image-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { normalizeImageCapabilitySelection, type ImageModelCapability } from "@/lib/image-model-capability";
import { resolveImageModelCapability } from "@/services/api/model-capabilities";
import { useThemeStore } from "@/stores/use-theme-store";
import { modelOptionName, type AiConfig } from "@/stores/use-config-store";

type CanvasImageSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onMissingConfig?: () => void;
    onOpenChange?: (open: boolean) => void;
    buttonClassName?: string;
    getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
    autoAdjustOverflow?: boolean;
};

export function CanvasImageSettingsPopover({ config, onConfigChange, onOpenChange, buttonClassName, placement = "topLeft" }: CanvasImageSettingsPopoverProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const capabilityModel = modelOptionName(config.model || config.imageModel);
    const capabilityQuery = useQuery({
        queryKey: ["image-model-capability", capabilityModel],
        queryFn: () => resolveImageModelCapability(capabilityModel),
        enabled: Boolean(capabilityModel),
        staleTime: 10 * 60 * 1000,
    });
    const capability = capabilityQuery.data;
    const quality = config.quality || "auto";
    const count = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const activeSize = config.size || "auto";
    const updateOpen = (nextOpen: boolean) => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
    };

    useEffect(() => {
        if (!capability) return;
        const next = normalizeImageCapabilitySelection(capability, config.quality, config.size);
        if (next.resolution && next.resolution !== config.quality) onConfigChange("quality", next.resolution);
        if (next.aspectRatio && next.aspectRatio !== config.size) onConfigChange("size", next.aspectRatio);
    }, [capability, config.quality, config.size, onConfigChange]);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            if (document.activeElement instanceof HTMLElement && panelRef.current?.contains(document.activeElement)) document.activeElement.blur();
            setOpen(false);
            onOpenChange?.(false);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [onOpenChange, open]);

    const panel = open && buttonRect ? <ImageSettingsPortal buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} capability={capability} capabilityLoading={capabilityQuery.isFetching} capabilityError={capabilityQuery.error} retryCapability={() => void capabilityQuery.refetch()} onConfigChange={onConfigChange} /> : null;

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button size="small" type="text" className={buttonClassName || "!h-8 !max-w-[180px] !justify-start !rounded-full !px-2.5"} style={{ background: theme.node.fill, color: theme.node.text }} icon={<Settings2 className="size-3.5" />} onClick={() => updateOpen(!open)}>
                    <span className="truncate">
                        {capabilityQuery.isFetching ? "正在读取模型能力" : capabilityQuery.error ? "模型能力读取失败" : `${imageQualityLabel(quality)} · ${imageSizeLabel(activeSize)} · ${count} 张`}
                    </span>
                </Button>
            </span>
            {panel}
        </>
    );
}

function ImageSettingsPortal({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    capability,
    capabilityLoading,
    capabilityError,
    retryCapability,
    onConfigChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasImageSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    capability?: ImageModelCapability;
    capabilityLoading: boolean;
    capabilityError: Error | null;
    retryCapability: () => void;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
}) {
    const width = 356;
    const gap = 8;
    const margin = 12;
    const alignRight = placement?.endsWith("Right");
    const alignCenter = placement === "top" || placement === "bottom";
    const left = alignCenter ? buttonRect.left + buttonRect.width / 2 - width / 2 : alignRight ? buttonRect.right - width : buttonRect.left;
    const topPlacement = placement?.startsWith("top");
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, left)),
        ...(topPlacement ? { bottom: window.innerHeight - buttonRect.top + gap, maxHeight: Math.max(260, buttonRect.top - margin * 2) } : { top: buttonRect.bottom + gap, maxHeight: Math.max(260, window.innerHeight - buttonRect.bottom - margin * 2) }),
        background: theme.toolbar.panel,
        borderRadius: 18,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
        padding: 18,
        overflowY: "auto",
        color: theme.node.text,
    } as const;

    return createPortal(
        <div
            ref={panelRef}
            className="canvas-image-settings-popover"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            {capabilityLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm" style={{ color: theme.node.muted }}>
                    <LoaderCircle className="size-4 animate-spin" />
                    正在读取模型能力
                </div>
            ) : capabilityError || !capability ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm" style={{ borderColor: theme.node.stroke }}>
                    <span>模型能力读取失败，暂时无法调整参数</span>
                    <Button size="small" onClick={retryCapability}>重试</Button>
                </div>
            ) : (
                <ImageSettingsPanel config={config} capability={capability} onConfigChange={(key, value) => onConfigChange(key, value)} theme={theme} className="space-y-4" limitCountByCapability={false} />
            )}
        </div>,
        document.body,
    );
}
