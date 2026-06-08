"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Post = {
  id: string;
  content: string;
  topic: string;
  format: string;
  platform: string;
  status: "draft" | "approved" | "published";
  scheduledDate: string | null;
  createdAt: string;
  imageDataUrl?: string | null;
  videoMeta?: { name: string; size: number; type: string } | null;
};

type SectionDef = { key: string; label: string; icon: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  draft:     { label: "Draft",     dot: "bg-amber-400",  badge: "bg-amber-50 text-amber-700 border-amber-200" },
  approved:  { label: "Approved",  dot: "bg-[#0F6E56]",  badge: "bg-[#E8F5F1] text-[#0F6E56] border-[#0F6E56]/20" },
  published: { label: "Published", dot: "bg-gray-400",   badge: "bg-gray-100 text-gray-500 border-gray-200" },
};

const FORMAT_ICONS: Record<string, string> = {
  caption:       "📝",
  "feed post":   "📝",
  reel:          "🎬",
  story:         "📱",
  carousel:      "🎠",
  "reel script": "🎬",
};

// ── Section helpers (mirrors /review logic) ───────────────────────────────────

function getSectionDefs(format: string, platform: string): SectionDef[] | null {
  if (platform === "both") return [
    { key: "INSTAGRAM", label: "Instagram",   icon: "📸" },
    { key: "FACEBOOK",  label: "Facebook",    icon: "👥" },
  ];
  if (format === "reel script") return [
    { key: "HOOK",           label: "Hook",           icon: "🪝" },
    { key: "SCRIPT",         label: "Script",         icon: "🎙️" },
    { key: "ON-SCREEN TEXT", label: "On-screen Text", icon: "📺" },
    { key: "CTA",            label: "CTA",            icon: "👋" },
  ];
  if (format === "carousel") return [
    { key: "SLIDE 1", label: "Slide 1 — Hook",    icon: "1️⃣" },
    { key: "SLIDE 2", label: "Slide 2 — Context", icon: "2️⃣" },
    { key: "SLIDE 3", label: "Slide 3 — Detail",  icon: "3️⃣" },
    { key: "SLIDE 4", label: "Slide 4 — Story",   icon: "4️⃣" },
    { key: "SLIDE 5", label: "Slide 5 — CTA",     icon: "5️⃣" },
  ];
  if (format === "story") return [
    { key: "TEXT", label: "Story Text", icon: "📱" },
    { key: "POLL", label: "Poll",       icon: "🗳️" },
  ];
  return null;
}

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

// ── Shared small components ───────────────────────────────────────────────────

