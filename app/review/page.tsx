"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const VoiceReelCreator = dynamic(() => import("../generate/VoiceReelCreator"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

type Draft = {
  id?: string;          // present when editing an existing post
  content: string;
  topic: string;
  format: string;
  platform: string;
  images?: string[] | null;
  imageDataUrl?: string | null;  // legacy / backward compat
  videoMeta?: { name: string; size: number; type: string } | null;
  voiceId?: string;
  voiceName?: string;
  includeVoiceover?: boolean;   // reel format + voice toggle
};

type SectionDef = {
  key: string;
  label: string;
  icon: string;
  hint: string;
  rows: number;
};

// ── Section definitions ───────────────────────────────────────────────────────

function getSectionDefs(format: string, platform: string, includeVoiceover?: boolean): SectionDef[] | null {
  // "Both" platform — show Instagram & Facebook side-by-side
  if (platform === "both") {
    return [
      { key: "INSTAGRAM", label: "Instagram",  icon: "📸", hint: "Shorter · hashtags · visual-first",       rows: 10 },
      { key: "FACEBOOK",  label: "Facebook",   icon: "👥", hint: "Longer · conversational · no hashtags",   rows: 10 },
    ];
  }
  if (format === "reel script") {
    return [
      { key: "HOOK",           label: "Hook",          icon: "🪝", hint: "First 3 seconds · stops the scroll", rows: 2 },
      { key: "SCRIPT",         label: "Script",        icon: "🎙️", hint: "15–30 sec voiceover",               rows: 6 },
      { key: "ON-SCREEN TEXT", label: "On-screen Text",icon: "📺", hint: "Text overlay suggestions",           rows: 4 },
      { key: "CTA",            label: "CTA",           icon: "👋", hint: "Soft close · 3–5 seconds",           rows: 2 },
    ];
  }
  if (format === "story") {
    return [
      { key: "TEXT", label: "Story Text", icon: "📱", hint: "Bold statement or question · under 10 words", rows: 2 },
      { key: "POLL", label: "Poll",       icon: "🗳️", hint: "Question + two options",                     rows: 3 },
    ];
  }
  if (format === "voice-reel") {
    return [
      { key: "HOOK",  label: "Hook",          icon: "🎣", hint: "0-3 sec · punchy opener",      rows: 2 },
      { key: "INTRO", label: "Introduction",  icon: "🎙️", hint: "3-20 sec · warm story",         rows: 6 },
      { key: "CTA",   label: "Call to Action", icon: "👋", hint: "20-30 sec · soft invitation",   rows: 2 },
    ];
  }
  // Reel format with voiceover toggle
  if (format === "reel" && includeVoiceover) {
    return [
      { key: "CAPTION",   label: "Caption",          icon: "📝", hint: "Your Instagram caption + hashtags",                  rows: 8 },
      { key: "VOICEOVER", label: "Voiceover Script", icon: "🎙️", hint: "Edit before generating audio · max 60 words",         rows: 5 },
    ];
  }
  return null; // single textarea for feed post, reel (no voiceover)
}

// ── Parsing & reconstruction ──────────────────────────────────────────────────

