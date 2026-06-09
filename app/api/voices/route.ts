/**
 * GET /api/voices
 *
 * Returns the six configured library voices.
 * When ELEVENLABS_API_KEY is set, verifies each voice ID exists on the account
 * and falls back gracefully if the API is unreachable.
 */

import { VOICE_LIBRARY } from "@/voices.config";

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  // No API key — return hardcoded library immediately
  if (!apiKey) {
    return Response.json(VOICE_LIBRARY);
  }

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
      next: { revalidate: 3600 },
    });

    if (!res.ok) throw new Error(`ElevenLabs returned ${res.status}`);

    const data = (await res.json()) as {
      voices: Array<{ voice_id: string; name: string }>;
    };

    // Build a set of voice IDs available on this account
    const available = new Set(data.voices.map((v) => v.voice_id));

    // Return our config list, marking voices not found on this account
    return Response.json(
      VOICE_LIBRARY.map((v) => ({
        ...v,
        available: available.has(v.id),
      }))
    );
  } catch {
    // Any error → fall back to hardcoded list
    return Response.json(VOICE_LIBRARY);
  }
}
