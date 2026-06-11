"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReelMood } from "./ReelCreator";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  images: string[];           // base64 data URLs
  voiceoverData: Uint8Array;  // ElevenLabs audio bytes
  hookText: string;           // HOOK section text (for subtitle)
  mood: ReelMood;             // for background music
  onComplete: (blob: Blob) => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch a URL and return a local blob URL — avoids CORS issues inside workers. */
async function toBlobURL(url: string, mimeType: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  return URL.createObjectURL(new Blob([buf], { type: mimeType }));
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const [, b64] = dataUrl.split(",");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** HOOK text, max 72 chars, FFmpeg-escaped. */
function buildSubtitleText(hookText: string): string {
  const clean = hookText.replace(/\s+/g, " ").trim();
  const truncated = clean.length > 72 ? clean.slice(0, 69) + "..." : clean;
  return truncated
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "’")  // curly apostrophe — safe in drawtext
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VoiceReelCreator({ images, voiceoverData, hookText, mood, onComplete, onError, onCancel }: Props) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("Loading FFmpeg…");
  const cancelled = useRef(false);

  const run = useCallback(async () => {
    cancelled.current = false;
    const ffmpegLogs: string[] = [];

    try {
      // ── 1. Load FFmpeg ─────────────────────────────────────────────────
      setStatusText("Loading FFmpeg…");
      setProgress(3);

      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      if (cancelled.current) return;

      const ffmpeg = new FFmpeg();

      // Capture FFmpeg's internal logs so we can surface real errors
      ffmpeg.on("log", ({ message }) => {
        ffmpegLogs.push(message);
        if (process.env.NODE_ENV === "development") console.log("[ffmpeg]", message);
      });

      const origin   = window.location.origin;
      const coreBase = "https://unpkg.com/@ffmpeg/core@0.12.9/dist/esm";

      // classWorkerURL must be an absolute URL — import.meta.url in the
      // webpack bundle resolves to a file:// path on Vercel, which would
      // corrupt a relative URL inside new URL(relative, import.meta.url).
      await ffmpeg.load({
        classWorkerURL: `${origin}/ffmpeg-esm/worker.js`,
        coreURL:        await toBlobURL(`${coreBase}/ffmpeg-core.js`,   "text/javascript"),
        wasmURL:        await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, "application/wasm"),
      });

      if (cancelled.current) return;

      // ── 2. Load font for subtitle rendering ───────────────────────────
      setStatusText("Loading assets…");
      setProgress(8);

      let hasFontFile = false;
      try {
        const fontResp = await fetch(`${origin}/ffmpeg-esm/font.ttf`);
        if (fontResp.ok) {
          await ffmpeg.writeFile("font.ttf", new Uint8Array(await fontResp.arrayBuffer()));
          hasFontFile = true;
        }
      } catch {
        // Font unavailable — subtitles will be skipped gracefully
      }

      // ── 3. Fetch background music ──────────────────────────────────────
      setStatusText("Fetching music…");
      setProgress(12);

      let audioData: Uint8Array | null = null;
      try {
        const musicRes = await fetch(`/api/music?mood=${encodeURIComponent(mood)}`);
        if (musicRes.ok) audioData = new Uint8Array(await musicRes.arrayBuffer());
      } catch {
        // No music — voice-only reel is still valid
      }

      if (cancelled.current) return;

      // ── 4. Write image + audio files to WASM virtual FS ───────────────
      setStatusText("Preparing photos…");
      setProgress(18);

      const N    = images.length;
      const SECS = Math.max(5, Math.ceil(30 / N));  // ~30s target / N photos
      const FPS       = 25;
      const FRAMES    = FPS * SECS;
      const FADE_SECS = 0.5;

      for (let i = 0; i < N; i++) {
        await ffmpeg.writeFile(`img${i}.jpg`, dataUrlToUint8Array(images[i]));
      }
      // Voice is input index N; music (if present) is index N+1
      // .slice() copies the buffer — the original Uint8Array's ArrayBuffer gets
      // detached after the first postMessage transfer, so we must copy it each run.
      await ffmpeg.writeFile("voice.mp3", voiceoverData.slice());
      if (audioData) await ffmpeg.writeFile("music.mp3", audioData.slice());

      if (cancelled.current) return;

      // ── 5. Build filter_complex ────────────────────────────────────────
      const subtitle = hasFontFile ? buildSubtitleText(hookText) : "";

      const filterParts: string[] = [];

      for (let i = 0; i < N; i++) {
        const isZoomIn = i % 2 === 0;
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
      if (N === 1) {
        filterParts.push(`[v0]null[vmerge]`);
      } else {
        let prevLabel = "v0";
        for (let i = 1; i < N; i++) {
          const offset   = (i * (SECS - FADE_SECS)).toFixed(2);
          const outLabel = i === N - 1 ? "vmerge" : `xt${i}`;
          filterParts.push(
            `[${prevLabel}][v${i}]xfade=transition=fade:duration=${FADE_SECS}:offset=${offset}[${outLabel}]`
          );
          prevLabel = outLabel;
        }
      }

      // Subtitle overlay — only if font loaded successfully
      if (subtitle) {
        filterParts.push(
          `[vmerge]drawtext=` +
          `fontfile=font.ttf:` +
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

      // Add audio filters to the same filter_complex graph
      let audioMapArg: string;
      if (audioData) {
        filterParts.push(
          `[${N}:a]volume=1.0[vo]`,
          `[${N + 1}:a]volume=0.2[mu]`,
          `[vo][mu]amix=inputs=2:duration=first:dropout_transition=2[audio_out]`,
        );
        audioMapArg = "[audio_out]";
      } else {
        audioMapArg = `${N}:a`;
      }

      const filterComplex = filterParts.join("; ");
      const totalDuration = (N * SECS - (N - 1) * FADE_SECS).toFixed(2);

      // Input args: images first, then voice, then optional music
      const inputArgs: string[] = [];
      for (let i = 0; i < N; i++) {
        inputArgs.push("-loop", "1", "-t", String(SECS + 0.1), "-i", `img${i}.jpg`);
      }
      inputArgs.push("-i", "voice.mp3");
      if (audioData) inputArgs.push("-i", "music.mp3");

      const cmd: string[] = [
        ...inputArgs,
        "-filter_complex", filterComplex,
        "-map", "[vout]",
        "-map", audioMapArg,
        "-shortest",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "22",
        "-c:a", "aac",
        "-b:a", "128k",
        "-t", totalDuration,
        "-movflags", "+faststart",
        "-y",
        "output.mp4",
      ];

      // ── 6. Run FFmpeg ──────────────────────────────────────────────────
      setStatusText("Creating your Voice Reel…");
      setProgress(22);

      ffmpeg.on("progress", ({ progress: p }) => {
        if (p >= 0 && p <= 1) {
          const pct = 22 + Math.round(p * 72);
          setProgress(pct);
          setStatusText(`Creating your Voice Reel… ${pct}%`);
        }
      });

      const exitCode = await ffmpeg.exec(cmd);

      if (cancelled.current) return;

      if (exitCode !== 0) {
        const errLine = ffmpegLogs
          .filter(l => /error|invalid|failed|no such/i.test(l))
          .slice(-3)
          .join(" | ");
        throw new Error(
          `FFmpeg exited with code ${exitCode}.${errLine ? " " + errLine : ""}`
        );
      }

      // ── 7. Read output and deliver ────────────────────────────────────
      setStatusText("Finishing…");
      setProgress(97);

      const rawOut = await ffmpeg.readFile("output.mp4") as Uint8Array;
      const plain  = rawOut.buffer.slice(0) as ArrayBuffer;
      const blob   = new Blob([plain], { type: "video/mp4" });

      setProgress(100);
      onComplete(blob);

    } catch (err) {
      if (!cancelled.current) {
        const base  = err instanceof Error ? err.message : String(err);
        const extra = ffmpegLogs.length
          ? "\n\nFFmpeg log:\n" + ffmpegLogs.slice(-6).join("\n")
          : "";
        onError(base + extra);
      }
    }
  }, [images, voiceoverData, hookText, mood, onComplete, onError]);

  useEffect(() => {
    run();
    return () => { cancelled.current = true; };
  }, [run]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4 w-full">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#0F6E56]/10 flex items-center justify-center text-lg select-none shrink-0">
          🎤
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Creating your Voice Reel</p>
          <p className="text-xs text-gray-500 truncate">{statusText}</p>
        </div>
        <button
          onClick={() => { cancelled.current = true; onCancel(); }}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-1.5">
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#0F6E56] rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{progress}% complete</span>
          <span>{images.length} photo{images.length !== 1 ? "s" : ""} &middot; {mood} &middot; Voice</span>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center leading-relaxed">
        FFmpeg is layering your voiceover over the photo slideshow.<br />
        This takes 1&ndash;3 minutes &mdash; please keep this tab open.
      </p>
    </div>
  );
}
