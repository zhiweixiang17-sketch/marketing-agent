/**
 * POST /api/voice
 *
 * Generates a spoken voiceover using macOS built-in TTS (`say` command),
 * converts the AIFF output to MP3 via ffmpeg, and returns the audio bytes.
 *
 * Body: { voiceId: string (macOS voice name), text: string }
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { readFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const execFileAsync = promisify(execFile);

/** Resolve full path to ffmpeg — Node.js child_process doesn't inherit shell PATH. */
function resolveFfmpeg(): string {
  const candidates = [
    "/opt/homebrew/bin/ffmpeg",  // Homebrew on Apple Silicon
    "/usr/local/bin/ffmpeg",     // Homebrew on Intel
    "/usr/bin/ffmpeg",           // system install
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return "ffmpeg"; // last resort — hope it's in PATH
}

const FFMPEG = resolveFfmpeg();

export async function POST(req: Request) {
  const { voiceId, text } = (await req.json()) as { voiceId: string; text: string };

  if (!voiceId || !text?.trim()) {
    return Response.json({ error: "Missing voiceId or text." }, { status: 400 });
  }

  const ts       = Date.now();
  const aiffPath = path.join(tmpdir(), `voiceover-${ts}.aiff`);
  const mp3Path  = path.join(tmpdir(), `voiceover-${ts}.mp3`);

  try {
    // 1. Generate AIFF with macOS say command
    await execFileAsync("say", ["-v", voiceId, "-r", "150", "-o", aiffPath, text]);

    // 2. Convert AIFF → MP3 with system ffmpeg
    await execFileAsync(FFMPEG, [
      "-i",        aiffPath,
      "-codec:a",  "libmp3lame",
      "-qscale:a", "2",
      "-y",
      mp3Path,
    ]);

    const mp3Buffer = readFileSync(mp3Path);

    return new Response(mp3Buffer, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `TTS failed: ${msg}` }, { status: 500 });
  } finally {
    if (existsSync(aiffPath)) try { unlinkSync(aiffPath); } catch { /* ignore */ }
    if (existsSync(mp3Path))  try { unlinkSync(mp3Path);  } catch { /* ignore */ }
  }
}
