import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import path from "path";

const SEED_PATH = path.join(process.cwd(), "data/posts.json");
const TMP_PATH = "/tmp/posts.json";

function getActivePath() {
  if (!existsSync(TMP_PATH) && existsSync(SEED_PATH)) {
    copyFileSync(SEED_PATH, TMP_PATH);
  }
  return existsSync(TMP_PATH) ? TMP_PATH : SEED_PATH;
}

function readPosts() {
  return JSON.parse(readFileSync(getActivePath(), "utf-8"));
}

export async function GET() {
  return NextResponse.json(readPosts());
}

export async function POST(req: Request) {
  const body = await req.json();
  const posts = readPosts();
  const newPost = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    status: "draft",
    ...body,
  };
  posts.push(newPost);
  writeFileSync(TMP_PATH, JSON.stringify(posts, null, 2));
  return NextResponse.json(newPost);
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const posts = readPosts();
  const idx = posts.findIndex((p: { id: string }) => p.id === body.id);
  if (idx === -1) return NextResponse.json({ error: "not found" }, { status: 404 });
  posts[idx] = { ...posts[idx], ...body };
  writeFileSync(TMP_PATH, JSON.stringify(posts, null, 2));
  return NextResponse.json(posts[idx]);
}
