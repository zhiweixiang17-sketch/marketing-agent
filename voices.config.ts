/**
 * voices.config.ts
 *
 * Six natural-sounding ElevenLabs pre-made voices labelled for winery use.
 * IDs are stable pre-made voices available on all ElevenLabs accounts.
 *
 * To refresh with the voices currently on your account, call:
 *   GET /api/voices   (requires ELEVENLABS_API_KEY in env vars)
 */

export type VoiceEntry = {
  id: string;
  name: string;
  label: string;
  description: string;
};

export const VOICE_LIBRARY: VoiceEntry[] = [
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    label: "Warm Female",
    description: "Friendly and approachable, great for lifestyle brands",
  },
  {
    id: "TxGEqnHWrfWFTfGW9XjX",
    name: "Josh",
    label: "Warm Male",
    description: "Calm and trustworthy, ideal for heritage producers",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Bella",
    label: "Authoritative Female",
    description: "Confident and polished, perfect for premium brands",
  },
  {
    id: "VR6AewLTigWG4xSOukaG",
    name: "Arnold",
    label: "Authoritative Male",
    description: "Deep and credible, commands instant attention",
  },
  {
    id: "MF3mGyEYCl7XYWbV9V6O",
    name: "Elli",
    label: "Enthusiastic Female",
    description: "Energetic and warm, great for events and launches",
  },
  {
    id: "ErXwobaYiN019PkySvjV",
    name: "Antoni",
    label: "Enthusiastic Male",
    description: "Upbeat and engaging, drives action and excitement",
  },
];

/** Sample sentence used when the owner clicks "Play" on a voice card. */
export const VOICE_SAMPLE_TEXT =
  "Welcome to our winery. Let me tell you about today's featured wine.";
