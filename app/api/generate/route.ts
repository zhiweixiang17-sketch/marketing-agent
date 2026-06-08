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
  Warm: "warm, approachable, and storytelling — like a knowledgeable friend",
  Bold: "confident, direct, and exciting — makes people stop scrolling",
  Playful: "fun, witty, and lighthearted — never takes itself too seriously",
  Professional: "polished, credible, and informative — builds trust and authority",
};

export async function POST(req: Request) {
  const { topic, format, platform } = await req.json();

  const brand = readBrand();

  const toneDescription = toneDescriptions[brand.tone_of_voice] ?? brand.tone_of_voice;

  const formatInstructions: Record<string, string> = {
    caption: `Write a caption following the STRUCTURE exactly:
- Line 1: Hook (question, bold statement, sensory detail, or scene — never a product name)
- Lines 2-4: The story or detail — why this wine/moment matters
- Line 5: Soft CTA or genuine question that invites engagement
- Then 2 blank lines
- Then hashtags on their own line: exactly 15 hashtags — 5 broad, 5 medium, 5 niche`,
    "reel script": `Write a short-form video script (15–30 seconds when read aloud).
- Hook (0-3s): One punchy line that stops the scroll — sensory, surprising, or bold
- Body (3-20s): The story or detail in natural spoken language, like talking to a friend
- CTA (20-30s): A soft question or invitation, never a hard sell
Label each section. Write it to be spoken aloud, not read — short sentences, natural pauses.`,
    story: `Write a 3-slide Instagram/Facebook Story sequence.
- Slide 1: Bold hook — one line, stops the scroll
- Slide 2: The story or detail — 2-3 short lines, specific and human
- Slide 3: Soft CTA or question — invites a reply or visit, never salesy
Label each slide. Each slide should work as a standalone thought.`,
  };

  const platformNote =
    platform === "both"
      ? "Write for both Instagram and Facebook — conversational but polished."
      : `Write for ${platform}.`;

  const systemPrompt = `You are a social media expert who has studied thousands of high-performing winery Instagram posts. You write captions that sound exactly like a passionate, knowledgeable winery owner wrote them personally — never like a marketing department or AI.

You are writing for: ${brand.business_name}, a ${brand.business_type} based in ${brand.location}${brand.founded_year ? `, founded in ${brand.founded_year}` : ""}.

BRAND VOICE:
- Tone: ${toneDescription}
- Content pillars to draw from: ${brand.content_pillars.join(", ")}
- Key products to reference when relevant: ${brand.key_products.join(", ")}
- Target audience: ${brand.target_customer}
${brand.always_say?.length ? `- Always incorporate naturally: ${brand.always_say.join(", ")}` : ""}

RULES FOR EVERY POST:
- Never start with "Excited to", "We're thrilled", "Introducing", or "We're proud"
- Never use these words: passionate, journey, elevate, curated, bespoke, artisanal, delightful, crafted with care${brand.never_say?.length ? `, ${brand.never_say.join(", ")}` : ""}
- Always open with a scene, a question, a surprising fact, or a sensory detail — never a product name
- Use specific details: name the vintage year, the exact grape, the flavor notes, the specific location
- Mix short punchy sentences with longer ones — humans don't write in uniform rhythm
- Occasionally use incomplete thoughts or conversational asides — like a real person talking
- At least one line should feel unexpected or slightly surprising
- End with a genuine question or soft invitation — never a hard sell
- Write like you're texting a friend who loves wine — warm, specific, a little opinionated

EXAMPLES OF GOOD OPENING LINES:
"The 2021 blocks almost broke us. Late frost in April, smoke in August. What survived was something else entirely."
"Cold hands, purple teeth, and the best day of the year. Harvest started this morning."
"Nobody talks about what Syrah smells like before it goes in the glass. Like violets and a butcher shop. Weird. Perfect."

EXAMPLES OF BAD OPENING LINES (never write like this):
"We're excited to share our new 2022 Cabernet Sauvignon!"
"Crafted with passion from our estate vineyard..."
"Elevate your wine experience with our latest release."

${platformNote}`;

  const userPrompt = `Topic: ${topic}

${formatInstructions[format] ?? formatInstructions["caption"]}

Output only the final copy — no preamble, no labels like "Caption:", no explanation.`;

  const stream = client.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }
      controller.close();
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
