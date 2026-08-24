import { mediaObjectUrl, uploadMediaObject, type MediaObject } from "@/services/api/creative";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import { CanvasNodeType, type CanvasAssistantReference, type CanvasAssistantSession, type CanvasNodeData } from "../types";

type ProjectWithCanvasMedia = {
    nodes: CanvasNodeData[];
    chatSessions?: CanvasAssistantSession[];
};

const uploadPromises = new Map<string, Promise<MediaObject>>();

export async function prepareCanvasProjectMediaForCloud<T extends ProjectWithCanvasMedia>(project: T): Promise<T> {
    let changed = false;
    const nodes = await Promise.all(
        project.nodes.map(async (node) => {
            const next = await prepareCanvasNodeMediaForCloud(node);
            if (next !== node) changed = true;
            return next;
        }),
    );
    const referenceMap = buildStableReferenceMap(project.nodes, nodes);
    const rewrittenNodes = nodes.map((node) => rewriteNodeReferences(node, referenceMap));
    if (rewrittenNodes.some((node, index) => node !== nodes[index])) changed = true;
    const chatSessions = project.chatSessions?.map((session) => rewriteAssistantSessionReferences(session, referenceMap));
    if (chatSessions?.some((session, index) => session !== project.chatSessions?.[index])) changed = true;
    return changed ? { ...project, nodes: rewrittenNodes, ...(chatSessions ? { chatSessions } : {}) } : project;
}

export function hasUnresolvedCanvasProjectMedia(project: ProjectWithCanvasMedia) {
    return project.nodes.some(hasUnresolvedNodeMedia) || project.chatSessions?.some((session) => session.messages.some((message) => message.references?.some(hasUnresolvedAssistantReference))) || false;
}

export function stableCanvasMediaUrl(mediaObjectId?: string) {
    return mediaObjectId ? mediaObjectUrl(mediaObjectId) : "";
}

function buildStableReferenceMap(sourceNodes: CanvasNodeData[], preparedNodes: CanvasNodeData[]) {
    const map = new Map<string, string>();
    preparedNodes.forEach((node, index) => {
        const stableUrl = stableCanvasMediaUrl(node.metadata?.mediaObjectId);
        if (!stableUrl) return;
        const source = sourceNodes[index];
        [source?.metadata?.storageKey, node.metadata?.storageKey, source?.metadata?.content, node.metadata?.content].forEach((key) => {
            if (key) map.set(key, stableUrl);
        });
    });
    return map;
}

function rewriteNodeReferences(node: CanvasNodeData, referenceMap: Map<string, string>) {
    const references = node.metadata?.references;
    if (!references?.length) return node;
    let changed = false;
    const nextReferences = references.map((reference) => {
        const mediaObjectId = mediaObjectIdFromCanvasMediaUrl(reference);
        const next = mediaObjectId ? stableCanvasMediaUrl(mediaObjectId) : referenceMap.get(reference) || reference;
        if (next !== reference) changed = true;
        return next;
    });
    return changed ? { ...node, metadata: { ...node.metadata, references: nextReferences } } : node;
}

function rewriteAssistantSessionReferences(session: CanvasAssistantSession, referenceMap: Map<string, string>) {
    let changed = false;
    const messages = session.messages.map((message) => {
        if (!message.references?.length) return message;
        const references = message.references.map((reference) => {
            const next = rewriteAssistantReference(reference, referenceMap);
            if (next !== reference) changed = true;
            return next;
        });
        return references === message.references ? message : { ...message, references };
    });
    return changed ? { ...session, messages } : session;
}

function rewriteAssistantReference(reference: CanvasAssistantReference, referenceMap: Map<string, string>) {
    const mediaObjectId = reference.mediaObjectId || mediaObjectIdFromCanvasMediaUrl(reference.dataUrl);
    const stableUrl = mediaObjectId ? stableCanvasMediaUrl(mediaObjectId) : (reference.storageKey && referenceMap.get(reference.storageKey)) || (reference.dataUrl && referenceMap.get(reference.dataUrl)) || "";
    if (!stableUrl) return reference;
    const nextMediaObjectId = mediaObjectId || mediaObjectIdFromCanvasMediaUrl(stableUrl);
    if (reference.dataUrl === stableUrl && reference.mediaObjectId === nextMediaObjectId) return reference;
    return { ...reference, dataUrl: stableUrl, mediaObjectId: nextMediaObjectId || reference.mediaObjectId };
}

