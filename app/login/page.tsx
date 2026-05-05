"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/");
    } else {
      setError("Incorrect password");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-paper">
      <div className="w-full max-w-sm px-8 py-10 border border-ink/10 rounded-sm shadow-sm bg-paper">
        <h1 className="font-serif text-3xl font-bold text-ink mb-8">
          Retrospection
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-ink-muted uppercase tracking-wide">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border border-ink/20 bg-paper text-ink px-3 py-2 rounded-sm focus:outline-none focus:border-ink/60"
              autoFocus
              required
            />
          </label>
          {error && (
            <p className="text-sm text-mark" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="bg-ink text-paper py-2 px-4 rounded-sm font-sans text-sm tracking-wide hover:bg-ink/90 disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
