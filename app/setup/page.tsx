"use client";

import { useEffect, useRef, useState } from "react";

const TONE_OPTIONS = ["Warm", "Bold", "Playful", "Professional"];

const PILLAR_OPTIONS = [
  "Winery club membership",
  "Food and wine pairing",
  "Behind-the-scenes winemaking",
  "Local events and tastings",
  "Wine education",
  "Harvest & vineyard life",
  "Product spotlights",
  "Customer stories",
];

type Brand = {
  business_name: string;
  business_type: string;
  location: string;
  tone_of_voice: string;
  content_pillars: string[];
  never_say: string[];
  key_products: string[];
  target_customer: string;
};

type VoiceSettings = {
  voiceId: string;
  voiceName: string;
  isClone: boolean;
};

export default function SetupPage() {
  const [brand, setBrand] = useState<Brand>({
    business_name: "",
    business_type: "",
    location: "",
    tone_of_voice: "Warm",
    content_pillars: [],
    never_say: [],
    key_products: [],
    target_customer: "",
  });
  const [neverSayInput, setNeverSayInput] = useState("");
  const [productsInput, setProductsInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Voice clone state
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings | null>(null);
  const [voiceTab, setVoiceTab] = useState<"record" | "upload">("record");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [cloningVoice, setCloningVoice] = useState(false);
  const [cloneSuccess, setCloneSuccess] = useState<string | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [recordedVoiceName, setRecordedVoiceName] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    fetch("/api/brand")
      .then((r) => r.json())
      .then((data) => {
        setBrand(data);
        setNeverSayInput(data.never_say?.join(", ") ?? "");
        setProductsInput(data.key_products?.join(", ") ?? "");
        setLoading(false);
      });

    // Load voice settings from localStorage
    try {
      const saved = localStorage.getItem("voiceSettings");
      if (saved) setVoiceSettings(JSON.parse(saved) as VoiceSettings);
    } catch { /* ignore */ }
  }, []);

  function togglePillar(p: string) {
    setBrand((b) => ({
      ...b,
      content_pillars: b.content_pillars.includes(p)
        ? b.content_pillars.filter((x) => x !== p)
        : [...b.content_pillars, p],
    }));
  }

  async function startRecording() {
    setCloneError(null);
    setCloneSuccess(null);
    setAudioBlob(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        setAudioBlob(new Blob(chunksRef.current, { type: "audio/webm" }));
      };
      mr.start();
      setRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds(s => {
          if (s >= 29) {
            stopRecording();
            return 30;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setCloneError("Could not access microphone. Please allow microphone permission.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  }

  async function handleCloneVoice(source: "record" | "upload") {
    const blob = source === "record" ? audioBlob : uploadFile;
    if (!blob) { setCloneError("No audio sample. Please record or upload one first."); return; }
    setCloningVoice(true);
    setCloneError(null);
    setCloneSuccess(null);
    try {
      const voiceName = recordedVoiceName.trim() || "My Voice";
      const fd = new FormData();
      fd.append("name", voiceName);
      fd.append("sample", blob instanceof File ? blob : new File([blob], "sample.webm", { type: blob.type }));
      const res = await fetch("/api/voice-clone", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `Clone error ${res.status}`);
      }
      const data = await res.json() as { voice_id: string; name: string };
      const newSettings: VoiceSettings = { voiceId: data.voice_id, voiceName: voiceName, isClone: true };
      localStorage.setItem("voiceSettings", JSON.stringify(newSettings));
      setVoiceSettings(newSettings);
      setCloneSuccess(`Voice cloned! Voice ID saved as "${voiceName}".`);
    } catch (e) {
      setCloneError(e instanceof Error ? e.message : String(e));
    } finally {
      setCloningVoice(false);
    }
  }

  async function handleSave() {
    const payload = {
      ...brand,
      never_say: neverSayInput.split(",").map((s) => s.trim()).filter(Boolean),
      key_products: productsInput.split(",").map((s) => s.trim()).filter(Boolean),
    };
    await fetch("/api/brand", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-20 justify-center">
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading brand profile...
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Brand Profile</h1>
        <p className="text-sm text-gray-500 mt-1">
          This tells Claude how to write in your voice. Keep it specific — the more detail, the better the output.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Section: Business */}
        <div className="px-5 sm:px-8 py-6 sm:py-8 space-y-5">
          <SectionLabel>Business</SectionLabel>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Business Name">
              <input
                className={input}
                value={brand.business_name}
                onChange={(e) => setBrand({ ...brand, business_name: e.target.value })}
                placeholder="e.g. Stottle Winery"
              />
            </Field>
            <Field label="Business Type">
              <input
                className={input}
                value={brand.business_type}
                onChange={(e) => setBrand({ ...brand, business_type: e.target.value })}
                placeholder="e.g. Winery, Bakery, Café"
              />
            </Field>
          </div>

          <Field label="Location">
            <input
              className={input}
              value={brand.location}
              onChange={(e) => setBrand({ ...brand, location: e.target.value })}
              placeholder="e.g. Lacey, Washington"
            />
          </Field>
        </div>

        <Divider />

        {/* Section: Voice */}
        <div className="px-5 sm:px-8 py-6 sm:py-8 space-y-5">
          <SectionLabel>Voice & Tone</SectionLabel>

          <Field label="Tone of Voice">
            <div className="flex flex-wrap gap-2 mt-1">
              {TONE_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBrand({ ...brand, tone_of_voice: t })}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    brand.tone_of_voice === t
                      ? "bg-[#0F6E56] text-white border-[#0F6E56]"
                      : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Content Pillars">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              {PILLAR_OPTIONS.map((p) => (
                <label
                  key={p}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors text-sm ${
                    brand.content_pillars.includes(p)
                      ? "border-[#0F6E56]/40 bg-[#E8F5F1] text-[#0F6E56]"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={brand.content_pillars.includes(p)}
                    onChange={() => togglePillar(p)}
                    className="accent-[#0F6E56] w-4 h-4"
                  />
                  {p}
                </label>
              ))}
            </div>
          </Field>
        </div>

        <Divider />

        {/* Section: Products & Audience */}
        <div className="px-5 sm:px-8 py-6 sm:py-8 space-y-5">
          <SectionLabel>Products & Audience</SectionLabel>

          <Field label="Key Products" hint="Comma-separated">
            <input
              className={input}
              value={productsInput}
              onChange={(e) => setProductsInput(e.target.value)}
              placeholder="e.g. 2023 Reserved Malbec, 2024 Rosé"
            />
          </Field>

          <Field label="Never Say" hint="Words or phrases to always avoid, comma-separated">
            <input
              className={input}
              value={neverSayInput}
              onChange={(e) => setNeverSayInput(e.target.value)}
              placeholder="e.g. cheap, discount, mass-produced"
            />
          </Field>

          <Field label="Target Customer">
            <textarea
              className={`${input} h-24 resize-none`}
              value={brand.target_customer}
              onChange={(e) => setBrand({ ...brand, target_customer: e.target.value })}
              placeholder="e.g. Wine-curious adults 35–70 who appreciate quality over quantity..."
            />
          </Field>
        </div>

        <Divider />

        {/* Section: Voice Setup */}
        <div className="px-5 sm:px-8 py-6 sm:py-8 space-y-5" id="voice">
          <SectionLabel>Voice Setup</SectionLabel>

          {/* Current voice info */}
          {voiceSettings ? (
            <div className="rounded-xl bg-[#E8F5F1] border border-[#0F6E56]/20 px-4 py-3 text-sm text-[#0F6E56]">
              <span className="font-semibold">Current voice:</span> {voiceSettings.voiceName}
              {voiceSettings.isClone && <span className="ml-1 text-xs bg-[#0F6E56] text-white px-2 py-0.5 rounded-full">Cloned</span>}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No cloned voice saved yet. A library voice will be used on /generate.</p>
          )}

          <Field label="Clone Your Voice" hint="Record or upload a 30-second audio sample">
            {/* Tab switcher */}
            <div className="flex gap-2 mb-4 mt-1">
              {(["record", "upload"] as const).map((tab) => (
                <button key={tab} type="button" onClick={() => setVoiceTab(tab)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors capitalize ${
                    voiceTab === tab ? "bg-[#0F6E56] text-white border-[#0F6E56]" : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {tab === "record" ? "Record Sample" : "Upload File"}
                </button>
              ))}
            </div>

            {/* Voice name input */}
            <div className="mb-4">
              <input
                className={input}
                value={recordedVoiceName}
                onChange={(e) => setRecordedVoiceName(e.target.value)}
                placeholder="Voice name (e.g. Sarah's Voice)"
              />
            </div>

            {voiceTab === "record" ? (
              <div className="space-y-3">
                {!recording && !audioBlob && (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#0F6E56] text-white rounded-xl text-sm font-medium hover:bg-[#0A5A45] transition-colors shadow-sm"
                  >
                    🎙 Start Recording
                  </button>
                )}
                {recording && (
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-2 text-sm text-red-600 font-medium">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      Recording… {recordingSeconds}s / 30s
                    </span>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors"
                    >
                      Stop &amp; Clone Voice
                    </button>
                  </div>
                )}
                {audioBlob && !recording && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-[#0F6E56]">Recording ready ({recordingSeconds}s)</span>
                    <button
                      type="button"
                      onClick={startRecording}
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                      Re-record
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCloneVoice("record")}
                      disabled={cloningVoice}
                      className="flex items-center gap-2 px-4 py-2 bg-[#0F6E56] text-white rounded-xl text-sm font-medium hover:bg-[#0A5A45] disabled:opacity-50 transition-colors"
                    >
                      {cloningVoice ? "Cloning…" : "Clone Voice"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 5.75 5.75 0 011.591 5.338A4.5 4.5 0 0117.25 19.5H6.75z" />
                    </svg>
                    {uploadFile ? uploadFile.name : "Choose audio file"}
                    <input
                      type="file"
                      accept=".mp3,.wav,.m4a,.ogg"
                      className="hidden"
                      onChange={(e) => { if (e.target.files?.[0]) setUploadFile(e.target.files[0]); }}
                    />
                  </label>
                  {uploadFile && (
                    <button
                      type="button"
                      onClick={() => handleCloneVoice("upload")}
                      disabled={cloningVoice}
                      className="flex items-center gap-2 px-4 py-2 bg-[#0F6E56] text-white rounded-xl text-sm font-medium hover:bg-[#0A5A45] disabled:opacity-50 transition-colors"
                    >
                      {cloningVoice ? "Cloning…" : "Clone Voice"}
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400">Accepts .mp3, .wav, .m4a, .ogg · at least 30 seconds recommended</p>
              </div>
            )}

            {cloneSuccess && (
              <div className="mt-3 rounded-xl bg-[#E8F5F1] border border-[#0F6E56]/20 px-4 py-3 text-sm text-[#0F6E56]">
                ✓ {cloneSuccess}
              </div>
            )}
            {cloneError && (
              <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {cloneError}
              </div>
            )}
          </Field>

          <p className="text-xs text-gray-400">
            Or choose a library voice on /generate when selecting the Voice Reel format.
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-8 py-5 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-4">
          <p className="text-xs text-gray-400">Changes apply to all future posts.</p>
          <button
            onClick={handleSave}
            className="px-6 py-2.5 bg-[#0F6E56] text-white rounded-xl text-sm font-medium hover:bg-[#0A5A45] transition-colors shadow-sm shrink-0"
          >
            {saved ? "✓ Saved" : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{children}</p>;
}

function Divider() {
  return <div className="border-t border-gray-100" />;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const input =
  "w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0F6E56]/25 focus:border-[#0F6E56] transition-colors bg-white";
