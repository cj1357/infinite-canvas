import { FileText, ImagePlus, Images, Maximize2, ShieldCheck, UserCircle, Video } from "lucide-react";

export const navigationTools = [
    {
        slug: "canvas",
        label: "我的画布",
        icon: Maximize2,
    },
    {
        slug: "image",
        label: "生图工作台",
        icon: ImagePlus,
    },
    {
        slug: "prompts",
        label: "提示词库",
        icon: FileText,
    },
    {
        slug: "assets",
        label: "我的素材",
        icon: Images,
    },
    {
        slug: "account",
        label: "会员账号",
        icon: UserCircle,
    },
    {
        slug: "admin",
        label: "后台管理",
        icon: ShieldCheck,
        adminOnly: true,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
