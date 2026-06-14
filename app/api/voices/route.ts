/**
 * GET /api/voices
 *
 * Returns the six hand-picked ElevenLabs premade voices from voices.config.ts.
 * All voices are "premade" category — available on every ElevenLabs plan.
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