function parseSections(text: string, defs: SectionDef[]): Record<string, string> {
  const keys = defs.map(d => d.key);
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

function reconstructSections(defs: SectionDef[], values: Record<string, string>): string {
  return defs.map(d => `${d.key}\n${values[d.key]}`).join("\n\n");
}

// ── Swipeable photo preview ───────────────────────────────────────────────────

function SwipeablePhotoPreview({ images }: { images: string[] }) {
  const [current, setCurrent] = useState(0);
  const clamp = Math.min(current, images.length - 1);
  return (
    <div className="border-b border-gray-100">
      <div className="relative overflow-hidden bg-gray-100" style={{ maxHeight: "420px", aspectRatio: "1 / 1" }}>
        {images[clamp] && (
          <img src={images[clamp]} alt={`Photo ${clamp + 1}`} className="w-full h-full object-cover" />
        )}
        {/* Prev */}
        {clamp > 0 && (
          <button onClick={() => setCurrent(c => c - 1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 shadow-md flex items-center justify-center hover:bg-white transition-colors"
            aria-label="Previous photo">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}
        {/* Next */}
        {clamp < images.length - 1 && (
          <button onClick={() => setCurrent(c => c + 1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 shadow-md flex items-center justify-center hover:bg-white transition-colors"
            aria-label="Next photo">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
        {/* Dots */}
        {images.length > 1 && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
            {images.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)}
                className={`w-2 h-2 rounded-full transition-colors ${i === clamp ? "bg-white" : "bg-white/40"}`}
                aria-label={`Photo ${i + 1}`}
              />
            ))}
          </div>
        )}
        {/* Counter */}
        {images.length > 1 && (
          <span className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
            {clamp + 1} / {images.length}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }
  return (
    <button onClick={handleCopy}
      className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 bg-white text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">
      {copied ? (
        <>
          <svg className="w-4 h-4 text-[#0F6E56] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-[#0F6E56]">Copied!</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [content, setContent] = useState(""); // for single-textarea formats
  const [sections, setSections] = useState<Record<string, string>>({}); // for section-based formats
  const [saving, setSaving] = useState(false);
  const [approved, setApproved] = useState(false);

  // Voice Reel state
  const [generatingVoice, setGeneratingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceoverData, setVoiceoverData] = useState<Uint8Array | null>(null);
  const [creatingVoiceReel, setCreatingVoiceReel] = useState(false);
  const [voiceReelBlob, setVoiceReelBlob] = useState<Blob | null>(null);
  const [voiceReelUrl, setVoiceReelUrl] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("draft");
    if (raw) {
      const d = JSON.parse(raw) as Draft;
      setDraft(d);
      setContent(d.content);
      const defs = getSectionDefs(d.format, d.platform, d.includeVoiceover);
      if (defs) {
        setSections(parseSections(d.content, defs));
      }
    }
  }, []);

  if (!draft) {
    return (
      <div className="max-w-xl py-20 text-center">
        <p className="text-gray-400 text-sm mb-3">No draft to review.</p>
        <button onClick={() => router.push("/generate")}
          className="text-sm text-[#0F6E56] hover:underline font-medium">
          Generate a post →
        </button>
      </div>
    );
  }

  const defs = getSectionDefs(draft.format, draft.platform, draft.includeVoiceover);
  const isSectioned = defs !== null;
  const isBoth = draft.platform === "both";
  const isEditing = Boolean(draft.id);
  const isReelWithVoice = draft.format === "reel" && draft.includeVoiceover;

  // Resolve photos: prefer images array, fall back to legacy imageDataUrl
  const photoImages: string[] = draft.images?.length
    ? draft.images
    : draft.imageDataUrl
    ? [draft.imageDataUrl]
    : [];

  // Heading
  const pageTitle =
    draft.format === "reel script" ? (isEditing ? "Edit Reel Script"  : "Review Reel Script") :
    draft.format === "voice-reel"  ? (isEditing ? "Edit Voice Reel"   : "Review Voice Reel") :
    isReelWithVoice                ? (isEditing ? "Edit Reel"          : "Review & Build Reel") :
    draft.format === "story"       ? (isEditing ? "Edit Story"         : "Review Story") :
    isBoth                         ? (isEditing ? "Edit Both Versions" : "Review Both Versions") :
    photoImages.length > 1         ? (isEditing ? "Edit Gallery Post"  : "Review Gallery Post") :
                                     (isEditing ? "Edit Post"          : "Review & Approve");

  // Build final content string for save.
  // Reel + voiceover: save only the caption section as the post content.
  function buildFinalContent(): string {
    if (isSectioned && defs) {
      if (isReelWithVoice) return sections["CAPTION"] ?? content;
      return reconstructSections(defs, sections);
    }
    return content;
  }

  // Copy text: for reel+voice, copy just the caption (not the voiceover)
  const copyText = isReelWithVoice ? (sections["CAPTION"] ?? content) : buildFinalContent();

  async function handleGenerateVoice() {
    if (!draft || generatingVoice) return;
    setGeneratingVoice(true);
    setVoiceError(null);
    // Use VOICEOVER section for reel+voice, or full script for voice-reel
    const voiceScript = isReelWithVoice
      ? (sections["VOICEOVER"] ?? content)
      : (defs ? reconstructSections(defs, sections) : content);
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId: draft.voiceId, text: voiceScript }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `Voice API error ${res.status}`);
      }
      const blob = await res.blob();
      const arrayBuf = await blob.arrayBuffer();
      setVoiceBlob(blob);
      setVoiceoverData(new Uint8Array(arrayBuf));
      // For voice-reel, start building immediately.
      // For reel+voice, the user listens and clicks "Build Reel" manually.
      if (!isReelWithVoice) setCreatingVoiceReel(true);
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingVoice(false);
    }
  }

  async function handleApprove() {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const finalContent = buildFinalContent();
      const mediaPayload = {
        images: draft.images ?? null,
        imageDataUrl: draft.images?.[0] ?? draft.imageDataUrl ?? null,
        videoMeta: draft.videoMeta ?? null,
      };
      if (draft.id) {
        await fetch("/api/posts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: draft.id, content: finalContent, topic: draft.topic, format: draft.format, platform: draft.platform, status: "approved", ...mediaPayload }),
        });
      } else {
        await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: finalContent, topic: draft.topic, format: draft.format, platform: draft.platform, status: "approved", scheduledDate: null, ...mediaPayload }),
        });
      }
      setApproved(true);
      sessionStorage.removeItem("draft");
      setTimeout(() => router.push("/dashboard"), 1000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
        <p className="text-sm text-gray-500 mt-1 capitalize">
          {draft.format} · {draft.platform} · {draft.topic}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

        {/* Photo preview — swipeable gallery or single image */}
        {draft.format !== "reel script" && !isBoth && photoImages.length > 0 && (
          <SwipeablePhotoPreview images={photoImages} />
        )}

        {/* Video meta banner — for reel format */}
        {draft.format === "reel" && draft.videoMeta && (
          <div className="px-5 sm:px-8 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2.5 text-sm text-gray-600">
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <span className="truncate">{draft.videoMeta.name}</span>
            <span className="text-gray-400 shrink-0">({(draft.videoMeta.size / (1024 * 1024)).toFixed(1)} MB)</span>
          </div>
        )}

        {isSectioned && defs ? (
          /* ── Section-based editing ── */
          <div className={`divide-y divide-gray-100 ${isBoth ? "sm:grid sm:grid-cols-2 sm:divide-y-0 sm:divide-x" : ""}`}>
            {defs.map(({ key, label, icon, hint, rows }) => (
              <div key={key} className="px-5 sm:px-8 py-5 sm:py-6">
                <div className="flex flex-wrap items-center gap-2 mb-2.5">
                  <span className="text-base select-none">{icon}</span>
                  <span className="text-sm font-semibold text-gray-800">{label}</span>
                  <span className="text-xs text-gray-400 ml-0.5">{hint}</span>
                </div>
                <textarea
                  rows={rows}
                  value={sections[key] ?? ""}
                  onChange={(e) => setSections(prev => ({ ...prev, [key]: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/25 focus:border-[#0F6E56] resize-y font-mono leading-relaxed transition-colors bg-white placeholder-gray-300"
                  placeholder={`Edit the ${label.toLowerCase()}…`}
                />
              </div>
            ))}
          </div>
        ) : (
          /* ── Single textarea ── */
          <div className="px-5 sm:px-8 py-6 sm:py-8">
            <label className="block text-sm font-medium text-gray-700 mb-2">Generated Content</label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/25 focus:border-[#0F6E56] min-h-[260px] resize-y font-mono leading-relaxed transition-colors bg-white"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-2">Edit the copy directly before approving.</p>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="px-5 sm:px-8 py-4 sm:py-5 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-3 items-center">
          <button
            onClick={handleApprove}
            disabled={saving || approved}
            className="px-5 py-2.5 bg-[#0F6E56] text-white rounded-xl text-sm font-medium hover:bg-[#0A5A45] disabled:opacity-50 transition-colors shadow-sm"
          >
            {approved ? "✓ Saved" : saving ? "Saving…" : isEditing ? "Save Changes" : "Approve & Save"}
          </button>

          <CopyButton
            text={copyText}
            label={
              draft.format === "reel script" ? "Copy Script" :
              draft.format === "voice-reel"  ? "Copy Script" :
              isReelWithVoice                ? "Copy Caption" :
              isBoth                         ? "Copy Both Versions" :
              "Copy"
            }
          />

          {/* ── Reel + Voiceover: audio generation + Build Reel ── */}
          {isReelWithVoice && (
            <div className="w-full flex flex-col gap-3">
              {/* Voice info + Generate Audio button */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-gray-500">
                  🎤 Voice: <span className="font-medium text-gray-700">{draft.voiceName ?? "Selected"}</span>
                </span>
                <button
                  onClick={handleGenerateVoice}
                  disabled={generatingVoice || creatingVoiceReel}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0F6E56] text-white rounded-xl text-sm font-medium hover:bg-[#0A5A45] disabled:opacity-50 transition-colors shadow-sm"
                >
                  {generatingVoice ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Generating audio…
                    </>
                  ) : voiceBlob ? (
                    "↺ Regenerate Audio"
                  ) : (
                    "🔊 Generate Voiceover Audio"
                  )}
                </button>
              </div>

              {/* Audio player — shows once audio is ready */}
              {voiceBlob && !creatingVoiceReel && !voiceReelUrl && (
                <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 space-y-2.5">
                  <p className="text-xs font-medium text-gray-700">Listen to your voiceover:</p>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio
                    src={URL.createObjectURL(voiceBlob)}
                    controls
                    className="w-full h-10"
                  />
                  <button
                    onClick={() => setCreatingVoiceReel(true)}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-[#0F6E56] text-white rounded-xl text-sm font-semibold hover:bg-[#0A5A45] transition-colors shadow-sm"
                  >
                    🎬 Build Reel
                  </button>
                </div>
              )}

              {voiceError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  {voiceError}
                </p>
              )}
            </div>
          )}

          {/* ── Legacy Voice Reel generation controls ── */}
          {draft.format === "voice-reel" && (
            <>
              <button
                onClick={handleGenerateVoice}
                disabled={generatingVoice}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0F6E56] text-white rounded-xl text-sm font-medium hover:bg-[#0A5A45] disabled:opacity-50 transition-colors shadow-sm"
              >
                {generatingVoice ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Generating voice…
                  </>
                ) : (
                  "🎤 Generate Voice Reel"
                )}
              </button>
              <span className="text-xs text-gray-400">Voice: {draft.voiceName ?? "Selected voice"}</span>
              {voiceError && (
                <p className="w-full text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{voiceError}</p>
              )}
              {voiceReelUrl && (
                <button
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = voiceReelUrl;
                    a.download = `voice-reel-${Date.now()}.mp4`;
                    a.click();
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white border border-[#0F6E56] text-[#0F6E56] rounded-xl text-sm font-medium hover:bg-[#E8F5F1] transition-colors shadow-sm"
                >
                  ⬇ Download Voice Reel
                </button>
              )}
            </>
          )}

          {isEditing ? (
            <>
              <button
                onClick={() => {
                  sessionStorage.setItem("regenerate", JSON.stringify({
                    editId: draft.id,
                    topic: draft.topic,
                    format: draft.format,
                    platform: draft.platform,
                    images: draft.images ?? null,
                    imageDataUrl: draft.images?.[0] ?? draft.imageDataUrl ?? null,
                  }));
                  router.push("/generate");
                }}
                className="flex items-center gap-1.5 px-5 py-2.5 border border-gray-200 bg-white text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Regenerate
              </button>
              <button
                onClick={() => router.push("/dashboard")}
                className="px-5 py-2.5 border border-gray-200 bg-white text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => router.push("/generate")}
              className="px-5 py-2.5 border border-gray-200 bg-white text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
            >
              Regenerate
            </button>
          )}

          {approved && (
            <span className="flex items-center gap-1.5 text-sm text-[#0F6E56] font-medium ml-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Saved — redirecting…
            </span>
          )}
        </div>
      </div>

      {/* ── VoiceReelCreator — FFmpeg progress ── */}
      {creatingVoiceReel && voiceoverData && (
        <div className="mt-6">
          <VoiceReelCreator
            images={photoImages.length > 0 ? photoImages : []}
            voiceoverData={voiceoverData}
            hookText={
              isReelWithVoice
                ? (sections["VOICEOVER"] ?? "").split("\n").find(l => l.trim())?.replace(/^hook:\s*/i, "").trim() ?? ""
                : (sections["HOOK"] ?? "")
            }
            mood="Calm"
            onComplete={(blob) => {
              const url = URL.createObjectURL(blob);
              setVoiceReelBlob(blob);
              setVoiceReelUrl(url);
              setCreatingVoiceReel(false);
            }}
            onError={(msg) => { setVoiceError(msg); setCreatingVoiceReel(false); }}
            onCancel={() => setCreatingVoiceReel(false)}
          />
        </div>
      )}

      {/* ── Generated Reel: video preview + action buttons ── */}
      {voiceReelUrl && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Video preview */}
          <video src={voiceReelUrl} className="w-full max-h-[640px] bg-black" controls />

          {/* Action buttons */}
          <div className="px-5 py-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              {/* Download Reel */}
              <button
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = voiceReelUrl;
                  a.download = `reel-${Date.now()}.mp4`;
                  a.click();
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0F6E56] text-white rounded-xl text-sm font-medium hover:bg-[#0A5A45] transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download Reel
              </button>

              {/* Copy Caption */}
              <CopyButton text={copyText} label="Copy Caption" />
            </div>

            {/* Music tip */}
            <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
              <span className="text-base shrink-0">💡</span>
              <p className="text-xs text-amber-800 leading-relaxed">
                <span className="font-semibold">Tip:</span> Open Instagram → select this Reel → tap{" "}
                <strong>Add Music</strong> from Instagram&apos;s library before posting for maximum reach.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