function StatusBadge({ status }: { status: Post["status"] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function Spinner({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }
  return (
    <button onClick={handleCopy}
      className="flex items-center gap-1.5 px-3.5 py-2 border border-gray-200 bg-white text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm">
      {copied ? (
        <><svg className="w-3.5 h-3.5 text-[#0F6E56] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg><span className="text-[#0F6E56]">Copied!</span></>
      ) : (
        <><svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>Copy</>
      )}
    </button>
  );
}

// ── Post Detail Modal ─────────────────────────────────────────────────────────

function PostDetailModal({ post, onClose, onMarkPublished, onPublishToMeta }: {
  post: Post;
  onClose: () => void;
  onMarkPublished: (id: string) => void;
  onPublishToMeta: (id: string) => Promise<void>;
}) {
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const defs = getSectionDefs(post.format, post.platform);
  const sections = defs ? parseSections(post.content, defs) : null;
  const isBoth = post.platform === "both";

  const dateStr = new Date(post.createdAt).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });

  async function handlePublish() {
    setPublishing(true);
    setPublishResult(null);
    try {
      await onPublishToMeta(post.id);
      setPublishResult("Published ✓");
    } catch (e) {
      setPublishResult(e instanceof Error ? e.message : "Failed");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Panel */}
      <div className="relative z-10 bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[96dvh] sm:max-h-[90vh] rounded-t-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-start gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#0F6E56]/10 flex items-center justify-center text-lg select-none shrink-0 mt-0.5">
            {FORMAT_ICONS[post.format] ?? "📝"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-gray-900 leading-snug line-clamp-2">{post.topic}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
              <span className="text-xs text-gray-400 capitalize">{post.format}</span>
              <span className="text-gray-300 text-xs">·</span>
              <span className="text-xs text-gray-400">{post.platform}</span>
              <span className="text-gray-300 text-xs">·</span>
              <span className="text-xs text-gray-400">{dateStr}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={post.status} />
            <button onClick={onClose}
              className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors text-gray-400 hover:text-gray-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto flex-1 overscroll-contain">

          {/* Photo */}
          {post.imageDataUrl && (
            <div className="border-b border-gray-100">
              <img src={post.imageDataUrl} alt="Post photo" className="w-full max-h-64 object-cover" />
            </div>
          )}

          {/* Video meta */}
          {post.videoMeta && (
            <div className="flex items-center gap-2.5 px-5 sm:px-6 py-3 bg-gray-50 border-b border-gray-100 text-sm text-gray-600">
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span className="truncate">{post.videoMeta.name}</span>
              <span className="text-gray-400 shrink-0">({(post.videoMeta.size / (1024 * 1024)).toFixed(1)} MB)</span>
            </div>
          )}

          {/* Content — sections or plain */}
          {defs && sections ? (
            <div className={isBoth ? "sm:grid sm:grid-cols-2 sm:divide-x divide-gray-100" : "divide-y divide-gray-100"}>
              {defs.map(({ key, label, icon }) => (
                <div key={key} className="px-5 sm:px-6 py-5 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-sm select-none">{icon}</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</span>
                  </div>
                  {sections[key] ? (
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{sections[key]}</p>
                  ) : (
                    <p className="text-sm text-gray-300 italic">—</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 sm:px-6 py-5">
              {/* Split caption + hashtags for feed/reel posts */}
              {(() => {
                const parts = post.content.split(/\n\n+/);
                const lastPart = parts[parts.length - 1] ?? "";
                const hasHashtags = lastPart.trim().startsWith("#");
                const caption = hasHashtags ? parts.slice(0, -1).join("\n\n") : post.content;
                const hashtags = hasHashtags ? lastPart : null;
                return (
                  <>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{caption}</p>
                    {hashtags && (
                      <p className="text-sm text-[#0F6E56] mt-3 leading-relaxed">{hashtags}</p>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-5 sm:px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center gap-2.5 shrink-0">
          {post.status === "approved" && (
            <>
              <button onClick={handlePublish} disabled={publishing}
                className="flex items-center gap-1.5 text-sm px-4 py-2 bg-[#0F6E56] text-white rounded-xl hover:bg-[#0A5A45] disabled:opacity-60 transition-colors font-medium shadow-sm">
                {publishing ? <><Spinner />Publishing…</> : "Publish to Meta"}
              </button>
              <button onClick={() => { onMarkPublished(post.id); onClose(); }}
                className="text-sm px-4 py-2 border border-gray-200 bg-white text-gray-600 rounded-xl hover:bg-gray-50 transition-colors shadow-sm">
                Mark Published
              </button>
            </>
          )}
          <CopyButton text={post.content} />
          {publishResult && (
            <span className={`text-xs font-medium ml-1 ${publishResult.includes("✓") ? "text-[#0F6E56]" : "text-red-500"}`}>
              {publishResult}
            </span>
          )}
          <button onClick={onClose}
            className="ml-auto text-sm text-gray-400 hover:text-gray-600 transition-colors px-2 py-2">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Post Card ─────────────────────────────────────────────────────────────────

function PostCard({ post, onDoubleClick, onMarkPublished, onPublishToMeta }: {
  post: Post;
  onDoubleClick: () => void;
  onMarkPublished: (id: string) => void;
  onPublishToMeta: (id: string) => Promise<void>;
}) {
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);

  const dateStr = new Date(post.createdAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  async function handlePublish(e: React.MouseEvent) {
    e.stopPropagation();
    setPublishing(true);
    setPublishResult(null);
    try {
      await onPublishToMeta(post.id);
      setPublishResult("Published ✓");
    } catch (e) {
      setPublishResult(e instanceof Error ? e.message : "Failed");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div
      onDoubleClick={onDoubleClick}
      title="Double-click to view full post"
      className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md hover:border-gray-300 transition-all duration-200 cursor-pointer select-none group"
    >
      {/* Photo thumbnail */}
      {post.imageDataUrl && (
        <div className="aspect-video overflow-hidden bg-gray-100 shrink-0">
          <img src={post.imageDataUrl} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" />
        </div>
      )}

      {/* Video badge */}
      {!post.imageDataUrl && post.videoMeta && (
        <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center shrink-0">
          <div className="flex flex-col items-center gap-1.5 text-white/40">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <span className="text-xs">{post.videoMeta.name.split(".").pop()?.toUpperCase()}</span>
          </div>
        </div>
      )}

      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <StatusBadge status={post.status} />
          <span className="text-xs text-gray-400 shrink-0 mt-0.5">{dateStr}</span>
        </div>

        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900 mb-1.5 line-clamp-1">{post.topic}</p>
          <p className="text-sm text-gray-500 leading-relaxed line-clamp-3">{post.content}</p>
        </div>

        <div className="pt-3 border-t border-gray-100 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span>{FORMAT_ICONS[post.format] ?? "📝"}</span>
              <span className="capitalize">{post.format}</span>
              <span>·</span>
              <span>{post.platform}</span>
            </div>
            {/* Hint */}
            <span className="text-[10px] text-gray-300 group-hover:text-gray-400 transition-colors hidden sm:block">
              double-click to open
            </span>
          </div>

          {post.status === "approved" && (
            <div className="flex flex-wrap gap-2">
              <button onClick={handlePublish} disabled={publishing}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#0F6E56] text-white rounded-lg hover:bg-[#0A5A45] disabled:opacity-60 transition-colors font-medium shadow-sm">
                {publishing ? <><Spinner />Publishing…</> : "Publish to Meta"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onMarkPublished(post.id); }}
                className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">
                Mark Published
              </button>
            </div>
          )}

          {publishResult && (
            <p className={`text-xs font-medium ${publishResult.includes("✓") ? "text-[#0F6E56]" : "text-red-500"}`}>
              {publishResult}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Dashboard Page ────────────────────────────────────────────────────────────

const FILTERS = ["all", "draft", "approved", "published"] as const;
type Filter = (typeof FILTERS)[number];

export default function DashboardPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  useEffect(() => {
    fetch("/api/posts")
      .then((r) => r.json())
      .then((data: Post[]) => { setPosts(data.reverse()); setLoading(false); });
  }, []);

  async function markPublished(id: string) {
    await fetch("/api/posts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "published" }),
    });
    setPosts((prev) => prev.map((p) => p.id === id ? { ...p, status: "published" as const } : p));
    // Update modal post too if open
    setSelectedPost((prev) => prev?.id === id ? { ...prev, status: "published" as const } : prev);
  }

  async function publishToMeta(id: string) {
    const res = await fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Publish failed");
    setPosts((prev) => prev.map((p) => p.id === id ? { ...p, status: "published" as const } : p));
    setSelectedPost((prev) => prev?.id === id ? { ...prev, status: "published" as const } : prev);
    return data;
  }

  const filtered = filter === "all" ? posts : posts.filter((p) => p.status === filter);

  const counts = {
    all:       posts.length,
    draft:     posts.filter((p) => p.status === "draft").length,
    approved:  posts.filter((p) => p.status === "approved").length,
    published: posts.filter((p) => p.status === "published").length,
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-20 justify-center">
        <Spinner className="h-4 w-4 text-[#0F6E56]" />
        Loading posts…
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Content Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">{posts.length} post{posts.length !== 1 ? "s" : ""} total</p>
        </div>
        <Link href="/generate"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0F6E56] text-white rounded-xl text-sm font-medium hover:bg-[#0A5A45] transition-colors shadow-sm">
          + New Post
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="mb-6 overflow-x-auto pb-0.5">
        <div className="flex gap-1 bg-white rounded-xl border border-gray-200 shadow-sm p-1 w-fit min-w-max">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                filter === f ? "bg-[#0F6E56] text-white" : "text-gray-500 hover:text-gray-700"
              }`}>
              {f}
              <span className={`ml-1.5 text-xs ${filter === f ? "text-white/70" : "text-gray-400"}`}>
                {counts[f]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-24 text-gray-400">
          <div className="text-5xl mb-4">📭</div>
          <p className="text-sm font-medium text-gray-500 mb-1">No posts yet</p>
          <p className="text-sm text-gray-400">
            <Link href="/generate" className="text-[#0F6E56] hover:underline">Generate your first one →</Link>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onDoubleClick={() => setSelectedPost(post)}
              onMarkPublished={markPublished}
              onPublishToMeta={publishToMeta}
            />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onMarkPublished={markPublished}
          onPublishToMeta={publishToMeta}
        />
      )}
    </div>
  );
}
