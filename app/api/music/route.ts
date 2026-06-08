import { NextResponse } from "next/server";

/**
 * Music API — returns a royalty-free audio track for a given mood.
 *
 * Source: Jamendo (jamendo.com) — the standard free music API for apps.
 * Env var required: JAMENDO_CLIENT_ID
 * Get a free client_id at: https://developer.jamendo.com/v3.0
 * Registration takes ~2 minutes; no credit card required.
 *
 * The audio is proxied through this route so the browser can write it
 * to FFmpeg's virtual filesystem without CORS restrictions.
 */

// Mood → Jamendo tag search terms
const MOOD_TAGS: Record<string, string> = {
  Upbeat:   "happy upbeat pop",
  Calm:     "calm ambient relaxing",
  Romantic: "romantic soft acoustic",
  Dramatic: "dramatic cinematic orchestral",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mood = searchParams.get("mood") ?? "Calm";

  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      {
        error: "JAMENDO_CLIENT_ID not configured.",
        setup: "Get a free client ID at https://developer.jamendo.com/v3.0 (2-min registration) and add it to your Vercel environment variables.",
      },
      { status: 400 }
    );
  }

  const tags = MOOD_TAGS[mood] ?? MOOD_TAGS.Calm;

  // ── Search Jamendo for CC-licensed tracks ─────────────────────────────────
  let audioDownloadUrl: string | null = null;
  let trackName = "Instrumental";

  try {
    const params = new URLSearchParams({
      client_id:          clientId,
      format:             "json",
      limit:              "10",
      tags:               tags,
      audioformat:        "mp31",         // 128 kbps MP3
      audiodlformat:      "mp31",
      include:            "musicinfo",
      order:              "popularity_month",
    });

    const res  = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params}`, {
      next: { revalidate: 3600 },
    });
    const data = await res.json();

    if (data.headers?.status !== "success") {
      throw new Error(`Jamendo API error: ${JSON.stringify(data.headers)}`);
    }

    // Filter to tracks where download is explicitly allowed
    type JamendoTrack = {
      name: string;
      audiodownload: string;
      audiodownload_allowed: boolean;
    };
    const downloadable: JamendoTrack[] = (data.results ?? []).filter(
      (t: JamendoTrack) => t.audiodownload_allowed && t.audiodownload?.startsWith("http")
    );

    if (downloadable.length === 0) {
      // Fall back: use streaming URL even if download flag is false
      const allTracks: JamendoTrack[] = data.results ?? [];
      const track = allTracks[Math.floor(Math.random() * Math.min(allTracks.length, 5))];
      if (track?.audiodownload?.startsWith("http")) {
        audioDownloadUrl = track.audiodownload;
        trackName = track.name;
      }
    } else {
      const pick = downloadable[Math.floor(Math.random() * Math.min(downloadable.length, 5))];
      audioDownloadUrl = pick.audiodownload;
      trackName = pick.name;
    }
  } catch (err) {
    console.error("Jamendo API error:", err);
    return NextResponse.json({ error: `Music API error: ${String(err)}` }, { status: 502 });
  }

  if (!audioDownloadUrl) {
    return NextResponse.json(
      { error: `No ${mood} tracks found on Jamendo. Try a different mood.` },
      { status: 404 }
    );
  }

  // ── Proxy the audio bytes to the browser ─────────────────────────────────
  try {
    const audioRes = await fetch(audioDownloadUrl);
    if (!audioRes.ok) throw new Error(`Audio download failed: ${audioRes.status}`);

    const contentType = audioRes.headers.get("content-type") ?? "audio/mpeg";
    const buffer      = await audioRes.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type":        contentType.includes("audio") ? contentType : "audio/mpeg",
        "Content-Disposition": `inline; filename="music.mp3"`,
        "Cache-Control":       "public, max-age=3600",
        "X-Track-Name":        encodeURIComponent(trackName),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: `Failed to proxy audio: ${String(err)}` }, { status: 502 });
  }
}
