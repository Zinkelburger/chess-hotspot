'use client';

import { useState, type FormEvent } from 'react';
import type { SpotCategory } from '@/types/spot';

const CATEGORIES: SpotCategory[] = ['park', 'tournament'];

const fieldClass =
  'block w-full rounded-md border border-gray-300 bg-gray-50 text-gray-800 px-2 py-1.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none';

export default function SubmitClub() {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<SpotCategory>('park');
  const [gmap, setGmap] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setError(false);
    try {
      await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, gmap, website, notes }),
      });
      setSubmitted(true);
    } catch {
      setError(true);
    }
  };

  if (submitted) {
    return (
      <p className="p-6 text-center text-primary font-medium">
        Thanks for your submission!
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 w-full max-w-sm mx-auto">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Club name
        <input
          type="text"
          className={fieldClass}
          placeholder="Club name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Category
        <select
          className={fieldClass}
          value={category}
          onChange={(e) => setCategory(e.target.value as SpotCategory)}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c[0].toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Google Maps link
        <input
          type="url"
          className={fieldClass}
          placeholder="https://maps.google.com/..."
          value={gmap}
          onChange={(e) => setGmap(e.target.value)}
          required
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Website (optional)
        <input
          type="url"
          className={fieldClass}
          placeholder="https://example.com"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Notes
        <textarea
          rows={3}
          className={fieldClass}
          placeholder="Any extra details"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      {error && (
        <p className="text-red-600 text-sm text-center">
          Something went wrong. Please try again.
        </p>
      )}

      <button
        type="submit"
        className="pretty-pill pretty-pill-green mx-auto px-6 py-2 text-base"
      >
        Submit
      </button>
    </form>
  );
}
