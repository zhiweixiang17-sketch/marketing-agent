/**
 * POST /api/voice
 *
 * Generates a spoken voiceover using the ElevenLabs text-to-speech API
 * and returns the audio bytes as audio/mpeg.
 *
 * Body: { voiceId: string, text: string }
 */

export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { error: "ELEVENLABS_API_KEY is not configured. Add it to your .env.local and Vercel environment variables." },
      { status: 400 }
    );
  }

  const { voiceId, text } = (await req.json()) as { voiceId: string; text: string };

  if (!voiceId || !text?.trim()) {
    return Response.json({ error: "Missing voiceId or text." }, { status: 400 });
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key":   apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id:          "eleven_multilingual_v2",
        voice_settings: {
          stability:        0.5,
          similarity_boost: 0.85,
          style:            0.2,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return Response.json(
      { error: `ElevenLabs API error ${res.status}: ${errText}` },
      { status: res.status }
    );
  }

  const audioBuffer = await res.arrayBuffer();
  return new Response(audioBuffer, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}
