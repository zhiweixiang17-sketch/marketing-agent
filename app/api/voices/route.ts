/**
 * GET /api/voices
 *
 * Returns the six macOS built-in voices — no external API needed.
 */

import { VOICE_LIBRARY } from "@/voices.config";

export type AccountVoice = {
  id: string;
  name: string;
  label: string;
  description: string;
};

export async function GET() {
  return Response.json(VOICE_LIBRARY satisfies AccountVoice[]);
}
