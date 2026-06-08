import { NextResponse } from "next/server";

// Mood → Pixabay search queries (tried across multiple Pixabay API endpoints)
const MOOD_QUERIES: Record<string, string> = {
  Upbeat:   "upbeat happy",
  Calm:     "calm relaxing",
  Romantic: "romantic love",
  Dramatic: "dramatic cinematic",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mood  = searchParams.get("mood")  ?? "Calm";
  const debug = searchParams.get("debug") === "true";

  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "PIXABAY_API_KEY not configured in environment variables." },
      { status: 400 }
    );
  }

  const query = MOOD_QUERIES[mood] ?? MOOD_QUERIES.Calm;

  // ── Try Pixabay music/audio search ──────────────────────────────────────────
  // Pixabay supports music via their standard API with media_type=music.
  // The audio hit objects carry an `audio` field (direct MP3 URL).
  let audioUrl: string | null = null;
  let trackTitle = "Instrumental";

  const endpoints = [
    // Primary: media_type=music (Pixabay's audio search)
    `https://pixabay.com/api/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&media_type=music&per_page=10`,
    // Fallback: no media_type filter, broader search
    `https://pixabay.com/api/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&per_page=10`,
  ];

  let rawDebugData: unknown = null;

  for (const url of endpoints) {
    try {
      const res  = await fetch(url, { next: { revalidate: 3600 } });
      const data = await res.json();

      if (debug) { rawDebugData = data; break; }

      const hits: Record<string, unknown>[] = data.hits ?? [];
      // Only accept hits that have an `audio` field with a URL (not an image hit)
      const musicHits = hits.filter(
        h => typeof h.audio === "string" && (h.audio as string).startsWith("http")
      );

      if (musicHits.length > 0) {
        const track = musicHits[Math.floor(Math.random() * Math.min(musicHits.length, 5))];
        audioUrl   = track.audio as string;
        trackTitle = ((track.tags as string)?.split(",")?.[0]?.trim()) ?? "Instrumental";
        break;
      }
    } catch (err) {
      console.error("Pixabay search error:", err);
    }
  }

  // ── Debug: return raw API response ──────────────────────────────────────────
  if (debug) {
    return NextResponse.json({ query, rawDebugData });
  }

  if (!audioUrl) {
    return NextResponse.json(
      {
        error:   "No audio tracks found on Pixabay for this mood.",
        hint:    "Pixabay's music API may not be enabled for your API key tier. Visit pixabay.com/api/docs/ for details.",
        mood,
      },
      { status: 404 }
    );
  }

  // ── Proxy the audio bytes (avoids browser CORS restrictions) ────────────────
  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) throw new Error(`Audio download failed: ${audioRes.status}`);

    const contentType = audioRes.headers.get("content-type") ?? "audio/mpeg";

    // Reject if Pixabay returned an image instead of audio
    if (contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Pixabay returned an image URL instead of audio — media_type=music may not be supported for this API key." },
        { status: 502 }
      );
    }

    const buffer = await audioRes.arrayBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type":        contentType.includes("audio") ? contentType : "audio/mpeg",
        "Content-Disposition": `inline; filename="music.mp3"`,
        "Cache-Control":       "public, max-age=3600",
        "X-Track-Title":       trackTitle,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: `Failed to proxy audio: ${String(err)}` }, { status: 502 });
  }
}
