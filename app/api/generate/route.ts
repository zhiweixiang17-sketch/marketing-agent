import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync, copyFileSync } from "fs";
import path from "path";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SEED_PATH = path.join(process.cwd(), "data/brand.json");
const TMP_PATH = "/tmp/brand.json";

function readBrand() {
  if (!existsSync(TMP_PATH) && existsSync(SEED_PATH)) copyFileSync(SEED_PATH, TMP_PATH);
  return JSON.parse(readFileSync(existsSync(TMP_PATH) ? TMP_PATH : SEED_PATH, "utf-8"));
}

const toneDescriptions: Record<string, string> = {
  Warm:         "warm, approachable, and storytelling — like a knowledgeable friend",
  Bold:         "confident, direct, and exciting — makes people stop scrolling",
  Playful:      "fun, witty, and lighthearted — never takes itself too seriously",
  Professional: "polished, credible, and informative — builds trust and authority",
};

// Formats that produce a single structured output regardless of platform.
// "Both" platform is only meaningful for feed post and reel.
const SINGLE_PLATFORM_FORMATS = new Set(["story", "reel script", "voice-reel"]);

export async function POST(req: Request) {
  const { topic, format, platform } = await req.json();

  const brand = readBrand();
  const toneDescription = toneDescriptions[brand.tone_of_voice] ?? brand.tone_of_voice;

  // ── Format instructions ───────────────────────────────────────────────────

  const formatInstructions: Record<string, string> = {
    "feed post": `Write an engaging feed post caption. STRUCTURE:
- Line 1: Hook — a scene, question, sensory detail, or surprising fact (NEVER start with a product name)
- Lines 2-4: The story — why this moment matters, specific and human details, a little opinionated
- Line 5: Soft CTA or genuine question
- 2 blank lines
- Exactly 10 hashtags on one line: 3 broad, 4 medium, 3 niche`,

    reel: `Write a short, punchy Instagram Reel caption.
- Line 1: Hook — 1 bold sentence that stops mid-scroll (under 8 words)
- Lines 2-3: Brief context or story — tight, every word earns its place
- Last line: Soft question or CTA
- 1 blank line
- Exactly 5 hashtags: 2 trending-broad, 3 niche
Keep the ENTIRE caption under 80 words. Reel viewers skim fast.`,

    story: `Write text for an Instagram / Facebook Story.
Output EXACTLY in this format with these headers on their own lines:

TEXT
[1-2 lines — bold statement, question, or sensory hook. Under 10 words. Punchy enough to read in 2 seconds.]

POLL
[Poll question on its own line]
[Option A / Option B on the next line]

Keep it ultra-brief — Stories are glanced at in 3 seconds.`,

    "reel script": `Write a short-form video script for a 15–30 second reel.
Output EXACTLY in this format with each header on its own line:

HOOK
[One punchy line — sensory, surprising, or bold. Max 3 seconds spoken aloud.]

SCRIPT
[Voiceover — 10–20 seconds when read aloud. Natural spoken language. Short sentences, natural pauses. Specific details: vintage year, grape variety, flavour notes. No bullet points — flowing speech.]

ON-SCREEN TEXT
[3–5 text overlay suggestions, one per line. Short phrases only, not full sentences.]

CTA
[One soft closing line — question or invitation, 3–5 seconds. Never a hard sell.]

Write everything as spoken language — contractions, natural rhythm.`,

    "voice-reel": `Write a 30-second spoken voiceover script for an Instagram Reel.
The owner's voice will narrate over a photo slideshow.

Output EXACTLY in this format with each header on its own line:

HOOK
[One bold opening line, 0-3 seconds spoken aloud. Punchy, immediate, sensory. Max 12 words.]

INTRO
[Warm, natural description — 15-20 seconds when read aloud. Conversational, intimate. Short sentences. Specific: vintage, grape, place, story. End with a natural pause.]

CTA
[Soft spoken invitation, 5-10 seconds. e.g. "Come visit us this weekend" or "Find the link in our bio." Never a hard sell.]

Write for the spoken word — contractions, natural rhythm, zero marketing jargon.`,

    // Backward compatibility
    caption: `Write an engaging feed post caption. STRUCTURE:
- Line 1: Hook — scene, question, sensory detail (never a product name)
- Lines 2-4: The story — specific, human, opinionated
- Line 5: Soft CTA or question
- 2 blank lines
- Exactly 15 hashtags: 5 broad, 5 medium, 5 niche`,
  };

  // ── Platform instructions ─────────────────────────────────────────────────

  const isBothVersions = platform === "both" && !SINGLE_PLATFORM_FORMATS.has(format);

  const platformNote = isBothVersions
    ? `Generate TWO separate versions using EXACTLY this structure:

INSTAGRAM
[Instagram version — shorter, punchy, with hashtags, visual-first language]

FACEBOOK
[Facebook version — longer, conversational, personal tone, no hashtags]`
    : platform === "Facebook"
    ? "Write for Facebook — conversational, personal, slightly longer, no hashtags."
    : "Write for Instagram — visual language, punchy, with hashtags.";

  // ── System prompt ─────────────────────────────────────────────────────────

  const systemPrompt = `You are a social media expert who has studied thousands of high-performing winery posts. You write copy that sounds exactly like a passionate, knowledgeable winery owner — never like a marketing department or AI.

You are writing for: ${brand.business_name}, a ${brand.business_type} based in ${brand.location}${brand.founded_year ? `, founded in ${brand.founded_year}` : ""}.

BRAND VOICE:
- Tone: ${toneDescription}
- Content pillars: ${brand.content_pillars.join(", ")}
- Key products: ${brand.key_products.join(", ")}
- Target audience: ${brand.target_customer}
${brand.always_say?.length ? `- Always incorporate naturally: ${brand.always_say.join(", ")}` : ""}

RULES:
- Never start with "Excited to", "We're thrilled", "Introducing", or "We're proud"
- Never use: passionate, journey, elevate, curated, bespoke, artisanal, delightful, crafted with care${brand.never_say?.length ? `, ${brand.never_say.join(", ")}` : ""}
- Open with a scene, question, surprising fact, or sensory detail — never a product name
- Use specific details: vintage year, exact grape, flavour notes, specific place
- Mix short punchy sentences with longer ones — humans don't write in uniform rhythm
- At least one line should feel unexpected or slightly surprising

${platformNote}`;

  const isStructured = SINGLE_PLATFORM_FORMATS.has(format) || isBothVersions;

  const userPrompt = `Topic: ${topic}

${formatInstructions[format] ?? formatInstructions["feed post"]}

${isStructured
  ? "Output ONLY the formatted content — use the section headers exactly as shown. No preamble, no commentary."
  : "Output only the final copy — no preamble, no labels, no explanation."}`;

  const stream = client.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }
      controller.close();
    },
    cancel() { stream.abort(); },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
