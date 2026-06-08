import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import path from "path";

const SEED_PATH = path.join(process.cwd(), "data/posts.json");
const TMP_PATH = "/tmp/posts.json";

function getActivePath() {
  if (!existsSync(TMP_PATH) && existsSync(SEED_PATH)) copyFileSync(SEED_PATH, TMP_PATH);
  return existsSync(TMP_PATH) ? TMP_PATH : SEED_PATH;
}

type Post = {
  id: string;
  content: string;
  platform: string;
  status: string;
  imageDataUrl?: string | null;
};

function readPosts(): Post[] {
  return JSON.parse(readFileSync(getActivePath(), "utf-8"));
}

const GV = "v19.0"; // Graph API version

/** Convert a base64 data URL into a Blob for multipart upload. */
function dataUrlToBlob(dataUrl: string): { blob: Blob; mimeType: string } {
  const [header, b64] = dataUrl.split(",");
  const mimeType = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
  const buffer = Buffer.from(b64, "base64");
  return { blob: new Blob([buffer], { type: mimeType }), mimeType };
}

/**
 * Upload image to a Facebook Page photo library (no_story = true, so it
 * doesn't appear in the feed) and return the hosted image URL.
 * We use this URL to create an Instagram media container, since Instagram's
 * API only accepts a public HTTPS URL — not a data URL or binary upload.
 */
async function uploadImageToFacebook(
  pageId: string,
  token: string,
  imageDataUrl: string
): Promise<{ photoId: string; imageUrl: string } | { error: string }> {
  const { blob, mimeType } = dataUrlToBlob(imageDataUrl);

  const fd = new FormData();
  fd.append("source", new File([blob], `photo.${mimeType.split("/")[1] ?? "jpg"}`, { type: mimeType }));
  fd.append("no_story", "true"); // Upload to photo library without publishing to feed
  fd.append("access_token", token);

  const uploadRes = await fetch(`https://graph.facebook.com/${GV}/${pageId}/photos`, {
    method: "POST",
    body: fd,
  }).then((r) => r.json());

  if (!uploadRes.id) return { error: `Facebook upload failed: ${JSON.stringify(uploadRes)}` };

  // Retrieve the hosted URL from the Graph API
  const photoData = await fetch(
    `https://graph.facebook.com/${GV}/${uploadRes.id}?fields=images&access_token=${encodeURIComponent(token)}`
  ).then((r) => r.json());

  const imageUrl: string | undefined = photoData.images?.[0]?.source;
  if (!imageUrl) return { error: "Could not retrieve hosted image URL from Facebook" };

  return { photoId: uploadRes.id, imageUrl };
}

export async function POST(req: Request) {
  const { postId } = await req.json();

  const token = process.env.META_PAGE_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;
  const igUserId = process.env.META_IG_USER_ID;

  if (!token || !pageId) {
    return NextResponse.json(
      { error: "Meta credentials not configured. Add META_PAGE_ACCESS_TOKEN and META_PAGE_ID to your environment variables." },
      { status: 400 }
    );
  }

  const posts = readPosts();
  const post = posts.find((p) => p.id === postId);
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const results: Record<string, unknown> = {};

  // ── Facebook ────────────────────────────────────────────────────────────────
  const postToFacebook = post.platform === "Facebook" || post.platform === "both";
  if (postToFacebook) {
    try {
      if (post.imageDataUrl) {
        const { blob, mimeType } = dataUrlToBlob(post.imageDataUrl);
        const fd = new FormData();
        fd.append("source", new File([blob], `photo.${mimeType.split("/")[1] ?? "jpg"}`, { type: mimeType }));
        fd.append("message", post.content);
        fd.append("access_token", token);
        const res = await fetch(`https://graph.facebook.com/${GV}/${pageId}/photos`, {
          method: "POST",
          body: fd,
        });
        results.facebook = await res.json();
      } else {
        // Text-only post
        const res = await fetch(`https://graph.facebook.com/${GV}/${pageId}/feed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: post.content, access_token: token }),
        });
        results.facebook = await res.json();
      }
    } catch (err) {
      results.facebook = { error: String(err) };
    }
  }

  // ── Instagram ───────────────────────────────────────────────────────────────
  const postToInstagram = post.platform === "Instagram" || post.platform === "both";
  if (postToInstagram) {
    if (!igUserId) {
      results.instagram = { skipped: true, reason: "META_IG_USER_ID not configured" };
    } else if (!post.imageDataUrl) {
      results.instagram = { skipped: true, reason: "Instagram requires an image — text-only posts are not supported by the API" };
    } else {
      try {
        // Step 1: Upload image to Facebook CDN to get a public URL
        const upload = await uploadImageToFacebook(pageId, token, post.imageDataUrl);
        if ("error" in upload) {
          results.instagram = { error: upload.error };
        } else {
          // Step 2: Create Instagram media container
          const container = await fetch(`https://graph.facebook.com/${GV}/${igUserId}/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image_url: upload.imageUrl,
              caption: post.content,
              access_token: token,
            }),
          }).then((r) => r.json());

          if (!container.id) {
            results.instagram = { error: "Failed to create Instagram media container", details: container };
          } else {
            // Step 3: Publish the container
            const published = await fetch(`https://graph.facebook.com/${GV}/${igUserId}/media_publish`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ creation_id: container.id, access_token: token }),
            }).then((r) => r.json());
            results.instagram = published;
          }
        }
      } catch (err) {
        results.instagram = { error: String(err) };
      }
    }
  }

  // ── Mark published ──────────────────────────────────────────────────────────
  const idx = posts.findIndex((p) => p.id === postId);
  if (idx !== -1) {
    posts[idx] = { ...posts[idx], status: "published" };
    writeFileSync(TMP_PATH, JSON.stringify(posts, null, 2));
  }

  return NextResponse.json({ ok: true, results });
}