function hasUnresolvedNodeMedia(node: CanvasNodeData) {
    const metadata = node.metadata;
    if (!metadata) return false;
    const contentMediaObjectId = mediaObjectIdFromCanvasMediaUrl(metadata.content);
    const hasStableMedia = Boolean(metadata.mediaObjectId || contentMediaObjectId);
    const localOnlyContent = Boolean(metadata.content && isLocalOnlyMediaReference(metadata.content));
    const localOnlyStorage = Boolean(metadata.storageKey);
    const localOnlyReferences = metadata.references?.some((reference) => !mediaObjectIdFromCanvasMediaUrl(reference) && isLocalOnlyMediaReference(reference)) || false;
    return (!hasStableMedia && Boolean(nodeMediaKind(node)) && (localOnlyContent || localOnlyStorage)) || localOnlyReferences;
}

function hasUnresolvedAssistantReference(reference: CanvasAssistantReference) {
    if (reference.mediaObjectId || mediaObjectIdFromCanvasMediaUrl(reference.dataUrl)) return false;
    return Boolean(reference.storageKey || (reference.dataUrl && isLocalOnlyMediaReference(reference.dataUrl)));
}

function isLocalOnlyMediaReference(value: string) {
    return value.startsWith("image:") || value.startsWith("blob:") || value.startsWith("data:");
}

async function prepareCanvasNodeMediaForCloud(node: CanvasNodeData): Promise<CanvasNodeData> {
    const mediaKind = nodeMediaKind(node);
    if (!mediaKind || !node.metadata) return node;
    const existingMediaObjectId = node.metadata.mediaObjectId || mediaObjectIdFromCanvasMediaUrl(node.metadata.content);
    if (existingMediaObjectId) {
        const content = stableCanvasMediaUrl(existingMediaObjectId);
        if (node.metadata.mediaObjectId === existingMediaObjectId && node.metadata.content === content) return node;
        return { ...node, metadata: { ...node.metadata, mediaObjectId: existingMediaObjectId, content } };
    }

    const blob = await readNodeBlob(node);
    if (!blob) return node;
    try {
        const media = await uploadNodeBlob(node, blob, mediaKind);
        return {
            ...node,
            metadata: {
                ...node.metadata,
                content: stableCanvasMediaUrl(media.id),
                mediaObjectId: media.id,
                naturalWidth: media.width || node.metadata.naturalWidth,
                naturalHeight: media.height || node.metadata.naturalHeight,
                bytes: media.byteSize || node.metadata.bytes,
                mimeType: media.mimeType || node.metadata.mimeType || blob.type,
            },
        };
    } catch (error) {
        console.warn("补传画布媒体失败", error);
        return node;
    }
}

function nodeMediaKind(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Image) return "image";
    if (node.type === CanvasNodeType.Video) return "video";
    if (node.type === CanvasNodeType.Audio) return "audio";
    if (node.type === CanvasNodeType.Media) return node.metadata?.mediaKind || null;
    return null;
}

async function readNodeBlob(node: CanvasNodeData) {
    const storageKey = node.metadata?.storageKey;
    if (storageKey?.startsWith("image:")) {
        const blob = await getImageBlob(storageKey);
        if (blob) return blob;
    } else if (storageKey) {
        const blob = await getMediaBlob(storageKey);
        if (blob) return blob;
    }
    const content = node.metadata?.content || "";
    if (!content.startsWith("data:") && !content.startsWith("blob:")) return null;
    try {
        return await (await fetch(content)).blob();
    } catch {
        return null;
    }
}

function uploadNodeBlob(node: CanvasNodeData, blob: Blob, mediaKind: string) {
    const key = node.metadata?.storageKey || node.metadata?.content || `${node.id}:${blob.size}`;
    const cached = uploadPromises.get(key);
    if (cached) return cached;
    const promise = uploadMediaObject(new File([blob], mediaFileName(node, blob, mediaKind), { type: blob.type || node.metadata?.mimeType || "application/octet-stream" })).catch((error) => {
        uploadPromises.delete(key);
        throw error;
    });
    uploadPromises.set(key, promise);
    return promise;
}

function mediaFileName(node: CanvasNodeData, blob: Blob, mediaKind: string) {
    const title = (node.title || node.id || mediaKind).replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
    return `${title}.${mediaExtension(blob.type || node.metadata?.mimeType, mediaKind)}`;
}

function mediaExtension(mimeType: string | undefined, mediaKind: string) {
    if (mimeType?.includes("jpeg")) return "jpg";
    if (mimeType?.includes("png")) return "png";
    if (mimeType?.includes("webp")) return "webp";
    if (mimeType?.includes("gif")) return "gif";
    if (mimeType?.includes("mp4")) return "mp4";
    if (mimeType?.includes("mpeg")) return "mp3";
    if (mimeType?.includes("wav")) return "wav";
    if (mediaKind === "image") return "png";
    if (mediaKind === "video") return "mp4";
    if (mediaKind === "audio") return "mp3";
    return "bin";
}

export function mediaObjectIdFromCanvasMediaUrl(url?: string) {
    return url?.match(/\/api\/server\/media\/([^/?#]+)/)?.[1] || "";
}
