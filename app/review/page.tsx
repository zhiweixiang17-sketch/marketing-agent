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

export default function ReviewPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("draft");
    if (raw) {
      const d = JSON.parse(raw) as Draft;
      setDraft(d);
      setContent(d.content);
    }
  }, []);

  async function handleApprove() {
    if (!draft || saving) return;
    setSaving(true);
    await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
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
        <button onClick={() => router.push("/generate")} className="text-sm text-[#0F6E56] hover:underline font-medium">
          Generate a post →
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Review & Approve</h1>
        <p className="text-sm text-gray-500 mt-1 capitalize">
          {draft.format} · {draft.platform} · {draft.topic}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Photo preview */}
        {draft.imageDataUrl && (
          <div className="border-b border-gray-100">
            <img
              src={draft.imageDataUrl}
              alt="Post photo"
              className="w-full max-h-72 object-cover"
            />
          </div>
        )}

        <div className="px-5 sm:px-8 py-6 sm:py-8">
          <label className="block text-sm font-medium text-gray-700 mb-2">Generated Content</label>
          <textarea
            className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/25 focus:border-[#0F6E56] min-h-[260px] resize-y font-mono leading-relaxed transition-colors bg-white"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-2">Edit the copy directly before approving.</p>
        </div>

        <div className="px-5 sm:px-8 py-4 sm:py-5 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-3">
          <button
            onClick={handleApprove}
            disabled={saving || approved}
            className="px-5 py-2.5 bg-[#0F6E56] text-white rounded-xl text-sm font-medium hover:bg-[#0A5A45] disabled:opacity-50 transition-colors shadow-sm"
          >
            {approved ? "✓ Approved" : saving ? "Saving…" : "Approve & Save"}
          </button>
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
