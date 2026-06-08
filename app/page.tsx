import Link from "next/link";

export default function Home() {
  return (
    <div className="text-center py-20">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">AI Marketing Agent</h1>
      <p className="text-lg text-gray-500 mb-10 max-w-md mx-auto">
        Generate on-brand social media content for your small business — in seconds.
      </p>
      <div className="flex justify-center gap-4">
        <Link
          href="/setup"
          className="px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700"
        >
          Set up your brand →
        </Link>
        <Link
          href="/generate"
          className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-100"
        >
          Generate a post
        </Link>
      </div>
    </div>
  );
}
