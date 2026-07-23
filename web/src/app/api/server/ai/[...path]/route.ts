export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

type RouteContext = {
    params: Promise<{ path?: string[] }>;
};

const REQUEST_SKIP_HEADERS = new Set(["host", "connection", "content-length", "transfer-encoding", "upgrade", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer"]);
const RESPONSE_SKIP_HEADERS = new Set(["connection", "content-length", "transfer-encoding", "upgrade", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer"]);

export async function POST(request: Request, context: RouteContext) {
    try {
        const target = await buildTargetURL(request, context);
        const response = await fetch(target.toString(), {
            method: request.method,
            headers: forwardHeaders(request.headers, REQUEST_SKIP_HEADERS),
            body: await request.arrayBuffer(),
            cache: "no-store",
        });
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: forwardHeaders(response.headers, RESPONSE_SKIP_HEADERS),
        });
    } catch (error) {
        return Response.json({ code: 1, msg: error instanceof Error ? error.message : "AI 代理请求失败" }, { status: 502 });
    }
}

async function buildTargetURL(request: Request, context: RouteContext) {
    const baseURL = (process.env.SERVER_API_URL || process.env.NEXT_PUBLIC_SERVER_API_URL || "").replace(/\/+$/, "");
    if (!baseURL) throw new Error("SERVER_API_URL 未配置");
    const { path = [] } = await context.params;
    const target = new URL(`${baseURL}/api/server/ai/${path.map(encodeURIComponent).join("/")}`);
    target.search = new URL(request.url).search;
    return target;
}

function forwardHeaders(source: Headers, skip: Set<string>) {
    const headers = new Headers();
    source.forEach((value, key) => {
        if (!skip.has(key.toLowerCase())) headers.append(key, value);
    });
    return headers;
}
