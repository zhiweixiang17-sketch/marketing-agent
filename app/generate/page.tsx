"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReelMood } from "./ReelCreator";
import { VOICE_SAMPLE_TEXT } from "@/voices.config";
import type { AccountVoice } from "@/app/api/voices/route";

// Lazy-load the heavy FFmpeg components (only downloaded when used)
const ReelCreator = dynamic(() => import("./ReelCreator"), { ssr: false });
const VoiceReelCreator = dynamic(() => import("./VoiceReelCreator"), { ssr: false });

// ── Constants & types ─────────────────────────────────────────────────────────

const FORMATS = [
  { value: "feed post",   label: "Feed Post"   },
  { value: "reel",        label: "Reel"         },
  { value: "story",       label: "Story"        },
  { value: "reel script", label: "Reel Script"  },
  { value: "voice-reel",  label: "Voice Reel"   },
] as const;

type Format = (typeof FORMATS)[number]["value"];
const PLATFORMS = ["Instagram", "Facebook", "both"] as const;
type Platform = (typeof PLATFORMS)[number];

// Only Feed Post and Reel generate two versions for "Both"
const BOTH_COMPATIBLE = new Set<Format>(["feed post", "reel"]);

// These formats always route through /review for section editing
const NEEDS_REVIEW_FORMATS = new Set<Format>(["story", "reel script", "voice-reel"]);

const MOODS: { value: ReelMood; label: string; emoji: string }[] = [
  { value: "Upbeat",   label: "Upbeat",   emoji: "🎉" },
  { value: "Calm",     label: "Calm",     emoji: "🌿" },
  { value: "Romantic", label: "Romantic", emoji: "🌹" },
  { value: "Dramatic", label: "Dramatic", emoji: "🎭" },
];

type Phase = "idle" | "generating" | "done";

// ── Section parsing helpers ───────────────────────────────────────────────────

function parseGenericSections(text: string, keys: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  keys.forEach(k => result[k] = "");
  let current: string | null = null;
  let buf: string[] = [];
  for (const line of text.split("\n")) {
    const up = line.trim().toUpperCase();
    if (keys.includes(up)) {
      if (current !== null) result[current] = buf.join("\n").trim();
      current = up;
      buf = [];
    } else if (current !== null) {
      buf.push(line);
    }
  }
  if (current !== null) result[current] = buf.join("\n").trim();
  return result;
}

// LIBRARY_VOICES now lives in voices.config.ts — imported above

// Reel Script sections (Feature 2)
const REEL_KEYS = ["HOOK", "SCRIPT", "ON-SCREEN TEXT", "CTA"] as const;
type ReelKey = (typeof REEL_KEYS)[number];
const REEL_META = [
  { key: "HOOK" as ReelKey,           label: "Hook",          icon: "🪝", hint: "First 3 seconds" },
  { key: "SCRIPT" as ReelKey,         label: "Script",         icon: "🎙️", hint: "Voiceover"       },
  { key: "ON-SCREEN TEXT" as ReelKey, label: "On-screen Text", icon: "📺", hint: "Overlays"         },
  { key: "CTA" as ReelKey,            label: "CTA",            icon: "👋", hint: "Call to action"   },
];

function parseReelScript(text: string): Record<ReelKey, string> {
  return parseGenericSections(text, REEL_KEYS) as Record<ReelKey, string>;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin text-[#0F6E56] ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

async function compressImage(dataUrl: string, maxDim = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });
}

// ── Photo thumbnail row with drag-to-reorder ─────────────────────────────────

