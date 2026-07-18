import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import { ServerApiError } from "@/services/api/server";
import {
    createCanvasProject as createCloudCanvasProject,
    deleteCanvasProject as deleteCloudCanvasProject,
    listCanvasProjects as listCloudCanvasProjects,
    updateCanvasProject as updateCloudCanvasProject,
    type CloudCanvasProject,
    type CloudCanvasProjectData,
    type CloudCanvasProjectInput,
} from "@/services/api/creative";
import { useUserStore } from "@/stores/use-user-store";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "../types";

export type CanvasProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
};

type CanvasStore = {
    hydrated: boolean;
    cloudLoaded: boolean;
    cloudLoading: boolean;
    cloudError: string | null;
    projects: CanvasProject[];
    loadCloudProjects: () => Promise<void>;
    syncProjectToCloud: (id: string) => Promise<void>;
    createProject: (title?: string) => string;
    importProject: (project: Partial<CanvasProject>) => string;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    replaceProjects: (projects: CanvasProject[]) => void;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport">>) => void;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
const CANVAS_STORE_KEY = "infinite-canvas:canvas_store";
type PersistedCanvasState = Pick<CanvasStore, "projects">;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let queuedPersistState: PersistedCanvasState | null = null;
const cloudSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const cloudProjectIds = new Set<string>();
const CLOUD_SAVE_DELAY_MS = 900;
const CLOUD_PROJECT_PAGE_SIZE = 100;

const canvasStorage: PersistStorage<CanvasStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<CanvasStore>;
        queuedPersistState = parsed.state as PersistedCanvasState;
        return parsed;
    },
    setItem: (name, value) => {
        const nextState = value.state as PersistedCanvasState;
        if (queuedPersistState && queuedPersistState.projects === nextState.projects) return;
        queuedPersistState = nextState;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            void localForageStorage.setItem(name, JSON.stringify(value));
        }, 400);
    },
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useCanvasStore = create<CanvasStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            cloudLoaded: false,
            cloudLoading: false,
            cloudError: null,
            projects: [],
            loadCloudProjects: async () => {
                if (!canUseCloudProjects()) {
                    set({ cloudLoaded: false, cloudLoading: false, cloudError: null });
                    return;
                }
                set({ cloudLoading: true, cloudError: null });
                try {
                    const params = new URLSearchParams({ page: "1", pageSize: String(CLOUD_PROJECT_PAGE_SIZE) });
                    const result = await listCloudCanvasProjects(params);
                    cloudProjectIds.clear();
                    result.items.forEach((project) => cloudProjectIds.add(project.id));
                    set({ projects: result.items.map(projectFromCloud), cloudLoaded: true, cloudLoading: false, cloudError: null });
                } catch (error) {
                    set({ cloudLoaded: true, cloudLoading: false, cloudError: error instanceof Error ? error.message : "云端画布加载失败" });
                }
            },
            syncProjectToCloud: async (id) => {
                const project = get().projects.find((item) => item.id === id);
                if (project) await saveCloudProject(project);
            },
            createProject: (title = "未命名画布") => {
                const now = new Date().toISOString();
                const id = nanoid();
                const project: CanvasProject = {
                    id,
                    title,
                    createdAt: now,
                    updatedAt: now,
                    nodes: [],
                    connections: [],
                    chatSessions: [],
                    activeChatId: null,
                    backgroundMode: "lines",
                    showImageInfo: false,
                    viewport: initialViewport,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                void createCloudProject(project);
                return id;
            },
            importProject: (source) => {
                const now = new Date().toISOString();
                const project = normalizeProject({
                    id: nanoid(),
                    title: source.title || "导入画布",
                    createdAt: source.createdAt || now,
                    updatedAt: now,
                    nodes: source.nodes || [],
                    connections: source.connections || [],
                    chatSessions: source.chatSessions || [],
                    activeChatId: source.activeChatId || null,
                    backgroundMode: source.backgroundMode || "lines",
                    showImageInfo: source.showImageInfo || false,
                    viewport: source.viewport || initialViewport,
                });
                set((state) => ({ projects: [project, ...state.projects] }));
                void createCloudProject(project);
                return project.id;
            },
            openProject: (id) => {
                return get().projects.find((item) => item.id === id) || null;
            },
            renameProject: (id, title) => {
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? normalizeProject({ ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() }) : project)),
                }));
                queueCloudSave(id, get);
            },
            deleteProjects: (ids) => {
                set((state) => {
                    const projects = state.projects.filter((project) => !ids.includes(project.id));
                    return { projects };
                });
                ids.forEach((id) => {
                    clearCloudSave(id);
                    void deleteCloudProject(id);
                });
            },
            replaceProjects: (projects) => {
                const normalized = projects.map(normalizeProject);
                set({ projects: normalized });
                normalized.forEach((project) => queueCloudSave(project.id, get));
            },
            updateProject: (id, patch) => {
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? normalizeProject({ ...project, ...patch, updatedAt: new Date().toISOString() }) : project)),
                }));
                queueCloudSave(id, get);
            },
        }),
        {
            name: CANVAS_STORE_KEY,
            storage: canvasStorage,
            partialize: (state) =>
                ({
                    projects: state.projects,
                }) as StorageValue<CanvasStore>["state"],
            onRehydrateStorage: () => () => {
                useCanvasStore.setState({ hydrated: true });
            },
        },
    ),
);

