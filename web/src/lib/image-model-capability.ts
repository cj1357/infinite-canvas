export type ImageModelCapability = {
    model: string;
    provider: string;
    supportedRatios: string[];
    supportedResolutions: string[];
    supportsReferences: boolean;
    maxReferences: number;
    maxOutputsPerRequest: number;
    source: "openrouter" | "cache" | "database";
};

type ImageCapabilityRuntimeState = {
    capability?: ImageModelCapability;
    isFetching: boolean;
    error: unknown;
};

export function isImageModelCapabilityReady({ capability, isFetching, error }: ImageCapabilityRuntimeState) {
    return Boolean(capability && !isFetching && !error);
}

export function imageCapabilityOptions(capability?: ImageModelCapability) {
    return {
        supportedRatios: Array.isArray(capability?.supportedRatios) ? capability.supportedRatios : [],
        supportedResolutions: Array.isArray(capability?.supportedResolutions) ? capability.supportedResolutions : [],
    };
}

export function resolveImageReferenceAvailability({ capability, isFetching, error, currentCount }: ImageCapabilityRuntimeState & { currentCount: number }) {
    const supportsReferences = Boolean(capability?.supportsReferences);
    const maxReferences = supportsReferences ? Math.max(0, Number(capability?.maxReferences) || 0) : 0;
    const availableReferenceSlots = Math.max(0, maxReferences - Math.max(0, Number(currentCount) || 0));
    return {
        supportsReferences,
        availableReferenceSlots,
        canAddReference: isImageModelCapabilityReady({ capability, isFetching, error }) && availableReferenceSlots > 0,
    };
}

export function mergeImageReferencesForCapability<T>({
    capability,
    isFetching,
    error,
    current,
    incoming,
    expectedModel,
    currentModel,
}: ImageCapabilityRuntimeState & { current: T[]; incoming: T[]; expectedModel: string; currentModel: string }) {
    if (!isImageModelCapabilityReady({ capability, isFetching, error }) || !capability?.supportsReferences || expectedModel !== currentModel || capability.model !== currentModel) return current;
    const additions = incoming.slice(0, Math.max(0, capability.maxReferences - current.length));
    return additions.length ? [...current, ...additions] : current;
}

export function normalizeImageCapabilitySelection(capability: ImageModelCapability, resolution: string, aspectRatio: string) {
    const { supportedResolutions, supportedRatios } = imageCapabilityOptions(capability);
    return {
        resolution: supportedValue(supportedResolutions, resolution, "1K"),
        aspectRatio: supportedValue(supportedRatios, aspectRatio, "1:1"),
    };
}

export function resolveImageCapabilityRequestOptions(capability: ImageModelCapability, resolution: string, aspectRatio: string) {
    const { supportedResolutions, supportedRatios } = imageCapabilityOptions(capability);
    return {
        ...(supportedResolutions.includes(resolution) ? { resolution } : {}),
        ...(supportedRatios.includes(aspectRatio) ? { aspect_ratio: aspectRatio } : {}),
    };
}

export function imageReferencesForCapability<T>(capability: ImageModelCapability, references: T[]) {
    if (!capability.supportsReferences) return [];
    if (references.length > capability.maxReferences) {
        throw new Error(`当前模型最多支持 ${capability.maxReferences} 张参考图`);
    }
    return references;
}

function supportedValue(values: string[], current: string, preferred: string) {
    if (values.includes(current)) return current;
    if (values.includes(preferred)) return preferred;
    return values[0] || "";
}
