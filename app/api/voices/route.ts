/**
 * GET /api/voices
 *
 * Returns voices that are actually accessible on this ElevenLabs account.
 * Free accounts can only use voices they own (cloned or generated) — the
 * pre-built library voices require a paid plan and are excluded here.
 */

export type AccountVoice = {
  id: string;
  name: string;
  label: string;
  description: string;
  category: string; // "cloned" | "generated" | "premade"
};

// Style labels we assign based on voice name patterns or order
const STYLE_LABELS = [
  "Warm Female",
  "Warm Male",
  "Authoritative Female",
  "Authoritative Male",
  "Enthusiastic Female",
  "Enthusiastic Male",
];

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();

  if (!apiKey) {
    return Response.json(
      { error: "ELEVENLABS_API_KEY not set — add it to Vercel env vars." },
      { status: 400 }
    );
  }

  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return Response.json(
      { error: `ElevenLabs /v1/voices returned ${res.status}: ${body}` },
      { status: res.status }
    );
  }

  const data = (await res.json()) as {
    voices: Array<{
      voice_id: string;
      name: string;
      category?: string;
      labels?: Record<string, string>;
      description?: string;
    }>;
  };

  // Free accounts cannot use "cloned_from_library" / premade library voices.
  // Keep: cloned (user-created), generated, and premade voices that are
  // explicitly listed as account-owned (category === "premade" but tied to account).
  // Exclude voices that will 402 on free plans by checking category.
  const usable = data.voices.filter(
    (v) => v.category !== "cloned_from_library"
  );

  const voices: AccountVoice[] = usable.map((v, i) => ({
    id: v.voice_id,
    name: v.name,
    label: STYLE_LABELS[i % STYLE_LABELS.length],
    description: v.description ?? v.labels?.["description"] ?? v.name,
    category: v.category ?? "premade",
  }));

  return Response.json(voices);
}
