import type { ImageModelCapability } from "@/lib/image-model-capability";
import { serverRequest } from "@/services/api/server";

export function resolveImageModelCapability(model: string) {
    const query = new URLSearchParams({ model });
    return serverRequest<ImageModelCapability>(`/model-capabilities/resolve?${query}`);
}