function ThumbnailRow({ images, onRemove, onReorder }: {
  images: string[];
  onRemove: (idx: number) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const [dragIdx, setDragIdx]         = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  function handleDragStart(e: React.DragEvent, idx: number) {
    e.dataTransfer.effectAllowed = "move";
    setDragIdx(idx);
  }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (idx !== dragIdx) setDragOverIdx(idx);
  }
  function handleDrop(e: React.DragEvent, toIdx: number) {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== toIdx) onReorder(dragIdx, toIdx);
    setDragIdx(null); setDragOverIdx(null);
  }
  function handleDragEnd() { setDragIdx(null); setDragOverIdx(null); }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {images.map((img, idx) => (
        <div
          key={idx}
          draggable
          onDragStart={(e) => handleDragStart(e, idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDrop={(e) => handleDrop(e, idx)}
          onDragEnd={handleDragEnd}
          className={`relative group shrink-0 w-16 h-16 rounded-xl overflow-hidden cursor-grab border-2 transition-all select-none ${
            dragIdx === idx ? "opacity-40 scale-95" : ""
          } ${dragOverIdx === idx && dragIdx !== idx ? "border-[#0F6E56] ring-2 ring-[#0F6E56]/20" : "border-transparent"}`}
        >
          <img src={img} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" draggable={false} />
          {/* Cover badge (bottom bar) / number badge (top-left) */}
          {idx === 0 ? (
            <span className="absolute bottom-0 inset-x-0 text-[8px] font-bold uppercase tracking-wider bg-[#0F6E56]/90 text-white text-center py-0.5">
              Cover
            </span>
          ) : (
            <span className="absolute top-0.5 left-0.5 text-[9px] font-bold bg-black/55 text-white px-1 py-0.5 rounded leading-none">
              {idx + 1}
            </span>
          )}
          {/* Remove button */}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(idx); }}
            className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 hover:bg-black/85 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
          >
            <svg width="6" height="6" viewBox="0 0 6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M1 1l4 4M5 1L1 5" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Unified media upload (multi-photo OR video) ───────────────────────────────

function MediaUpload({ images, videoFile, videoObjectUrl, onAddImages, onRemoveImage, onReorderImages, onVideo, onClearMedia }: {
  images: string[];
  videoFile: File | null;
  videoObjectUrl: string | null;
  onAddImages: (next: string[]) => void;
  onRemoveImage: (idx: number) => void;
  onReorderImages: (from: number, to: number) => void;
  onVideo: (file: File, url: string) => void;
  onClearMedia: () => void;
}) {
  const [dragging, setDragging]       = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function processFiles(rawFiles: FileList | File[]) {
    const files = Array.from(rawFiles);
    // If a video is dropped/selected and no images exist yet, treat as video upload
    const videoCandidate = files.find(
      f => f.type.startsWith("video/") || /\.(mp4|mov|m4v|avi|webm|mkv)$/i.test(f.name)
    );
    if (videoCandidate && images.length === 0) {
      if (videoCandidate.size > 100 * 1024 * 1024) { setError("Please choose a video under 100 MB."); return; }
      setError(null);
      onVideo(videoCandidate, URL.createObjectURL(videoCandidate));
      return;
    }

    const imgFiles = files.filter(f => f.type.startsWith("image/"));
    if (imgFiles.length === 0) { setError("Please upload image or video files."); return; }

    const remaining = 10 - images.length;
    if (remaining <= 0) { setError("Maximum 10 photos reached."); return; }
    const toProcess = imgFiles.slice(0, remaining);
    if (imgFiles.length > remaining) {
      setError(`Max 10 photos — only the first ${remaining} will be added.`);
    } else {
      setError(null);
    }

    setCompressing(true);
    const compressed = await Promise.all(
      toProcess.map(file => new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => resolve(await compressImage(e.target?.result as string));
        reader.readAsDataURL(file);
      }))
    );
    onAddImages(compressed);
    setCompressing(false);
  }

  // ── Video preview ──
  if (videoObjectUrl && videoFile) {
    return (
      <div className="rounded-xl overflow-hidden border border-gray-200">
        <video src={videoObjectUrl} className="w-full max-h-52 bg-black" controls muted playsInline />
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-200">
          <span className="text-xs text-gray-500 truncate mr-2">{videoFile.name}</span>
          <button onClick={onClearMedia} className="text-xs text-red-500 hover:text-red-700 shrink-0">Remove</button>
        </div>
      </div>
    );
  }

  // ── Photo grid + add-more zone ──
  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <ThumbnailRow images={images} onRemove={onRemoveImage} onReorder={onReorderImages} />
      )}

      {error && (
        <p className="text-xs text-red-500 flex items-start gap-1">
          <span className="shrink-0">⚠</span>{error}
        </p>
      )}

      {images.length < 10 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); processFiles(e.dataTransfer.files); }}
          onClick={() => !compressing && inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl text-center cursor-pointer transition-all ${
            images.length > 0 ? "py-3" : "py-6"
          } ${dragging ? "border-[#0F6E56] bg-[#E8F5F1]" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"} ${
            compressing ? "cursor-wait" : ""
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*,.mp4,.mov,.m4v"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files) processFiles(e.target.files); e.target.value = ""; }}
          />
          {compressing ? (
            <div className="flex items-center justify-center gap-2 px-4">
              <Spinner className="h-4 w-4" /><span className="text-sm text-gray-500">Optimising…</span>
            </div>
          ) : images.length > 0 ? (
            <p className="text-sm font-medium text-[#0F6E56] px-4">
              + Add more photos <span className="text-gray-400 font-normal">({images.length}/10)</span>
            </p>
          ) : (
            <div className="flex flex-col items-center gap-2 px-4">
              <div className="flex gap-2 text-gray-300">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
                </svg>
                <span className="text-gray-200 text-xl leading-6">·</span>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500">Photos or video · drag & drop or click</p>
              <p className="text-xs text-gray-400">Up to 10 photos · JPG PNG HEIC · 20 MB each<br/>or 1 video · MP4 MOV · 100 MB</p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-center">
          <p className="text-xs text-gray-500">10 photos added — maximum reached.</p>
        </div>
      )}
    </div>
  );
}

// ── Preview components ────────────────────────────────────────────────────────

