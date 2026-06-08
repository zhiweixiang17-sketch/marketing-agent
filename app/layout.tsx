import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Nav from "./components/Nav";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Marketing Agent",
  description: "AI-powered social media content for small businesses",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geist.className} bg-[#F9FAFB] min-h-screen`}>
        <Nav />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">{children}</main>
      </body>
    </html>
  );
}
