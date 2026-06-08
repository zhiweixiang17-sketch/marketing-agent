"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// ── Constants & types ─────────────────────────────────────────────────────────

const FORMATS = [
  { value: "feed post",   label: "Feed Post"   },
  { value: "reel",        label: "Reel"         },
  { value: "story",       label: "Story"        },
  { value: "carousel",    label: "Carousel"     },
  { value: "reel script", label: "Reel Script"  },
] as const;

type Format = (typeof FORMATS)[number]["value"];
const PLATFORMS = ["Instagram", "Facebook", "both"] as const;
type Platform = (typeof PLATFORMS)[number];

// Only Feed Post and Reel generate two versions for "Both"
const BOTH_COMPATIBLE = new Set<Format>(["feed post", "reel"]);

// These formats always route through /review for section editing
const NEEDS_REVIEW_FORMATS = new Set<Format>(["story", "carousel", "reel script"]);

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

// Carousel sections
const CAROUSEL_KEYS = ["SLIDE 1", "SLIDE 2", "SLIDE 3", "SLIDE 4", "SLIDE 5"] as const;
const CAROUSEL_META = [
  { key: "SLIDE 1", icon: "1️⃣", hint: "Hook"    },
  { key: "SLIDE 2", icon: "2️⃣", hint: "Context" },
  { key: "SLIDE 3", icon: "3️⃣", hint: "Details" },
  { key: "SLIDE 4", icon: "4️⃣", hint: "Story"   },
  { key: "SLIDE 5", icon: "5️⃣", hint: "CTA"     },
];

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

// ── Photo upload (for Feed Post, Story) ──────────────────────────────────────

function PhotoUpload({ imageDataUrl, onUpload, onRemove }: {
  imageDataUrl: string | null; onUpload: (d: string) => void; onRemove: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 20 * 1024 * 1024) { alert("Please choose an image under 20 MB."); return; }
    setCompressing(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const compressed = await compressImage(e.target?.result as string);
      onUpload(compressed);
      setCompressing(false);
    };
    reader.readAsDataURL(file);
  }

  if (imageDataUrl) {
    return (
      <div className="relative rounded-xl overflow-hidden border border-gray-200 group">
        <img src={imageDataUrl} alt="Uploaded" className="w-full max-h-48 object-cover" />
        <button onClick={onRemove}
          className="absolute top-2 right-2 w-7 h-7 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors"
          title="Remove photo">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M2 2l8 8M10 2L2 10" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      onClick={() => !compressing && inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
        dragging ? "border-[#0F6E56] bg-[#E8F5F1]" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
      } ${compressing ? "cursor-wait" : ""}`}>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      <div className="flex flex-col items-center gap-2">
        {compressing ? (
          <><Spinner className="h-5 w-5" /><p className="text-sm text-gray-500">Optimising image…</p></>
        ) : (
          <>
            <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
            </svg>
            <p className="text-sm text-gray-500">Drag & drop or click · JPG, PNG, HEIC</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Video upload (for Reel) ───────────────────────────────────────────────────

function VideoUpload({ videoFile, videoObjectUrl, onUpload, onRemove }: {
  videoFile: File | null; videoObjectUrl: string | null;
  onUpload: (file: File, url: string) => void; onRemove: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    if (!file.type.match(/video\/(mp4|quicktime)/)) {
      alert("Please upload an .mp4 or .mov file."); return;
    }
    if (file.size > 100 * 1024 * 1024) {
      alert("Please choose a video under 100 MB."); return;
    }
    onUpload(file, URL.createObjectURL(file));
  }

  if (videoObjectUrl && videoFile) {
    return (
      <div className="rounded-xl overflow-hidden border border-gray-200">
        <video src={videoObjectUrl} className="w-full max-h-44 object-cover bg-black" controls muted playsInline />
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-200">
          <span className="text-xs text-gray-500 truncate mr-2">{videoFile.name}</span>
          <button onClick={onRemove} className="text-xs text-red-500 hover:text-red-700 shrink-0">Remove</button>
        </div>
      </div>
    );
  }

  return (
    <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
        dragging ? "border-[#0F6E56] bg-[#E8F5F1]" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
      }`}>
      <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      <div className="flex flex-col items-center gap-2">
        <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
        </svg>
        <p className="text-sm text-gray-500">Drag & drop or click · MP4, MOV · up to 100 MB</p>
      </div>
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

