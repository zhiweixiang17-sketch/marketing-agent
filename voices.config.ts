/**
 * voices.config.ts
 *
 * Six macOS built-in voices for the voiceover feature.
 * Generated server-side with the macOS `say` command — no external API needed.
 *
 * id  = the exact name passed to `say -v <id>`
 */

export type VoiceEntry = {
  id: string;    // macOS voice name (passed to `say -v`)
  name: string;  // display name
  label: string; // style label shown in the UI card
  description: string;
};

export const VOICE_LIBRARY: VoiceEntry[] = [
  { id: "Samantha", name: "Samantha", label: "Warm Female",          description: "Friendly and approachable, great for lifestyle brands"   },
  { id: "Alex",     name: "Alex",     label: "Warm Male",            description: "Calm and trustworthy, ideal for heritage producers"       },
  { id: "Victoria", name: "Victoria", label: "Authoritative Female", description: "Confident and polished, perfect for premium brands"       },
  { id: "Fred",     name: "Fred",     label: "Authoritative Male",   description: "Deep and credible, commands instant attention"            },
  { id: "Karen",    name: "Karen",    label: "Enthusiastic Female",  description: "Energetic and warm, great for events and launches"        },
  { id: "Daniel",   name: "Daniel",   label: "Enthusiastic Male",    description: "Upbeat and engaging, drives action and excitement"        },
];

/** Sample sentence played when the owner clicks ▶ Play on a voice card. */
export const VOICE_SAMPLE_TEXT =
  "Welcome to our winery. Let me tell you about today's featured wine.";
