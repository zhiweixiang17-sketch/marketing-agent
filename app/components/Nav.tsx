"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/generate", label: "Generate" },
  { href: "/setup", label: "Brand Setup" },
];

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <path d="M3 5h14M3 10h14M3 15h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <div className="w-7 h-7 bg-[#0F6E56] rounded-md flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1C4 1 2 3.5 2 6c0 2 1 3.5 2.5 4.5V12h5v-1.5C11 9.5 12 8 12 6c0-2.5-2-5-5-5z" fill="white" fillOpacity=".9" />
              <rect x="5.5" y="11.5" width="3" height="1" rx=".5" fill="white" fillOpacity=".7" />
            </svg>
          </div>
          <span className="font-semibold text-gray-900 text-sm tracking-tight">Marketing Agent</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith(href)
                  ? "bg-[#E8F5F1] text-[#0F6E56]"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/generate"
            className="ml-4 px-4 py-1.5 bg-[#0F6E56] text-white rounded-lg text-sm font-medium hover:bg-[#0A5A45] transition-colors shadow-sm"
          >
            + New Post
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="sm:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="sm:hidden border-t border-gray-100 bg-white px-4 pt-3 pb-4 flex flex-col gap-1 shadow-lg">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.startsWith(href)
                  ? "bg-[#E8F5F1] text-[#0F6E56]"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/generate"
            onClick={() => setOpen(false)}
            className="mt-2 px-4 py-2.5 bg-[#0F6E56] text-white rounded-xl text-sm font-medium text-center hover:bg-[#0A5A45] transition-colors shadow-sm"
          >
            + New Post
          </Link>
        </div>
      )}
    </nav>
  );
}
