// WebDAV proxy is disabled and deprecated.
export async function POST() {
    return new Response("WebDAV feature has been removed.", { status: 410 });
}