// Reel Script preview (Feature 2 — unchanged)
function ReelScriptPreview({ content, phase }: { content: string; phase: Phase }) {
  const sections = parseReelScript(content);
  const lastFilledIdx = REEL_META.reduce((acc, m, i) => (sections[m.key] ? i : acc), -1);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-md overflow-hidden w-full">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#0F6E56]/10 flex items-center justify-center text-lg select-none">🎬</div>
        <div className="flex-1"><p className="text-sm font-semibold text-gray-900">Reel Script</p><p className="text-xs text-gray-400">15–30 second video</p></div>
        {phase === "generating" && <Spinner className="h-4 w-4" />}
      </div>
      <div className="divide-y divide-gray-100">
        {REEL_META.map(({ key, label, icon, hint }, i) => {
          const text = sections[key];
          const showCursor = phase === "generating" && i === lastFilledIdx;
          return (
            <div key={key} className="px-5 py-4">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-sm select-none">{icon}</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</span>
                <span className="text-xs text-gray-300 mx-0.5">·</span>
                <span className="text-xs text-gray-400">{hint}</span>
              </div>
              {text ? (
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {text}{showCursor && <span className="inline-block w-0.5 h-4 bg-[#0F6E56] ml-0.5 animate-pulse align-middle" />}
                </p>
              ) : <p className="text-sm text-gray-300 italic">{phase === "idle" ? "—" : "Generating…"}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Voice Reel keys and meta
const VOICE_REEL_KEYS = ["HOOK", "INTRO", "CTA"] as const;
type VoiceReelKey = (typeof VOICE_REEL_KEYS)[number];
const VOICE_REEL_META = [
  { key: "HOOK"  as VoiceReelKey, label: "Hook",         icon: "🎣", hint: "0-3 sec · punchy opener"    },
  { key: "INTRO" as VoiceReelKey, label: "Introduction", icon: "🎙️", hint: "3-20 sec · warm story"       },
  { key: "CTA"   as VoiceReelKey, label: "Call to Action", icon: "👋", hint: "20-30 sec · soft invitation" },
];

function parseVoiceReelScript(text: string): Record<VoiceReelKey, string> {
  return parseGenericSections(text, VOICE_REEL_KEYS) as Record<VoiceReelKey, string>;
}

function VoiceReelScriptPreview({ content, phase }: { content: string; phase: Phase }) {
  const voiceSections = parseVoiceReelScript(content);
  const lastFilledIdx = VOICE_REEL_META.reduce((acc, m, i) => (voiceSections[m.key] ? i : acc), -1);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-md overflow-hidden w-full">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#0F6E56]/10 flex items-center justify-center text-lg select-none">🎤</div>
        <div className="flex-1"><p className="text-sm font-semibold text-gray-900">Voice Reel Script</p><p className="text-xs text-gray-400">30-second voiceover</p></div>
        {phase === "generating" && <Spinner className="h-4 w-4" />}
      </div>
      <div className="divide-y divide-gray-100">
        {VOICE_REEL_META.map(({ key, label, icon, hint }, i) => {
          const text = voiceSections[key];
          const showCursor = phase === "generating" && i === lastFilledIdx;
          return (
            <div key={key} className="px-5 py-4">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-sm select-none">{icon}</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</span>
                <span className="text-xs text-gray-300 mx-0.5">·</span>
                <span className="text-xs text-gray-400">{hint}</span>
              </div>
              {text ? (
                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {text}{showCursor && <span className="inline-block w-0.5 h-4 bg-[#0F6E56] ml-0.5 animate-pulse align-middle" />}
                </p>
              ) : <p className="text-sm text-gray-300 italic">{phase === "idle" ? "—" : "Generating…"}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Story preview (phone-frame style)
function StoryPreview({ content, phase }: { content: string; phase: Phase }) {
  const sections = parseGenericSections(content, ["TEXT", "POLL"]);
  const text = sections["TEXT"];
  const poll = sections["POLL"];
  return (
    <div className="w-full max-w-[200px] mx-auto">
      <div className="relative bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 rounded-2xl shadow-md overflow-hidden flex flex-col" style={{ aspectRatio: "9/16" }}>
        {/* Progress bars */}
        <div className="flex gap-1 px-3 pt-3 shrink-0">
          {[0, 1, 2].map(i => <div key={i} className={`h-0.5 flex-1 rounded-full ${i === 0 ? "bg-white/80" : "bg-white/30"}`} />)}
        </div>
        {/* Profile row */}
        <div className="flex items-center gap-2 px-3 py-2 shrink-0">
          <div className="w-5 h-5 rounded-full bg-white/30" />
          <span className="text-white text-[10px] font-medium opacity-80">yourbusiness</span>
        </div>
        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 gap-3">
          {text ? (
            <p className="text-white text-base font-bold text-center drop-shadow leading-tight">
              {text}
              {phase === "generating" && !poll && <span className="inline-block w-0.5 h-5 bg-white ml-1 animate-pulse align-middle" />}
            </p>
          ) : (
            <p className="text-white/40 text-xs text-center italic">
              {phase === "generating" ? "Writing…" : "Story text here"}
            </p>
          )}
          {poll && (
            <div className="w-full bg-white/25 backdrop-blur-sm rounded-xl overflow-hidden text-center">
              {poll.split("\n").filter(Boolean).map((line, i) => (
                <div key={i} className={`px-3 py-1.5 text-white text-[10px] font-medium ${i > 0 ? "border-t border-white/20" : ""}`}>
                  {line}
                  {phase === "generating" && i === poll.split("\n").filter(Boolean).length - 1 && (
                    <span className="inline-block w-0.5 h-3 bg-white ml-0.5 animate-pulse align-middle" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Reel post preview (video player + caption)
function ReelPostPreview({ content, brandName, phase, videoObjectUrl }: {
  content: string; brandName: string; phase: Phase; videoObjectUrl: string | null;
}) {
  const username = brandName.toLowerCase().replace(/\s+/g, "");
  const initial = brandName[0]?.toUpperCase() ?? "B";
  const parts = content.split(/\n\n+/);
  const lastPart = parts[parts.length - 1] ?? "";
  const hasHashtags = lastPart.trim().startsWith("#");
  const caption = hasHashtags ? parts.slice(0, -1).join("\n\n") || content : content;
  const hashtags = hasHashtags ? lastPart : "";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-md overflow-hidden w-full max-w-sm">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <div className="w-8 h-8 rounded-full bg-[#0F6E56] flex items-center justify-center text-white text-xs font-bold shrink-0">{initial}</div>
        <p className="text-sm font-semibold text-gray-900 flex-1">{username}</p>
        <button className="text-gray-400 text-lg">···</button>
      </div>
      {videoObjectUrl ? (
        <video src={videoObjectUrl} className="w-full max-h-52 object-cover bg-black" autoPlay muted loop playsInline />
      ) : (
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 aspect-video flex flex-col items-center justify-center gap-2">
          {phase === "generating" && !content
            ? <Spinner className="h-6 w-6 text-white" />
            : <>
                <svg className="w-9 h-9 text-white/20" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <p className="text-white/25 text-xs">Upload a video to preview</p>
              </>
          }
        </div>
      )}
      <div className="px-4 py-3">
        {!content && phase !== "generating" ? (
          <p className="text-sm text-gray-300 italic">Reel caption will appear here…</p>
        ) : (
          <>
            <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
              <span className="font-semibold">{username} </span>{caption}
              {phase === "generating" && <span className="inline-block w-0.5 h-4 bg-[#0F6E56] ml-0.5 animate-pulse align-middle" />}
            </p>
            {hashtags && <p className="text-sm text-[#0F6E56] mt-1.5">{hashtags}</p>}
          </>
        )}
      </div>
    </div>
  );
}

// Both-platforms preview (raw streamed text)
function BothPlatformsPreview({ content, phase }: { content: string; phase: Phase }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-md overflow-hidden w-full">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#0F6E56]/10 flex items-center justify-center text-lg select-none">🌐</div>
        <div className="flex-1"><p className="text-sm font-semibold text-gray-900">Both Versions</p><p className="text-xs text-gray-400">Instagram + Facebook</p></div>
        {phase === "generating" && <Spinner className="h-4 w-4" />}
      </div>
      <div className="px-5 py-5">
        {!content && phase !== "generating" ? (
          <p className="text-sm text-gray-300 italic">Instagram and Facebook versions will stream here…</p>
        ) : (
          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-mono">
            {content}
            {phase === "generating" && <span className="inline-block w-0.5 h-4 bg-[#0F6E56] ml-0.5 animate-pulse align-middle" />}
          </p>
        )}
      </div>
    </div>
  );
}

// Instagram post preview (feed post fallback)
function InstagramPreview({ content, brandName, phase, imageDataUrl }: {
  content: string; brandName: string; phase: Phase; imageDataUrl: string | null;
}) {
  const username = brandName.toLowerCase().replace(/\s+/g, "");
  const initial = brandName[0]?.toUpperCase() ?? "B";
  const parts = content.split(/\n\n+/);
  const lastPart = parts[parts.length - 1] ?? "";
  const hasHashtags = lastPart.trim().startsWith("#");
  const caption = hasHashtags ? parts.slice(0, -1).join("\n\n") || content : content;
  const hashtags = hasHashtags ? lastPart : "";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-md overflow-hidden w-full max-w-sm">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <div className="w-9 h-9 rounded-full bg-[#0F6E56] flex items-center justify-center text-white text-sm font-bold shrink-0">{initial}</div>
        <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-900 truncate">{username}</p><p className="text-xs text-gray-400">Sponsored</p></div>
        <button className="text-gray-400 text-xl leading-none px-1">···</button>
      </div>
      {imageDataUrl ? (
        <img src={imageDataUrl} alt="" className="w-full aspect-square object-cover" />
      ) : (
        <div className="bg-gradient-to-br from-[#0F6E56] via-[#1a8a6d] to-[#0A5A45] aspect-square flex items-center justify-center">
          {phase === "idle" ? (
            <p className="text-white/40 text-sm px-8 text-center">Upload a photo or generate a caption</p>
          ) : phase === "generating" && !content ? (
            <div className="flex flex-col items-center gap-3">
              <Spinner className="h-6 w-6 text-white" />
              <p className="text-white/80 text-sm font-medium">Writing your post…</p>
            </div>
          ) : <span className="text-7xl select-none">🍷</span>}
        </div>
      )}
      <div className="px-4 py-3 flex items-center gap-4 text-gray-800">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" /></svg>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
        <div className="ml-auto"><svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg></div>
      </div>
      <div className="px-4 pb-5">
        {!content && phase !== "generating" ? (
          <p className="text-sm text-gray-300 italic">Caption will appear here…</p>
        ) : (
          <>
            <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
              <span className="font-semibold">{username} </span>{caption}
              {phase === "generating" && <span className="inline-block w-0.5 h-4 bg-[#0F6E56] ml-0.5 animate-pulse align-middle" />}
            </p>
            {hashtags && <p className="text-sm text-[#0F6E56] mt-2 leading-relaxed">{hashtags}</p>}
          </>
        )}
      </div>
    </div>
  );
}

// Gallery preview (multi-photo, Instagram carousel-style)
function GalleryPreview({ images, content, brandName, phase }: {
  images: string[]; content: string; brandName: string; phase: Phase;
}) {
  const [current, setCurrent] = useState(0);
  const clampedCurrent = Math.min(current, images.length - 1);
  const username = brandName.toLowerCase().replace(/\s+/g, "");
  const initial = brandName[0]?.toUpperCase() ?? "B";
  const parts = content.split(/\n\n+/);
  const lastPart = parts[parts.length - 1] ?? "";
  const hasHashtags = lastPart.trim().startsWith("#");
  const caption = hasHashtags ? parts.slice(0, -1).join("\n\n") || content : content;
  const hashtags = hasHashtags ? lastPart : "";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-md overflow-hidden w-full max-w-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <div className="w-9 h-9 rounded-full bg-[#0F6E56] flex items-center justify-center text-white text-sm font-bold shrink-0">{initial}</div>
        <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-900 truncate">{username}</p><p className="text-xs text-gray-400">Sponsored</p></div>
        <button className="text-gray-400 text-xl leading-none px-1">···</button>
      </div>
      {/* Photo carousel */}
      <div className="relative aspect-square overflow-hidden bg-gray-100">
        {images[clampedCurrent] && (
          <img src={images[clampedCurrent]} alt="" className="w-full h-full object-cover select-none" draggable={false} />
        )}
        {/* Prev arrow */}
        {clampedCurrent > 0 && (
          <button onClick={() => setCurrent(c => c - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/80 shadow-md flex items-center justify-center hover:bg-white transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}
        {/* Next arrow */}
        {clampedCurrent < images.length - 1 && (
          <button onClick={() => setCurrent(c => c + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/80 shadow-md flex items-center justify-center hover:bg-white transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
        {/* Dot indicators */}
        {images.length > 1 && (
          <div className="absolute bottom-2.5 left-0 right-0 flex justify-center gap-1.5">
            {images.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === clampedCurrent ? "bg-white" : "bg-white/40"}`}
              />
            ))}
          </div>
        )}
      </div>
      {/* Action row */}
      <div className="px-4 py-3 flex items-center gap-4 text-gray-800">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" /></svg>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" /></svg>
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
        <div className="ml-auto"><svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" /></svg></div>
      </div>
      {/* Caption */}
      <div className="px-4 pb-5">
        {!content && phase !== "generating" ? (
          <p className="text-sm text-gray-300 italic">Caption will appear here…</p>
        ) : (
          <>
            <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
              <span className="font-semibold">{username} </span>{caption}
              {phase === "generating" && <span className="inline-block w-0.5 h-4 bg-[#0F6E56] ml-0.5 animate-pulse align-middle" />}
            </p>
            {hashtags && <p className="text-sm text-[#0F6E56] mt-2 leading-relaxed">{hashtags}</p>}
          </>
        )}
      </div>
    </div>
  );
}

// ── Reel + Voiceover combined preview ─────────────────────────────────────────

function parseReelWithVoice(text: string): { caption: string; voiceover: string } {
  const result = { caption: "", voiceover: "" };
  let current: "caption" | "voiceover" | null = null;
  const buf: string[] = [];
  for (const line of text.split("\n")) {
    const up = line.trim().toUpperCase();
    if (up === "CAPTION") {
      if (current === "caption") result.caption = buf.splice(0).join("\n").trim();
      current = "caption";
    } else if (up === "VOICEOVER") {
      if (current === "caption") result.caption = buf.splice(0).join("\n").trim();
      current = "voiceover";
    } else if (current) {
      buf.push(line);
    }
  }
  if (current === "caption") result.caption = buf.join("\n").trim();
  if (current === "voiceover") result.voiceover = buf.join("\n").trim();
  return result;
}

function ReelWithVoicePreview({ content, brandName, phase, videoObjectUrl }: {
  content: string; brandName: string; phase: Phase; videoObjectUrl: string | null;
}) {
  const { caption, voiceover } = parseReelWithVoice(content);
  return (
    <div className="space-y-3 w-full">
      <ReelPostPreview
        content={caption}
        brandName={brandName}
        phase={phase}
        videoObjectUrl={videoObjectUrl}
      />
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden w-full">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0F6E56]/10 flex items-center justify-center text-base select-none">🎤</div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">Voiceover Script</p>
            <p className="text-xs text-gray-400">30 seconds · spoken aloud</p>
          </div>
          {phase === "generating" && <Spinner className="h-4 w-4" />}
        </div>
        <div className="px-5 py-4">
          {voiceover ? (
            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{voiceover}</p>
          ) : (
            <p className="text-sm text-gray-300 italic">
              {phase === "generating" ? "Writing voiceover…" : "—"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GeneratePage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<Format>("feed post");
  const [platform, setPlatform] = useState<Platform>("Instagram");
  const [content, setContent] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [brandName, setBrandName] = useState("Your Business");
  const [images, setImages] = useState<string[]>([]);  // multi-photo array
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [editId, setEditId] = useState<string | null>(null); // set when re-generating an existing post

  // Voice state (shared between voice-reel format and reel + voiceover toggle)
  const [voiceId, setVoiceId] = useState<string>("");
  const [voiceName, setVoiceName] = useState<string>("");
  const [voices, setVoices] = useState<AccountVoice[]>([]);
  const [includeVoiceover, setIncludeVoiceover] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);

  // Photo-to-Reel state
  const [mood, setMood] = useState<ReelMood>("Calm");
  const [creatingReel, setCreatingReel] = useState(false);
  const [reelBlob, setReelBlob] = useState<Blob | null>(null);
  const [reelObjectUrl, setReelObjectUrl] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/brand").then(r => r.json()).then(d => setBrandName(d.business_name ?? "Your Business")).catch(() => {});

    // Load macOS voices from config (always available, no API key needed)
    fetch("/api/voices")
      .then(r => r.json())
      .then((v: AccountVoice[]) => {
        if (Array.isArray(v) && v.length > 0) {
          setVoices(v);
          setVoiceId(prev => prev || v[0].id);
          setVoiceName(prev => prev || v[0].name);
        }
      })
      .catch(() => {});

    // Load saved voice settings from localStorage — wins over account default
    try {
      const saved = localStorage.getItem("voiceSettings");
      if (saved) {
        const v = JSON.parse(saved) as { voiceId: string; voiceName: string };
        if (v.voiceId) setVoiceId(v.voiceId);
        if (v.voiceName) setVoiceName(v.voiceName);
      }
    } catch { /* ignore */ }

    // Pre-fill form when coming from "Regenerate" on an existing post
    const regenRaw = sessionStorage.getItem("regenerate");
    if (regenRaw) {
      try {
        const regen = JSON.parse(regenRaw) as {
          editId?: string; topic?: string; format?: string;
          platform?: string; images?: string[] | null; imageDataUrl?: string | null;
        };
        if (regen.topic)    setTopic(regen.topic);
        if (regen.format   && FORMATS.some(f => f.value === regen.format))             setFormat(regen.format as Format);
        if (regen.platform && (PLATFORMS as readonly string[]).includes(regen.platform)) setPlatform(regen.platform as Platform);
        if (regen.images?.length)        setImages(regen.images);
        else if (regen.imageDataUrl)     setImages([regen.imageDataUrl]);
        if (regen.editId)   setEditId(regen.editId);
      } catch { /* ignore parse errors */ }
      sessionStorage.removeItem("regenerate");
    }

    // Cleanup object URLs on unmount
    return () => {
      if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
      if (reelObjectUrl) URL.revokeObjectURL(reelObjectUrl);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFormatChange(f: Format) {
    setFormat(f);
    setContent(""); setPhase("idle"); setError(""); setApproved(false);
    setIncludeVoiceover(false);
    // If new format doesn't support "both", revert to Instagram
    if (platform === "both" && !BOTH_COMPATIBLE.has(f)) setPlatform("Instagram");
  }

  async function handlePlayVoice(vId: string) {
    setPlayingVoiceId(vId);
    setPlayError(null);
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: vId, text: VOICE_SAMPLE_TEXT }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Voice API error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { setPlayingVoiceId(null); URL.revokeObjectURL(url); };
      audio.onerror = () => { setPlayingVoiceId(null); };
      await audio.play();
    } catch (e) {
      setPlayingVoiceId(null);
      setPlayError(e instanceof Error ? e.message : "Could not preview voice");
    }
  }

  async function handleGenerate() {
    if (!topic.trim() || phase === "generating") return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setContent(""); setError(""); setApproved(false); setPhase("generating");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic, format, platform,
          includeVoiceover: format === "reel" && includeVoiceover,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Error ${res.status}`);
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setContent(accumulated);
      }
      setPhase("done");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPhase("idle");
    }
  }

  // Formats that always route through /review for section-based editing
  // Also: multiple photos need review to confirm the single caption
  const isBothVersions = platform === "both" && BOTH_COMPATIBLE.has(format);
  const isReelWithVoice = format === "reel" && includeVoiceover;
  const needsReview = NEEDS_REVIEW_FORMATS.has(format) || isBothVersions || images.length > 1 || isReelWithVoice;

  async function handleApprove() {
    if (!content || saving) return;

    const videoMeta = videoFile ? { name: videoFile.name, size: videoFile.size, type: videoFile.type } : null;
    const imagePayload = images.length > 0 ? {
      images,
      imageDataUrl: images[0],   // backward-compat for dashboard thumbnail
    } : { images: null, imageDataUrl: null };

    if (needsReview) {
      const needsVoiceData = format === "voice-reel" || isReelWithVoice;
      sessionStorage.setItem("draft", JSON.stringify({
        ...(editId ? { id: editId } : {}),
        content, topic, format, platform,
        ...imagePayload,
        videoMeta,
        voiceId:          needsVoiceData ? voiceId : undefined,
        voiceName:        needsVoiceData ? voiceName : undefined,
        includeVoiceover: isReelWithVoice ? true : undefined,
      }));
      router.push("/review");
      return;
    }

    setSaving(true);
    try {
      if (editId) {
        await fetch("/api/posts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editId, content, topic, format, platform, status: "approved", ...imagePayload, videoMeta }),
        });
      } else {
        await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, topic, format, platform, status: "approved", scheduledDate: null, ...imagePayload, videoMeta }),
        });
      }
      setApproved(true);
      setTimeout(() => router.push("/dashboard"), 900);
    } finally {
      setSaving(false);
    }
  }

  function handleStartOver() {
    abortRef.current?.abort();
    setContent(""); setPhase("idle"); setError(""); setApproved(false); setImages([]);
    setCreatingReel(false);
    if (reelObjectUrl) { URL.revokeObjectURL(reelObjectUrl); setReelObjectUrl(null); }
    setReelBlob(null);
  }

  function handleReelComplete(blob: Blob) {
    if (reelObjectUrl) URL.revokeObjectURL(reelObjectUrl);
    const url = URL.createObjectURL(blob);
    setReelBlob(blob);
    setReelObjectUrl(url);
    setCreatingReel(false);
  }

  function handleDownloadReel() {
    if (!reelBlob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(reelBlob);
    a.download = `reel-${Date.now()}.mp4`;
    a.click();
  }

  // Right panel
  // Photo-to-Reel: true when format=reel and user uploaded multiple photos
  const isPhotoReel = format === "reel" && images.length > 1;

  const previewLabel =
    isBothVersions           ? "Both Versions" :
    format === "reel script" ? "Script Preview" :
    format === "voice-reel"  ? "Voice Reel Script" :
    format === "story"       ? "Story Preview" :
    isReelWithVoice          ? "Caption + Voiceover" :
    isPhotoReel              ? "Reel Preview" :
    format === "reel"        ? "Reel Preview" :
    images.length > 1        ? "Gallery Preview" :
    "Live Preview";

  // For the reel preview, use the generated reel video URL if available, otherwise the uploaded video
  const effectiveVideoUrl = reelObjectUrl ?? videoObjectUrl;

  const rightPanel = creatingReel ? (
    <ReelCreator
      images={images}
      caption={content}
      mood={mood}
      onComplete={handleReelComplete}
      onError={(msg) => { setCreatingReel(false); setError(`Reel creation failed: ${msg}`); }}
      onCancel={() => setCreatingReel(false)}
    />
  ) : isBothVersions ? (
    <BothPlatformsPreview content={content} phase={phase} />
  ) : format === "reel script" ? (
    <ReelScriptPreview content={content} phase={phase} />
  ) : format === "voice-reel" ? (
    <VoiceReelScriptPreview content={content} phase={phase} />
  ) : format === "story" ? (
    <StoryPreview content={content} phase={phase} />
  ) : isReelWithVoice ? (
    <ReelWithVoicePreview content={content} brandName={brandName} phase={phase} videoObjectUrl={effectiveVideoUrl} />
  ) : format === "reel" ? (
    <ReelPostPreview content={content} brandName={brandName} phase={phase} videoObjectUrl={effectiveVideoUrl} />
  ) : images.length > 1 ? (
    <GalleryPreview images={images} content={content} brandName={brandName} phase={phase} />
  ) : (
    <InstagramPreview content={content} brandName={brandName} phase={phase} imageDataUrl={images[0] ?? null} />
  );

  const approveButtonLabel = needsReview
    ? format === "reel script"   ? "Review Script →"
    : format === "voice-reel"    ? "Review Voice Script →"
    : format === "story"         ? "Review Story →"
    : isReelWithVoice            ? "Review & Build Reel →"
    : images.length > 1         ? "Review Gallery →"
    : "Review Versions →"
    : saving ? "Saving…" : "Approve & Save";

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {editId ? "Regenerate Post" : "Generate a Post"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {editId
            ? "Topic and format are pre-filled from the existing post — tweak them or generate straight away."
            : "Describe what the post is about — Claude writes in your brand voice."}
        </p>
      </div>

      {/* Edit-mode banner */}
      {editId && (
        <div className="mb-5 flex items-center gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
          <span>Regenerating an existing post — approving will <strong>update</strong> it, not create a new one.</span>
          <button onClick={() => setEditId(null)} className="ml-auto text-amber-500 hover:text-amber-700 text-xs underline shrink-0">
            Save as new instead
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-8 items-start">

        {/* ── Left: Form ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 space-y-5">

            {/* Topic */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">What&apos;s this post about?</label>
              <textarea
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/25 focus:border-[#0F6E56] h-24 resize-none transition-colors bg-white"
                placeholder="e.g. Our 2023 Malbec just came back from barrel — dark fruit, a little smoke, bone-dry finish"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </div>

            {/* Media upload — multi-photo or video */}
            {(
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Media <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <MediaUpload
                  images={images}
                  videoFile={videoFile}
                  videoObjectUrl={videoObjectUrl}
                  onAddImages={(next) => setImages(prev => [...prev, ...next])}
                  onRemoveImage={(idx) => setImages(prev => prev.filter((_, i) => i !== idx))}
                  onReorderImages={(from, to) => setImages(prev => {
                    const arr = [...prev];
                    const [item] = arr.splice(from, 1);
                    arr.splice(to, 0, item);
                    return arr;
                  })}
                  onVideo={(file, url) => { setImages([]); setVideoFile(file); setVideoObjectUrl(url); }}
                  onClearMedia={() => {
                    setImages([]);
                    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
                    setVideoFile(null); setVideoObjectUrl(null);
                  }}
                />
              </div>
            )}

            {/* Format */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Format</label>
              <div className="flex gap-2 flex-wrap">
                {FORMATS.map(({ value, label }) => (
                  <button key={value} onClick={() => handleFormatChange(value)}
                    className={`px-3.5 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                      format === value ? "bg-[#0F6E56] text-white border-[#0F6E56] shadow-sm" : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >{label}</button>
                ))}
              </div>
              {isPhotoReel && (
                <p className="text-xs text-[#0F6E56] mt-1.5 font-medium">
                  📸→🎬 {images.length} photos will be stitched into a Reel with Ken Burns effects.
                </p>
              )}
              {!isPhotoReel && images.length > 1 && (
                <p className="text-xs text-gray-400 mt-1.5">{images.length} photos · will publish as a gallery post · one caption for all.</p>
              )}
              {format === "story" && (
                <p className="text-xs text-gray-400 mt-1.5">Generates text + a poll suggestion for your Story.</p>
              )}
            </div>

            {/* Platform */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Platform</label>
              <div className="flex gap-2 flex-wrap">
                {PLATFORMS.map((p) => {
                  const disabled = p === "both" && (!BOTH_COMPATIBLE.has(format) || format === "voice-reel");
                  return (
                    <button key={p} onClick={() => !disabled && setPlatform(p)}
                      disabled={disabled}
                      title={disabled ? "Both is available for Feed Post and Reel" : undefined}
                      className={`px-3.5 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                        platform === p ? "bg-[#0F6E56] text-white border-[#0F6E56] shadow-sm" : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                      } ${disabled ? "opacity-30 cursor-not-allowed hover:bg-transparent hover:border-gray-200" : ""}`}
                    >{p}</button>
                  );
                })}
              </div>
              {isBothVersions && (
                <p className="text-xs text-gray-400 mt-1.5">Generates Instagram + Facebook versions — you&apos;ll review both before saving.</p>
              )}
            </div>

            {/* Voice section — toggle + card grid for Reel format */}
            {format === "reel" && (
              <div className="space-y-3">
                {/* Include voiceover toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Include Voiceover</label>
                    <p className="text-xs text-gray-400 mt-0.5">Claude writes a script · ElevenLabs reads it aloud</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIncludeVoiceover(v => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                      includeVoiceover ? "bg-[#0F6E56]" : "bg-gray-200"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      includeVoiceover ? "translate-x-6" : "translate-x-1"
                    }`} />
                  </button>
                </div>

                {/* Voice card grid — 2 columns × 3 rows */}
                {includeVoiceover && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {voices.map(voice => {
                        const isSelected = voiceId === voice.id;
                        const isPlaying  = playingVoiceId === voice.id;
                        return (
                          <div
                            key={voice.id}
                            className={`rounded-xl border p-3 transition-all ${
                              isSelected
                                ? "border-[#0F6E56] bg-[#E8F5F1] shadow-sm"
                                : "border-gray-200 bg-white hover:border-gray-300"
                            }`}
                          >
                            <p className="text-xs font-semibold text-gray-900 leading-snug">{voice.label}</p>
                            <p className="text-[11px] text-gray-500 mt-0.5 mb-2.5 leading-snug">{voice.description}</p>
                            <div className="flex gap-1.5">
                              {/* Play button */}
                              <button
                                type="button"
                                onClick={() => handlePlayVoice(voice.id)}
                                disabled={playingVoiceId !== null}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors shrink-0"
                              >
                                {isPlaying ? (
                                  <><span className="animate-pulse text-[#0F6E56]">♪</span>&nbsp;Playing</>
                                ) : (
                                  <>
                                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M8 5v14l11-7z" />
                                    </svg>
                                    Play
                                  </>
                                )}
                              </button>
                              {/* Select button */}
                              <button
                                type="button"
                                onClick={() => { setVoiceId(voice.id); setVoiceName(voice.name); }}
                                className={`flex-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                                  isSelected
                                    ? "bg-[#0F6E56] text-white"
                                    : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                                }`}
                              >
                                {isSelected ? "✓ Selected" : "Select"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {playError && (
                      <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        {playError}
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400">
                      <a href="/setup#voice" className="text-[#0F6E56] hover:underline">
                        🎤 Clone your own voice in Setup →
                      </a>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Voice selector — legacy Voice Reel format */}
            {format === "voice-reel" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Voice</label>
                <select
                  value={voiceId}
                  onChange={(e) => {
                    const selected = voices.find(v => v.id === e.target.value);
                    setVoiceId(e.target.value);
                    if (selected) setVoiceName(selected.name);
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/25 focus:border-[#0F6E56] transition-colors bg-white"
                >
                  {voices.map(v => (
                    <option key={v.id} value={v.id}>{v.name} — {v.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1.5">
                  <a href="/setup#voice" className="text-[#0F6E56] hover:underline">🎤 Clone your own voice in Setup →</a>
                </p>
              </div>
            )}

            {/* Mood selector — shown when creating a Reel from photos */}
            {isPhotoReel && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Music mood <span className="text-gray-400 font-normal">(for the Reel)</span>
                </label>
                <div className="flex gap-2 flex-wrap">
                  {MOODS.map(({ value, label, emoji }) => (
                    <button key={value} onClick={() => setMood(value)}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                        mood === value
                          ? "bg-[#0F6E56] text-white border-[#0F6E56] shadow-sm"
                          : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <span>{emoji}</span>{label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  Royalty-free CC music from Jamendo · requires <code className="text-[10px] bg-gray-100 px-1 rounded">JAMENDO_CLIENT_ID</code> env var
                  <span className="ml-1">· <a href="https://developer.jamendo.com/v3.0" target="_blank" rel="noopener" className="underline hover:text-gray-600">free key in 2 min</a></span>
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
          </div>

          {/* Action footer */}
          <div className="px-5 sm:px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={!topic.trim() || phase === "generating"}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#0F6E56] text-white rounded-xl text-sm font-medium hover:bg-[#0A5A45] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {phase === "generating" ? <><Spinner />Writing…</> : "Generate →"}
            </button>

            {phase === "done" && !approved && (
              <>
                {/* Photo-to-Reel: "Create Reel" before caption approve */}
                {isPhotoReel && !reelObjectUrl && !creatingReel && (
                  <button
                    onClick={() => setCreatingReel(true)}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-[#0F6E56] text-white rounded-xl text-sm font-medium hover:bg-[#0A5A45] transition-colors shadow-sm"
                  >
                    🎬 Create Reel
                  </button>
                )}

                {/* Download the generated reel video */}
                {reelObjectUrl && (
                  <button
                    onClick={handleDownloadReel}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-white border border-[#0F6E56] text-[#0F6E56] rounded-xl text-sm font-medium hover:bg-[#E8F5F1] transition-colors shadow-sm"
                  >
                    ⬇ Download Reel
                  </button>
                )}

                <button onClick={handleApprove} disabled={saving}
                  className="px-5 py-2.5 bg-white border border-[#0F6E56] text-[#0F6E56] rounded-xl text-sm font-medium hover:bg-[#E8F5F1] disabled:opacity-50 transition-colors shadow-sm"
                >
                  {approveButtonLabel}
                </button>
                <button onClick={handleStartOver} className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                  Start over
                </button>
              </>
            )}

            {approved && (
              <div className="flex items-center gap-1.5 text-sm text-[#0F6E56] font-medium">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Saved — redirecting…
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Preview ── */}
        <div className="flex flex-col items-center gap-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest self-start lg:self-center">
            {previewLabel}
          </p>
          {rightPanel}
        </div>
      </div>
    </div>
  );
}