function canUseCloudProjects() {
    return Boolean(useUserStore.getState().user);
}

function queueCloudSave(id: string, get: () => CanvasStore) {
    if (!canUseCloudProjects()) return;
    clearCloudSave(id);
    cloudSaveTimers.set(
        id,
        setTimeout(() => {
            cloudSaveTimers.delete(id);
            const project = get().projects.find((item) => item.id === id);
            if (project) void saveCloudProject(project);
        }, CLOUD_SAVE_DELAY_MS),
    );
}

function clearCloudSave(id: string) {
    const timer = cloudSaveTimers.get(id);
    if (timer) clearTimeout(timer);
    cloudSaveTimers.delete(id);
}

async function saveCloudProject(project: CanvasProject) {
    if (!canUseCloudProjects()) return;
    if (!cloudProjectIds.has(project.id)) {
        await createCloudProject(project);
        return;
    }
    const input = projectToCloudInput(project);
    try {
        await updateCloudCanvasProject(project.id, input);
        cloudProjectIds.add(project.id);
    } catch (error) {
        if (error instanceof ServerApiError && error.status !== 404) {
            console.warn("保存云端画布失败", error);
            return;
        }
        cloudProjectIds.delete(project.id);
        await createCloudProject(project);
    }
}

async function createCloudProject(project: CanvasProject) {
    if (!canUseCloudProjects()) return;
    const input = projectToCloudInput(project);
    try {
        await createCloudCanvasProject(input);
        cloudProjectIds.add(project.id);
    } catch (createError) {
        try {
            await updateCloudCanvasProject(project.id, input);
            cloudProjectIds.add(project.id);
        } catch (retryError) {
            console.warn("创建云端画布失败", createError, retryError);
        }
    }
}

async function deleteCloudProject(id: string) {
    if (!canUseCloudProjects()) return;
    try {
        await deleteCloudCanvasProject(id);
    } catch (error) {
        if (error instanceof ServerApiError && error.status === 404) return;
        console.warn("删除云端画布失败", error);
    }
}

function projectToCloudInput(project: CanvasProject): CloudCanvasProjectInput {
    return {
        id: project.id,
        title: project.title,
        dataJson: {
            nodes: project.nodes,
            connections: project.connections,
            chatSessions: project.chatSessions,
            activeChatId: project.activeChatId,
            backgroundMode: project.backgroundMode,
            showImageInfo: project.showImageInfo,
            viewport: project.viewport,
        },
        metadataJson: {
            schema: "canvas-project-v2",
        },
    };
}

function projectFromCloud(item: CloudCanvasProject): CanvasProject {
    const data = objectRecord(item.dataJson);
    return normalizeProject({
        id: item.id,
        title: item.title || "未命名画布",
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
        nodes: arrayValue<CanvasNodeData>(data.nodes),
        connections: arrayValue<CanvasConnection>(data.connections),
        chatSessions: arrayValue<CanvasAssistantSession>(data.chatSessions),
        activeChatId: typeof data.activeChatId === "string" ? data.activeChatId : null,
        backgroundMode: backgroundModeValue(data.backgroundMode),
        showImageInfo: Boolean(data.showImageInfo),
        viewport: viewportValue(data.viewport),
    });
}

function normalizeProject(project: Partial<CanvasProject>): CanvasProject {
    const now = new Date().toISOString();
    return {
        id: project.id || nanoid(),
        title: project.title || "未命名画布",
        createdAt: project.createdAt || now,
        updatedAt: project.updatedAt || now,
        nodes: Array.isArray(project.nodes) ? project.nodes.filter(node => node.type !== "video" && node.type !== "audio") : [],
        connections: Array.isArray(project.connections) ? project.connections.filter(conn => {
            const validNodes = Array.isArray(project.nodes) ? project.nodes : [];
            const exists = (id) => validNodes.some(node => node.id === id && node.type !== "video" && node.type !== "audio");
            return exists(conn.fromNodeId) && exists(conn.toNodeId);
        }) : [],
        chatSessions: Array.isArray(project.chatSessions) ? project.chatSessions : [],
        activeChatId: project.activeChatId || null,
        backgroundMode: backgroundModeValue(project.backgroundMode),
        showImageInfo: Boolean(project.showImageInfo),
        viewport: viewportValue(project.viewport),
    };
}

function objectRecord(value: CloudCanvasProjectData | unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arrayValue<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
}

function backgroundModeValue(value: unknown): CanvasBackgroundMode {
    return value === "dots" || value === "blank" || value === "lines" ? value : "lines";
}

function viewportValue(value: unknown): ViewportTransform {
    const item = objectRecord(value);
    const x = typeof item.x === "number" ? item.x : initialViewport.x;
    const y = typeof item.y === "number" ? item.y : initialViewport.y;
    const k = typeof item.k === "number" ? item.k : initialViewport.k;
    return { x, y, k };
}
