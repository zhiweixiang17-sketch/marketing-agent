import { NextResponse } from "next/server";

/**
 * Music API — returns a royalty-free audio track for a given mood.
 *
 * Primary source:  Jamendo (jamendo.com) — requires JAMENDO_CLIENT_ID env var.
 *                  Free registration at https://developer.jamendo.com/v3.0 (~2 min).
 *
 * Fallback source: ccMixter (ccmixter.org) — CC-licensed music, no API key needed.
 *                  Used automatically when JAMENDO_CLIENT_ID is not set.
 *
 * Audio is proxied through this route so the browser can write it into FFmpeg's
 * virtual filesystem without any CORS issues.
 */

// ── Mood tag maps ─────────────────────────────────────────────────────────────

const JAMENDO_TAGS: Record<string, string> = {
  Upbeat:   "happy upbeat pop",
  Calm:     "calm ambient relaxing",
  Romantic: "romantic soft acoustic",
  Dramatic: "dramatic cinematic orchestral",
};

// ccMixter works best with a single tag keyword
const CCMIXTER_TAGS: Record<string, string> = {
  Upbeat:   "upbeat",
  Calm:     "ambient",
  Romantic: "romantic",
  Dramatic: "cinematic",
};

// ── Jamendo ───────────────────────────────────────────────────────────────────

async function fetchFromJamendo(
  mood: string,
  clientId: string
): Promise<{ url: string; name: string } | null> {
  const tags = JAMENDO_TAGS[mood] ?? JAMENDO_TAGS.Calm;

  const params = new URLSearchParams({
    client_id:     clientId,
    format:        "json",
    limit:         "10",
    tags:          tags,
    audioformat:   "mp31",
    audiodlformat: "mp31",
    include:       "musicinfo",
    order:         "popularity_month",
  });

  const res  = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params}`, {
    next: { revalidate: 3600 },
  });
  const data = await res.json();

  if (data.headers?.status !== "success") {
    throw new Error(`Jamendo API error: ${JSON.stringify(data.headers)}`);
  }

  type JamendoTrack = { name: string; audiodownload: string; audiodownload_allowed: boolean };
  const results: JamendoTrack[] = data.results ?? [];

  const downloadable = results.filter(
    t => t.audiodownload_allowed && t.audiodownload?.startsWith("http")
  );
  const pool = downloadable.length > 0 ? downloadable : results;
  const pick = pool[Math.floor(Math.random() * Math.min(pool.length, 5))];

  return pick?.audiodownload?.startsWith("http")
    ? { url: pick.audiodownload, name: pick.name }
    : null;
}

// ── ccMixter (zero-config fallback) ──────────────────────────────────────────

async function fetchFromCcMixter(
  mood: string
): Promise<{ url: string; name: string } | null> {
  const tag = CCMIXTER_TAGS[mood] ?? CCMIXTER_TAGS.Calm;

  const params = new URLSearchParams({
    f:      "json",
    tags:   tag,
    limit:  "20",
    offset: String(Math.floor(Math.random() * 40)),  // random page for variety
  });

  const res = await fetch(`https://ccmixter.org/api/query?${params}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;

  type CcMixterFile = { download_url?: string; file_format?: string };
  type CcMixterTrack = { upload_name?: string; files?: CcMixterFile[] };

  const tracks: CcMixterTrack[] = await res.json();
  if (!Array.isArray(tracks) || tracks.length === 0) return null;

  // Shuffle and pick the first track that has an MP3 download URL
  const shuffled = tracks.sort(() => Math.random() - 0.5);
  for (const track of shuffled) {
    const mp3 = (track.files ?? []).find(
      f => f.download_url && (f.file_format === "mp3" || f.download_url.includes(".mp3"))
    );
    if (mp3?.download_url) {
      return { url: mp3.download_url, name: track.upload_name ?? "ccMixter track" };
    }
  }

  return null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mood = searchParams.get("mood") ?? "Calm";

  let audioUrl: string | null  = null;
  let trackName                = "Instrumental";
  let source                   = "unknown";

  // ── 1. Try Jamendo (higher quality, mood-matched) ─────────────────────────
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (clientId) {
    try {
      const result = await fetchFromJamendo(mood, clientId);
      if (result) {
        audioUrl  = result.url;
        trackName = result.name;
        source    = "jamendo";
      }
    } catch (err) {
      console.error("[music] Jamendo error:", err);
    }
  }

  // ── 2. Fall back to ccMixter (no API key needed) ──────────────────────────
  if (!audioUrl) {
    try {
      const result = await fetchFromCcMixter(mood);
      if (result) {
        audioUrl  = result.url;
        trackName = result.name;
        source    = "ccmixter";
      }
    } catch (err) {
      console.error("[music] ccMixter error:", err);
    }
  }

  if (!audioUrl) {
    return NextResponse.json(
      {
        error: `No ${mood} tracks found.`,
        tip: !clientId
          ? "Add JAMENDO_CLIENT_ID to Vercel env vars for curated music. Free registration at https://developer.jamendo.com/v3.0"
          : "Try a different mood.",
      },
      { status: 404 }
    );
  }

  // ── 3. Proxy audio bytes back to the browser ──────────────────────────────
  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) throw new Error(`Audio download failed: ${audioRes.status}`);

    const contentType = audioRes.headers.get("content-type") ?? "audio/mpeg";
    const buffer      = await audioRes.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type":        contentType.includes("audio") ? contentType : "audio/mpeg",
        "Content-Disposition": `inline; filename="music.mp3"`,
        "Cache-Control":       "public, max-age=3600",
        "X-Track-Name":        encodeURIComponent(trackName),
        "X-Music-Source":      source,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to proxy audio: ${String(err)}` },
      { status: 502 }
    );
  }
}
