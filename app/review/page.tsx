"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Draft = {
  content: string;
  topic: string;
  format: string;
  platform: string;
  imageDataUrl?: string | null;
  videoMeta?: { name: string; size: number; type: string } | null;
};

type SectionDef = {
  key: string;
  label: string;
  icon: string;
  hint: string;
  rows: number;
};

// ── Section definitions ───────────────────────────────────────────────────────

function getSectionDefs(format: string, platform: string): SectionDef[] | null {
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
  if (format === "carousel") {
    return [
      { key: "SLIDE 1", label: "Slide 1 — Hook",    icon: "1️⃣", hint: "Makes them swipe",          rows: 3 },
      { key: "SLIDE 2", label: "Slide 2 — Context", icon: "2️⃣", hint: "Deepen the story",          rows: 4 },
      { key: "SLIDE 3", label: "Slide 3 — Detail",  icon: "3️⃣", hint: "Facts, numbers, flavour",   rows: 4 },
      { key: "SLIDE 4", label: "Slide 4 — Story",   icon: "4️⃣", hint: "Human detail",              rows: 4 },
      { key: "SLIDE 5", label: "Slide 5 — CTA",     icon: "5️⃣", hint: "Soft close + hashtags",     rows: 5 },
    ];
  }
  if (format === "story") {
    return [
      { key: "TEXT", label: "Story Text", icon: "📱", hint: "Bold statement or question · under 10 words", rows: 2 },
      { key: "POLL", label: "Poll",       icon: "🗳️", hint: "Question + two options",                     rows: 3 },
    ];
  }
  return null; // single textarea for feed post, reel
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

  useEffect(() => {
    const raw = sessionStorage.getItem("draft");
    if (raw) {
      const d = JSON.parse(raw) as Draft;
      setDraft(d);
      setContent(d.content);
      const defs = getSectionDefs(d.format, d.platform);
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

  const defs = getSectionDefs(draft.format, draft.platform);
  const isSectioned = defs !== null;
  const isBoth = draft.platform === "both";

  // Heading
  const pageTitle =
    draft.format === "reel script" ? "Review Reel Script" :
    draft.format === "carousel"    ? "Review Carousel Slides" :
    draft.format === "story"       ? "Review Story" :
    isBoth                         ? "Review Both Versions" :
    "Review & Approve";

  // Build final content string for save
  function buildFinalContent(): string {
    if (isSectioned && defs) return reconstructSections(defs, sections);
    return content;
  }

  // Build copy text (same as final content)
  const copyText = buildFinalContent();

  async function handleApprove() {
    if (!draft || saving) return;
    setSaving(true);
    try {
      await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: buildFinalContent(),
          topic: draft.topic,
          format: draft.format,
          platform: draft.platform,
          status: "approved",
          scheduledDate: null,
          imageDataUrl: draft.imageDataUrl ?? null,
          videoMeta: draft.videoMeta ?? null,
        }),
      });
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

        {/* Photo banner — for non-reel, non-script formats */}
        {!["reel script", "carousel"].includes(draft.format) && !isBoth && draft.imageDataUrl && (
          <div className="border-b border-gray-100">
            <img src={draft.imageDataUrl} alt="Post photo" className="w-full max-h-64 object-cover" />
          </div>
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
            {approved
              ? "✓ Approved"
              : saving
              ? "Saving…"
              : "Approve & Save"}
          </button>

          <CopyButton
            text={copyText}
            label={
              draft.format === "reel script" ? "Copy Script" :
              draft.format === "carousel"    ? "Copy All Slides" :
              isBoth                         ? "Copy Both Versions" :
              "Copy"
            }
          />

          <button
            onClick={() => router.push("/generate")}
            className="px-5 py-2.5 border border-gray-200 bg-white text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
          >
            Regenerate
          </button>

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
    </div>
  );
}
