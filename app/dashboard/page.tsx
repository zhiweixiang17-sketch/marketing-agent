"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

const STATUS_CONFIG = {
  draft:     { label: "Draft",     dot: "bg-amber-400",  badge: "bg-amber-50 text-amber-700 border-amber-200" },
  approved:  { label: "Approved",  dot: "bg-[#0F6E56]",  badge: "bg-[#E8F5F1] text-[#0F6E56] border-[#0F6E56]/20" },
  published: { label: "Published", dot: "bg-gray-400",   badge: "bg-gray-100 text-gray-500 border-gray-200" },
};

const FORMAT_ICONS: Record<string, string> = {
  caption:       "📝",   // legacy
  "feed post":   "📝",
  reel:          "🎬",
  story:         "📱",
  carousel:      "🎠",
  "reel script": "🎬",
};

function StatusBadge({ status }: { status: Post["status"] }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function PostCard({
  post,
  onMarkPublished,
  onPublishToMeta,
}: {
  post: Post;
  onMarkPublished: (id: string) => void;
  onPublishToMeta: (id: string) => Promise<void>;
}) {
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);

  const dateStr = new Date(post.createdAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
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
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-200">
      {/* Photo thumbnail */}
      {post.imageDataUrl && (
        <div className="aspect-video overflow-hidden bg-gray-100 shrink-0">
          <img
            src={post.imageDataUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* Status + date */}
        <div className="flex items-start justify-between gap-2">
          <StatusBadge status={post.status} />
          <span className="text-xs text-gray-400 shrink-0 mt-0.5">{dateStr}</span>
        </div>

        {/* Topic + preview */}
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900 mb-1.5 line-clamp-1">{post.topic}</p>
          <p className="text-sm text-gray-500 leading-relaxed line-clamp-3">{post.content}</p>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-gray-100 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <span>{FORMAT_ICONS[post.format] ?? "📝"}</span>
              <span className="capitalize">{post.format}</span>
              <span>·</span>
              <span>{post.platform}</span>
            </div>
          </div>

          {/* Actions for approved posts */}
          {post.status === "approved" && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#0F6E56] text-white rounded-lg hover:bg-[#0A5A45] disabled:opacity-60 transition-colors font-medium shadow-sm"
              >
                {publishing ? <><Spinner />Publishing…</> : "Publish to Meta"}
              </button>
              <button
                onClick={() => onMarkPublished(post.id)}
                className="text-xs px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Mark Published
              </button>
            </div>
          )}

          {/* Publish result feedback */}
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

const FILTERS = ["all", "draft", "approved", "published"] as const;
type Filter = (typeof FILTERS)[number];

export default function DashboardPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

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
  }

  async function publishToMeta(id: string) {
    const res = await fetch("/api/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Publish failed");
    // Update status locally
    setPosts((prev) => prev.map((p) => p.id === id ? { ...p, status: "published" as const } : p));
    return data;
  }

  const filtered = filter === "all" ? posts : posts.filter((p) => p.status === filter);

  const counts = {
    all: posts.length,
    draft: posts.filter((p) => p.status === "draft").length,
    approved: posts.filter((p) => p.status === "approved").length,
    published: posts.filter((p) => p.status === "published").length,
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-20 justify-center">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
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
        <Link
          href="/generate"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0F6E56] text-white rounded-xl text-sm font-medium hover:bg-[#0A5A45] transition-colors shadow-sm"
        >
          + New Post
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="mb-6 overflow-x-auto pb-0.5">
        <div className="flex gap-1 bg-white rounded-xl border border-gray-200 shadow-sm p-1 w-fit min-w-max">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                filter === f ? "bg-[#0F6E56] text-white" : "text-gray-500 hover:text-gray-700"
              }`}
            >
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
              onMarkPublished={markPublished}
              onPublishToMeta={publishToMeta}
            />
          ))}
        </div>
      )}
    </div>
  );
}