// Carousel preview
function CarouselPreview({ content, phase }: { content: string; phase: Phase }) {
  const slides = parseGenericSections(content, CAROUSEL_KEYS);
  const lastFilledIdx = CAROUSEL_META.reduce((acc, m, i) => (slides[m.key] ? i : acc), -1);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-md overflow-hidden w-full">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#0F6E56]/10 flex items-center justify-center text-lg select-none">🎠</div>
        <div className="flex-1"><p className="text-sm font-semibold text-gray-900">Carousel</p><p className="text-xs text-gray-400">5 slides · swipe right</p></div>
        {phase === "generating" && <Spinner className="h-4 w-4" />}
      </div>
      <div className="divide-y divide-gray-100">
        {CAROUSEL_META.map(({ key, icon, hint }, i) => {
          const text = slides[key];
          const showCursor = phase === "generating" && i === lastFilledIdx;
          return (
            <div key={key} className="px-5 py-3.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-sm select-none">{icon}</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Slide {i + 1}</span>
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
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [approved, setApproved] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/brand").then(r => r.json()).then(d => setBrandName(d.business_name ?? "Your Business")).catch(() => {});
    // Cleanup video object URL on unmount
    return () => { if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFormatChange(f: Format) {
    setFormat(f);
    setContent(""); setPhase("idle"); setError(""); setApproved(false);
    // If new format doesn't support "both", revert to Instagram
    if (platform === "both" && !BOTH_COMPATIBLE.has(f)) setPlatform("Instagram");
    // Clear video when leaving reel format
    if (f !== "reel" && videoObjectUrl) {
      URL.revokeObjectURL(videoObjectUrl);
      setVideoFile(null); setVideoObjectUrl(null);
    }
    // Clear image when entering reel format
    if (f === "reel") setImageDataUrl(null);
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
        body: JSON.stringify({ topic, format, platform }),
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
  const isBothVersions = platform === "both" && BOTH_COMPATIBLE.has(format);
  const needsReview = NEEDS_REVIEW_FORMATS.has(format) || isBothVersions;

  async function handleApprove() {
    if (!content || saving) return;

    if (needsReview) {
      sessionStorage.setItem("draft", JSON.stringify({
        content, topic, format, platform,
        imageDataUrl: imageDataUrl ?? null,
        videoMeta: videoFile ? { name: videoFile.name, size: videoFile.size, type: videoFile.type } : null,
      }));
      router.push("/review");
      return;
    }

    setSaving(true);
    try {
      await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content, topic, format, platform,
          status: "approved", scheduledDate: null,
          imageDataUrl: imageDataUrl ?? null,
          videoMeta: videoFile ? { name: videoFile.name, size: videoFile.size, type: videoFile.type } : null,
        }),
      });
      setApproved(true);
      setTimeout(() => router.push("/dashboard"), 900);
    } finally {
      setSaving(false);
    }
  }

  function handleStartOver() {
    abortRef.current?.abort();
    setContent(""); setPhase("idle"); setError(""); setApproved(false);
  }

  // Right panel
  const previewLabel =
    isBothVersions ? "Both Versions" :
    format === "reel script" ? "Script Preview" :
    format === "carousel"    ? "Carousel Preview" :
    format === "story"       ? "Story Preview" :
    format === "reel"        ? "Reel Preview" :
    "Live Preview";

  const rightPanel = isBothVersions ? (
    <BothPlatformsPreview content={content} phase={phase} />
  ) : format === "reel script" ? (
    <ReelScriptPreview content={content} phase={phase} />
  ) : format === "carousel" ? (
    <CarouselPreview content={content} phase={phase} />
  ) : format === "story" ? (
    <StoryPreview content={content} phase={phase} />
  ) : format === "reel" ? (
    <ReelPostPreview content={content} brandName={brandName} phase={phase} videoObjectUrl={videoObjectUrl} />
  ) : (
    <InstagramPreview content={content} brandName={brandName} phase={phase} imageDataUrl={imageDataUrl} />
  );

  const approveButtonLabel = needsReview
    ? format === "reel script" ? "Review Script →"
    : format === "carousel"   ? "Review Slides →"
    : format === "story"      ? "Review Story →"
    : "Review Versions →"
    : saving ? "Saving…" : "Approve & Save";

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Generate a Post</h1>
        <p className="text-sm text-gray-500 mt-1">Describe what the post is about — Claude writes in your brand voice.</p>
      </div>

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

            {/* Media upload — photo for most formats, video for Reel */}
            {format === "reel" ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Video <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <VideoUpload
                  videoFile={videoFile} videoObjectUrl={videoObjectUrl}
                  onUpload={(file, url) => { setVideoFile(file); setVideoObjectUrl(url); }}
                  onRemove={() => {
                    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
                    setVideoFile(null); setVideoObjectUrl(null);
                  }}
                />
              </div>
            ) : (format === "feed post" || format === "story") && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Photo <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <PhotoUpload imageDataUrl={imageDataUrl} onUpload={setImageDataUrl} onRemove={() => setImageDataUrl(null)} />
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
              {format === "carousel" && (
                <p className="text-xs text-gray-400 mt-1.5">Generates 5 slide captions — you&apos;ll review each before saving.</p>
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
                  const disabled = p === "both" && !BOTH_COMPATIBLE.has(format);
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
