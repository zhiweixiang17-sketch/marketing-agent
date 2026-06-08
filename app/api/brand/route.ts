import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import path from "path";

const SEED_PATH = path.join(process.cwd(), "data/brand.json");
const TMP_PATH = "/tmp/brand.json";

function getActivePath() {
  if (!existsSync(TMP_PATH) && existsSync(SEED_PATH)) {
    copyFileSync(SEED_PATH, TMP_PATH);
  }
  return existsSync(TMP_PATH) ? TMP_PATH : SEED_PATH;
}

export async function GET() {
  const brand = JSON.parse(readFileSync(getActivePath(), "utf-8"));
  return NextResponse.json(brand);
}

export async function POST(req: Request) {
  const body = await req.json();
  writeFileSync(TMP_PATH, JSON.stringify(body, null, 2));
  return NextResponse.json({ ok: true });
}
