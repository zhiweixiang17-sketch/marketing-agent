/**
 * voices.config.ts
 *
 * Six ElevenLabs premade voices, hand-picked from GET /v1/voices.
 * All are "premade" category — available on every ElevenLabs plan.
 */

export type VoiceEntry = {
  id: string;    // ElevenLabs voice_id
  name: string;
  label: string;
  description: string;
};

export const VOICE_LIBRARY: VoiceEntry[] = [
  {
    id: "hpp4J3VqNfWAUOO0d1Us",
    name: "Bella",
    label: "Warm Female",
    description: "Professional, bright, and warm — great for lifestyle brands",
  },
  {
    id: "JBFqnCBsd6RMkjVDRZzb",
    name: "George",
    label: "Warm Male",
    description: "Captivating storyteller — ideal for heritage producers",
  },
  {
    id: "XrExE9yKIg1WjnnlVkGX",
    name: "Matilda",
    label: "Authoritative Female",
    description: "Knowledgeable and professional — perfect for premium brands",
  },
  {
    id: "nPczCjzI2devNBz1zQrb",
    name: "Brian",
    label: "Authoritative Male",
    description: "Deep, resonant and comforting — commands instant trust",
  },
  {
    id: "FGY2WhTYpPnrIDTdsKH5",
    name: "Laura",
    label: "Enthusiastic Female",
    description: "Energetic and quirky — great for events and new releases",
  },
  {
    id: "IKne3meq5aSn9XLyUdCD",
    name: "Charlie",
    label: "Enthusiastic Male",
    description: "Confident and energetic — drives excitement and action",
  },
];

/** Sample sentence played when the owner clicks ▶ Play on a voice card. */
export const VOICE_SAMPLE_TEXT =
  "Welcome to our winery. Today I want to tell you about our latest vintage — I think you're going to love it.";
