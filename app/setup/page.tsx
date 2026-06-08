"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    fetch("/api/brand")
      .then((r) => r.json())
      .then((data) => {
        setBrand(data);
        setNeverSayInput(data.never_say?.join(", ") ?? "");
        setProductsInput(data.key_products?.join(", ") ?? "");
        setLoading(false);
      });
  }, []);

  function togglePillar(p: string) {
    setBrand((b) => ({
      ...b,
      content_pillars: b.content_pillars.includes(p)
        ? b.content_pillars.filter((x) => x !== p)
        : [...b.content_pillars, p],
    }));
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
