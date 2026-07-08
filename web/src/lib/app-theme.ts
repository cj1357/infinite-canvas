import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

const neutral = {
    light: {
        primary: "#0e7490",
        primaryHover: "#155e75",
        primaryText: "#ffffff",
        menuBg: "#ecfeff",
        menuText: "#0f172a",
        selectActiveBg: "#ecfeff",
        selectSelectedBg: "#cffafe",
        selectText: "#0f172a",
        tableSelectedBg: "rgba(14, 116, 144, 0.08)",
        tableSelectedHoverBg: "rgba(14, 116, 144, 0.12)",
    },
    dark: {
        primary: "#67e8f9",
        primaryHover: "#a5f3fc",
        primaryText: "#0f172a",
        menuBg: "rgba(103, 232, 249, 0.12)",
        menuText: "#f8fafc",
        selectActiveBg: "rgba(103, 232, 249, 0.1)",
        selectSelectedBg: "rgba(103, 232, 249, 0.18)",
        selectText: "#f8fafc",
        tableSelectedBg: "rgba(103, 232, 249, 0.08)",
        tableSelectedHoverBg: "rgba(103, 232, 249, 0.12)",
    },
};

export function getAntThemeConfig(dark: boolean): ThemeConfig {
    const color = dark ? neutral.dark : neutral.light;

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: dark ? "infinite-canvas-dark" : "infinite-canvas-light" },
        token: {
            colorPrimary: color.primary,
            colorInfo: color.primary,
            colorLink: color.primary,
            colorLinkHover: color.primaryHover,
            colorLinkActive: color.primary,
            colorTextLightSolid: color.primaryText,
            borderRadius: 8,
            borderRadiusLG: 12,
            fontFamily: `var(--font-studio-sans)`,
            fontFamilyCode: `var(--font-studio-mono)`,
        },
        components: {
            Button: {
                primaryShadow: "none",
            },
            Menu: {
                itemActiveBg: color.menuBg,
                itemHoverBg: color.menuBg,
                itemSelectedBg: color.menuBg,
                itemSelectedColor: color.menuText,
                darkItemHoverBg: neutral.dark.menuBg,
                darkItemSelectedBg: neutral.dark.menuBg,
                darkItemSelectedColor: neutral.dark.menuText,
            },
            Select: {
                optionActiveBg: color.selectActiveBg,
                optionSelectedBg: color.selectSelectedBg,
                optionSelectedColor: color.selectText,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
        },
    };
}
