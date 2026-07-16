type GoogleImageResolution = "512" | "1K" | "2K" | "4K";

const GOOGLE_IMAGE_RESOLUTIONS: Record<string, GoogleImageResolution[]> = {
    "google/gemini-3.1-flash-lite-image": ["1K"],
    "google/gemini-3.1-flash-image": ["512", "1K", "2K", "4K"],
    "google/gemini-3-pro-image": ["1K", "2K"],
    "google/gemini-2.5-flash-image": [],
};

const GOOGLE_IMAGE_ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
const RESOLUTION_ORDER: GoogleImageResolution[] = ["512", "1K", "2K", "4K"];

export type GoogleImageRequestOptions = {
    resolution?: GoogleImageResolution;
    aspect_ratio?: string;
};

function imageModelName(model: string) {
    return model.split("::").at(-1)?.trim().toLowerCase() || "";
}

export function getGoogleImageResolutionOptions(model: string) {
    const options = GOOGLE_IMAGE_RESOLUTIONS[imageModelName(model)];
    return options ? [...options] : null;
}

export function resolveGoogleImageAspectRatio(size: string) {
    const value = size.trim().toLowerCase();
    if (!value || value === "auto") return undefined;
    const dimensions = parseDimensions(value);
    const ratio = dimensions ? dimensions.width / dimensions.height : parseRatio(value);
    if (!ratio) return undefined;
    return GOOGLE_IMAGE_ASPECT_RATIOS.reduce((closest, candidate) => {
        const candidateRatio = parseRatio(candidate) || 1;
        const closestRatio = parseRatio(closest) || 1;
        return Math.abs(Math.log(candidateRatio / ratio)) < Math.abs(Math.log(closestRatio / ratio)) ? candidate : closest;
    });
}

export function resolveGoogleImageRequestOptions(model: string, quality: string, size: string): GoogleImageRequestOptions | null {
    const resolutions = getGoogleImageResolutionOptions(model);
    if (resolutions === null) return null;
    const aspectRatio = resolveGoogleImageAspectRatio(size);
    const resolution = resolutions.length ? closestSupportedResolution(resolveRequestedResolution(quality, size), resolutions) : undefined;
    return {
        ...(resolution ? { resolution } : {}),
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    };
}

function resolveRequestedResolution(quality: string, size: string): GoogleImageResolution {
    const qualityResolution = ({ "512": "512", low: "1K", standard: "1K", "1k": "1K", medium: "2K", hd: "2K", "2k": "2K", high: "4K", "4k": "4K" } as Record<string, GoogleImageResolution>)[
        quality.trim().toLowerCase()
    ];
    if (qualityResolution) return qualityResolution;
    const dimensions = parseDimensions(size);
    if (!dimensions) return "1K";
    const shortEdge = Math.min(dimensions.width, dimensions.height);
    if (shortEdge <= 512) return "512";
    if (shortEdge <= 1024) return "1K";
    if (shortEdge <= 2048) return "2K";
    return "4K";
}

function closestSupportedResolution(requested: GoogleImageResolution, supported: GoogleImageResolution[]) {
    const requestedIndex = RESOLUTION_ORDER.indexOf(requested);
    return supported.reduce((closest, candidate) => {
        const distance = Math.abs(RESOLUTION_ORDER.indexOf(candidate) - requestedIndex);
        const closestDistance = Math.abs(RESOLUTION_ORDER.indexOf(closest) - requestedIndex);
        return distance < closestDistance ? candidate : closest;
    });
}

function parseDimensions(value: string) {
    const match = value.match(/^(\d+)x(\d+)$/i);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    return width > 0 && height > 0 ? { width, height } : null;
}

function parseRatio(value: string) {
    const match = value.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    return width > 0 && height > 0 ? width / height : null;
}
