import { NextResponse } from "next/server";

// Mood → Pixabay API search query
const MOOD_QUERIES: Record<string, string> = {
  Upbeat:   "upbeat happy energetic",
  Calm:     "calm relaxing ambient",
  Romantic: "romantic soft love",
  Dramatic: "dramatic cinematic epic",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mood = searchParams.get("mood") ?? "Calm";

  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "PIXABAY_API_KEY not configured in environment variables." },
      { status: 400 }
    );
  }

  const query = MOOD_QUERIES[mood] ?? MOOD_QUERIES.Calm;

  // ── Search Pixabay for music ─────────────────────────────────────────────────
  let audioUrl: string | null = null;
  let trackTitle = "Instrumental";

  try {
    const searchRes = await fetch(
      `https://pixabay.com/api/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&media_type=music&per_page=10&safesearch=true`,
      { next: { revalidate: 3600 } }
    );
    const data = await searchRes.json();

    if (data.hits?.length > 0) {
      // Pick a track from first 5 results (some variety)
      const idx = Math.floor(Math.random() * Math.min(data.hits.length, 5));
      const track = data.hits[idx];
      audioUrl = track.audio ?? track.largeImageURL ?? null; // Pixabay audio field
      trackTitle = (track.tags?.split(",")?.[0]?.trim()) ?? "Instrumental";
    }
  } catch (err) {
    console.error("Pixabay search error:", err);
  }

  if (!audioUrl) {
    return NextResponse.json(
      { error: "No music tracks found for this mood. Add PIXABAY_API_KEY to .env.local." },
      { status: 404 }
    );
  }

  // ── Proxy the audio bytes to the browser (avoids CORS issues) ───────────────
  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) throw new Error(`Audio fetch ${audioRes.status}`);

    const contentType = audioRes.headers.get("content-type") ?? "audio/mpeg";
    const buffer = await audioRes.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="music.mp3"`,
        "Cache-Control": "public, max-age=3600",
        "X-Track-Title": trackTitle,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: `Failed to fetch audio: ${String(err)}` }, { status: 502 });
  }
}
