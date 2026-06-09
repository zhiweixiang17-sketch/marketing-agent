/**
 * GET /api/debug-env
 *
 * Shows which env vars are configured (never exposes values).
 * Remove this route once everything is working.
 */
export async function GET() {
  const keys = [
    "ANTHROPIC_API_KEY",
    "ELEVENLABS_API_KEY",
    "PIXABAY_API_KEY",
    "JAMENDO_CLIENT_ID",
  ];

  const status = Object.fromEntries(
    keys.map((k) => {
      const val = process.env[k];
      if (!val)           return [k, "❌ missing or empty"];
      if (val.length < 8) return [k, `⚠️ set but very short (${val.length} chars) — possible paste error`];
      return [k, `✅ set (${val.length} chars)`];
    })
  );

  return Response.json(status);
}
