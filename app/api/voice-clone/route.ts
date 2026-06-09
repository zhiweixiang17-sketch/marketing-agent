export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ElevenLabs API key is not configured.", setup: "Add ELEVENLABS_API_KEY to Vercel env vars." },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const name = formData.get("name") as string;
  const sample = formData.get("sample") as File;

  if (!name || !sample) {
    return Response.json({ error: "Missing name or sample field." }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append("name", name);
  upstream.append("description", "Cloned voice");
  upstream.append("files", sample);

  const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: upstream,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return Response.json(
      { error: `ElevenLabs clone error ${res.status}: ${errText}` },
      { status: res.status }
    );
  }

  const data = await res.json();
  return Response.json({ voice_id: data.voice_id, name });
}
