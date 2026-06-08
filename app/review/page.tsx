"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Draft = {
  content: string;
  topic: string;
  format: string;
  platform: string;
  imageDataUrl?: string | null;
};

// ── Reel script helpers ───────────────────────────────────────────────────────

const REEL_KEYS = ["HOOK", "SCRIPT", "ON-SCREEN TEXT", "CTA"] as const;
type ReelKey = (typeof REEL_KEYS)[number];
type ReelSections = Record<ReelKey, string>;

const REEL_META: { key: ReelKey; label: string; icon: string; hint: string; rows: number }[] = [
  { key: "HOOK",           label: "Hook",          icon: "🪝", hint: "First 3 seconds · stops the scroll", rows: 2 },
  { key: "SCRIPT",         label: "Script",         icon: "🎙️", hint: "15–30 sec voiceover",               rows: 6 },
  { key: "ON-SCREEN TEXT", label: "On-screen Text", icon: "📺", hint: "Text overlay suggestions",           rows: 5 },
  { key: "CTA",            label: "CTA",            icon: "👋", hint: "Call to action · soft close",        rows: 2 },
];

function parseReelScript(text: string): ReelSections {
  const result: ReelSections = { HOOK: "", SCRIPT: "", "ON-SCREEN TEXT": "", CTA: "" };
  let current: ReelKey | null = null;
  let buf: string[] = [];
  for (const line of text.split("\n")) {
    const up = line.trim().toUpperCase();
    if ((REEL_KEYS as readonly string[]).includes(up)) {
      if (current !== null) result[current] = buf.join("\n").trim();
      current = up as ReelKey;
      buf = [];
    } else if (current !== null) {
      buf.push(line);
    }
  }
  if (current !== null) result[current] = buf.join("\n").trim();
  return result;
}

function reconstructReelScript(sections: ReelSections): string {
  return REEL_KEYS.map((k) => `${k}\n${sections[k]}`).join("\n\n");
}

// ── Copy Script button ────────────────────────────────────────────────────────

function CopyScriptButton({ sections }: { sections: ReelSections }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = reconstructReelScript(sections);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 bg-white text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
    >
      {copied ? (
        <>
          <svg className="w-4 h-4 text-[#0F6E56] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-[#0F6E56] font-medium">Copied!</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
          </svg>
          Copy Script
        </>
      )}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [content, setContent] = useState("");
  const [sections, setSections] = useState<ReelSections>({
    HOOK: "", SCRIPT: "", "ON-SCREEN TEXT": "", CTA: "",
  });
  const [saving, setSaving] = useState(false);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("draft");
    if (raw) {
      const d = JSON.parse(raw) as Draft;
      setDraft(d);
      setContent(d.content);
      if (d.format === "reel script") {
        setSections(parseReelScript(d.content));
      }
    }
  }, []);

  const isReelScript = draft?.format === "reel script";

  async function handleApprove() {
    if (!draft || saving) return;
    setSaving(true);
    const finalContent = isReelScript ? reconstructReelScript(sections) : content;
    await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: finalContent,
        topic: draft.topic,
        format: draft.format,
        platform: draft.platform,
        status: "approved",
        scheduledDate: null,
        imageDataUrl: draft.imageDataUrl ?? null,
      }),
    });
    setSaving(false);
    setApproved(true);
    sessionStorage.removeItem("draft");
    setTimeout(() => router.push("/dashboard"), 1000);
  }

  if (!draft) {
    return (
      <div className="max-w-xl py-20 text-center">
        <p className="text-gray-400 text-sm mb-3">No draft to review.</p>
        <button
          onClick={() => router.push("/generate")}
          className="text-sm text-[#0F6E56] hover:underline font-medium"
        >
          Generate a post →
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {/* Page header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {isReelScript ? "Review Reel Script" : "Review & Approve"}
        </h1>
        <p className="text-sm text-gray-500 mt-1 capitalize">
          {draft.format} · {draft.platform} · {draft.topic}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

        {/* Photo banner — only for non-reel posts */}
        {!isReelScript && draft.imageDataUrl && (
          <div className="border-b border-gray-100">
            <img src={draft.imageDataUrl} alt="Post photo" className="w-full max-h-72 object-cover" />
          </div>
        )}

        {isReelScript ? (
          /* ── Reel script: labelled sections ── */
          <div className="divide-y divide-gray-100">
            {REEL_META.map(({ key, label, icon, hint, rows }) => (
              <div key={key} className="px-5 sm:px-8 py-5 sm:py-6">
                <div className="flex flex-wrap items-center gap-2 mb-2.5">
                  <span className="text-base select-none">{icon}</span>
                  <span className="text-sm font-semibold text-gray-800">{label}</span>
                  <span className="text-xs text-gray-400 ml-0.5">{hint}</span>
                </div>
                <textarea
                  rows={rows}
                  value={sections[key]}
                  onChange={(e) =>
                    setSections((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/25 focus:border-[#0F6E56] resize-y font-mono leading-relaxed transition-colors bg-white placeholder-gray-300"
                  placeholder={`Edit the ${label.toLowerCase()}…`}
                />
              </div>
            ))}
          </div>
        ) : (
          /* ── Caption / Story: single textarea ── */
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

        {/* Footer */}
        <div className="px-5 sm:px-8 py-4 sm:py-5 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-3">
          <button
            onClick={handleApprove}
            disabled={saving || approved}
            className="px-5 py-2.5 bg-[#0F6E56] text-white rounded-xl text-sm font-medium hover:bg-[#0A5A45] disabled:opacity-50 transition-colors shadow-sm"
          >
            {approved ? "✓ Approved" : saving ? "Saving…" : "Approve & Save"}
          </button>

          {isReelScript && <CopyScriptButton sections={sections} />}

          <button
            onClick={() => router.push("/generate")}
            className="px-5 py-2.5 border border-gray-200 bg-white text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm"
          >
            Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}
