"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReelMood = "Upbeat" | "Calm" | "Romantic" | "Dramatic";

interface Props {
  images: string[];     // base64 data URLs, in order
  caption: string;      // generated caption (shown as subtitle)
  mood: ReelMood;
  onComplete: (blob: Blob) => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const [, b64] = dataUrl.split(",");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** First paragraph of caption, stripped of hashtags, max 72 chars, FFmpeg-escaped. */
function buildSubtitleText(caption: string): string {
  const para = caption.split(/\n\n+/)[0] ?? caption;
  const clean = para.replace(/#\S+/g, "").replace(/\s+/g, " ").trim();
  const truncated = clean.length > 72 ? clean.slice(0, 69) + "..." : clean;
  // Escape characters that break FFmpeg drawtext
  return truncated
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "’")   // replace smart apostrophe (safe in drawtext)
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReelCreator({ images, caption, mood, onComplete, onError, onCancel }: Props) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Loading FFmpeg…");
  const cancelled = useRef(false);

  const run = useCallback(async () => {
    cancelled.current = false;

    try {
      // ── 1. Dynamically load FFmpeg (avoids SSR issues) ─────────────────
      setStatusText("Loading FFmpeg…");
      setProgress(3);

      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { toBlobURL } = await import("@ffmpeg/util");

      if (cancelled.current) return;

      const ffmpeg = new FFmpeg();

      // Single-threaded core — no SharedArrayBuffer / COOP headers needed
      const base = "https://unpkg.com/@ffmpeg/core@0.12.9/dist/esm";
      await ffmpeg.load({
        coreURL:  await toBlobURL(`${base}/ffmpeg-core.js`,   "text/javascript"),
        wasmURL:  await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
      });

      if (cancelled.current) return;

      // ── 2. Fetch background music ──────────────────────────────────────
      setStatusText("Fetching music…");
      setProgress(12);

      let audioData: Uint8Array | null = null;
      try {
        const musicRes = await fetch(`/api/music?mood=${encodeURIComponent(mood)}`);
        if (musicRes.ok) {
          audioData = new Uint8Array(await musicRes.arrayBuffer());
        }
      } catch {
        // No music — create silent reel (still valid)
      }

      if (cancelled.current) return;

      // ── 3. Write all files to WASM virtual FS ─────────────────────────
      setStatusText("Preparing photos…");
      setProgress(18);

      for (let i = 0; i < images.length; i++) {
        await ffmpeg.writeFile(`img${i}.jpg`, dataUrlToUint8Array(images[i]));
      }
      if (audioData) {
        await ffmpeg.writeFile("music.mp3", audioData);
      }

      if (cancelled.current) return;

      // ── 4. Build filter_complex ────────────────────────────────────────
      const FPS       = 25;
      const SECS      = 3;                           // seconds per photo
      const FRAMES    = FPS * SECS;                  // 75 frames per photo
      const FADE_SECS = 0.5;                         // crossfade duration
      const N         = images.length;
      const subtitle  = buildSubtitleText(caption);

      // Per-photo: scale to cover 1080×1920, Ken Burns zoom, set fps+SAR
      const filterParts: string[] = [];

      for (let i = 0; i < N; i++) {
        const isZoomIn = i % 2 === 0;
        // Alternate zoom-in / zoom-out for cinematic variety
        const kenBurns = isZoomIn
          ? `zoompan=z='min(zoom+0.002,1.15)':x='iw*(1-1/zoom)/2':y='ih*(1-1/zoom)/2':d=${FRAMES}:fps=${FPS}:s=1080x1920`
          : `zoompan=z='if(eq(on,1),1.15,max(zoom-0.002,1.0))':x='iw*(1-1/zoom)/2':y='ih*(1-1/zoom)/2':d=${FRAMES}:fps=${FPS}:s=1080x1920`;

        filterParts.push(
          `[${i}:v]` +
          `scale=1080:1920:force_original_aspect_ratio=increase,` +
          `crop=1080:1920,` +
          `format=yuv420p,` +
          `${kenBurns},` +
          `setsar=1` +
          `[v${i}]`
        );
      }

      // Chain xfade transitions between clips
      // xfade offset = index × (SECS − FADE_SECS)
      if (N === 1) {
        filterParts.push(`[v0]null[vmerge]`);
      } else {
        let prevLabel = "v0";
        for (let i = 1; i < N; i++) {
          const offset = (i * (SECS - FADE_SECS)).toFixed(2);
          const outLabel = i === N - 1 ? "vmerge" : `xt${i}`;
          filterParts.push(
            `[${prevLabel}][v${i}]xfade=transition=fade:duration=${FADE_SECS}:offset=${offset}[${outLabel}]`
          );
          prevLabel = outLabel;
        }
      }

      // Burn subtitle text
      if (subtitle) {
        filterParts.push(
          `[vmerge]drawtext=` +
          `text='${subtitle}':` +
          `fontsize=38:fontcolor=white:` +
          `x=(w-text_w)/2:y=h-130:` +
          `box=1:boxcolor=black@0.55:boxborderw=14:` +
          `shadowcolor=black@0.4:shadowx=2:shadowy=2` +
          `[vout]`
        );
      } else {
        filterParts.push(`[vmerge]null[vout]`);
      }

      const filterComplex = filterParts.join("; ");
      const totalDuration = (N * SECS - (N - 1) * FADE_SECS).toFixed(2);

      // Input args — one still image input per photo
      const inputArgs: string[] = [];
      for (let i = 0; i < N; i++) {
        inputArgs.push("-loop", "1", "-t", String(SECS + 0.1), "-i", `img${i}.jpg`);
      }
      if (audioData) inputArgs.push("-i", "music.mp3");

      // Fade-out the audio 1.5 s before the end
      const audioFadeStart = Math.max(0, parseFloat(totalDuration) - 1.5);

      const cmd: string[] = [
        ...inputArgs,
        "-filter_complex", filterComplex,
        "-map", "[vout]",
        ...(audioData
          ? ["-map", `${N}:a`, "-shortest",
             "-af", `afade=type=out:st=${audioFadeStart.toFixed(2)}:d=1.5`,
             "-c:a", "aac", "-b:a", "128k"]
          : []),
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "22",
        "-t", totalDuration,
        "-movflags", "+faststart",
        "-y",
        "output.mp4",
      ];

      // ── 5. Run FFmpeg with progress tracking ─────────────────────────
      setStatusText("Creating your Reel…");
      setProgress(22);

      ffmpeg.on("progress", ({ progress: p }) => {
        if (p >= 0 && p <= 1) {
          const pct = 22 + Math.round(p * 72);  // 22% → 94%
          setProgress(pct);
          setStatusText(`Creating your Reel… ${pct}%`);
        }
      });

      await ffmpeg.exec(cmd);

      if (cancelled.current) return;

      // ── 6. Read output and deliver ────────────────────────────────────
      setStatusText("Finishing…");
      setProgress(97);

      const rawOut = await ffmpeg.readFile("output.mp4") as Uint8Array;
      // Copy buffer to plain ArrayBuffer to satisfy TypeScript / Blob constructor
      const plain = rawOut.buffer.slice(0) as ArrayBuffer;
      const blob = new Blob([plain], { type: "video/mp4" });

      setProgress(100);
      onComplete(blob);

    } catch (err) {
      if (!cancelled.current) {
        onError(err instanceof Error ? err.message : String(err));
      }
    }
  }, [images, caption, mood, onComplete, onError]);

  useEffect(() => {
    run();
    return () => { cancelled.current = true; };
  }, [run]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4 w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#0F6E56]/10 flex items-center justify-center text-lg select-none shrink-0">
          🎬
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Creating your Reel</p>
          <p className="text-xs text-gray-500 truncate">{statusText}</p>
        </div>
        <button
          onClick={() => { cancelled.current = true; onCancel(); }}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0"
        >
          Cancel
        </button>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#0F6E56] rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{progress}% complete</span>
          <span>{images.length} photo{images.length !== 1 ? "s" : ""} · {mood}</span>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center leading-relaxed">
        ⏳ FFmpeg is stitching your photos with Ken Burns effects.<br />
        This takes 1–3 minutes — please keep this tab open.
      </p>
    </div>
  );
}
