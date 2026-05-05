"use client";

import { useEffect } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-20 text-center">
      <h1 className="font-serif text-3xl text-ink mb-4">
        Something went wrong
      </h1>
      <p className="font-sans text-ink-muted mb-8">
        An unexpected error occurred. You can try again or reload the page.
      </p>
      <button
        onClick={reset}
        className="font-sans text-sm px-6 py-2 border border-ink/30 rounded-sm text-ink hover:bg-ink/5 transition-colors"
      >
        Try again
      </button>
    </main>
  );
}
