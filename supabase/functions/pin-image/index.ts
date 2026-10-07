// Returns the main picture of a Pinterest pin, so the app can save it with the
// room's inspiration. Only Pinterest addresses are fetched.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-actor",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PAGE_HOST = /(^|\.)pinterest\.[a-z.]+$|(^|\.)pin\.it$/i;
const IMG_HOST = /(^|\.)pinimg\.com$/i;
const MAX = 15 * 1024 * 1024;
const UA = "Mozilla/5.0 (compatible; HighlandSalePrep/1.0)";

const fail = (status: number, msg: string) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function follow(url: URL): Promise<Response> {
  // Follow redirects by hand so every hop stays on Pinterest.
  for (let i = 0; i < 5; i++) {
    if (url.protocol !== "https:" || !(PAGE_HOST.test(url.hostname) || IMG_HOST.test(url.hostname))) throw new Error("not pinterest");
    const r = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA, "Accept-Language": "en-AU" } });
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) { url = new URL(loc, url); continue; }
    return r;
  }
  throw new Error("too many redirects");
}

function imageFrom(html: string): string | null {
  const metas = html.match(/<meta[^>]+>/gi) || [];
  for (const name of ["og:image", "twitter:image", "og:image:secure_url"]) {
    for (const m of metas) {
      if (new RegExp(`(property|name)=["']${name}["']`, "i").test(m)) {
        const c = m.match(/content=["']([^"']+)["']/i);
        if (c) return c[1].replace(/&amp;/g, "&");
      }
    }
  }
  const any = html.match(/https:\/\/i\.pinimg\.com\/(originals|736x)\/[^"'\s\\]+\.(jpg|jpeg|png|webp)/i);
  return any ? any[0] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "POST only");
  let url: URL;
  try { url = new URL((await req.json()).url); } catch { return fail(400, "Send {url}"); }
  if (!(PAGE_HOST.test(url.hostname) || IMG_HOST.test(url.hostname))) return fail(400, "Only Pinterest links");
  url.protocol = "https:";
  try {
    let img = url;
    if (!IMG_HOST.test(url.hostname)) {
      const page = await follow(url);
      if (!page.ok) return fail(502, `Pinterest answered ${page.status}`);
      const found = imageFrom(await page.text());
      if (!found) return fail(404, "No picture found on that pin");
      img = new URL(found, url);
    }
    const r = await follow(img);
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.startsWith("image/")) return fail(502, "Couldn't download the picture");
    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX) return fail(413, "Picture too large");
    return new Response(buf, { headers: { ...CORS, "Content-Type": type, "Cache-Control": "no-store" } });
  } catch (e) {
    return fail(502, String((e as Error).message || e));
  }
});
