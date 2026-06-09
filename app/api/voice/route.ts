export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    const hint =
      process.env.ELEVENLABS_API_KEY !== undefined
        ? "ELEVENLABS_API_KEY is set but empty — paste the actual key value in Vercel → Settings → Environment Variables, then redeploy."
        : "ELEVENLABS_API_KEY is not set. Add it in Vercel → Settings → Environment Variables, then redeploy.";
    return Response.json({ error: hint }, { status: 400 });
  }

  const { voiceId, text } = await req.json();

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_turbo_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

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
