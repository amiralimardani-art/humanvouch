// Verify a Cloudflare Turnstile token server-side (real anti-bot human check).
// Reads CF_TURNSTILE_SECRET from the environment (see .env.example). Without it,
// falls back to Turnstile's public TEST secret (always passes) so the demo works
// with no signup; set a real key in production.
const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
const TURNSTILE_SECRET = process.env.CF_TURNSTILE_SECRET || TURNSTILE_TEST_SECRET;

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}));
  const token = (body as any)?.token;
  if (!token) {
    setResponseStatus(event, 400);
    return { success: false, error: "missing token" };
  }
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: TURNSTILE_SECRET, response: token }),
  });
  const data: any = await res.json();
  return { success: !!data.success, errors: data["error-codes"] ?? [] };
});
