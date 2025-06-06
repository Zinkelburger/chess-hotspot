'use client';
import { useState } from 'react';
import type { SpotCategory } from '@/types/spot';

const categories: SpotCategory[] = ['park', 'tournament', 'club'];

export default function SubmitClub() {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<SpotCategory>('club');
  const [gmap, setGmap] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (!name) return;
    await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, gmap, website, notes })
    });
    setSubmitted(true);
    setName('');
    setCategory('club');
    setGmap('');
    setWebsite('');
    setNotes('');
  };

  if (submitted) return <p className="p-4">Thanks for your submission!</p>;

  return (
    <div className="p-4 space-y-3 bg-gray-50 rounded border">
      <h3 className="font-semibold text-lg">Submit a club</h3>
      <input
        className="border p-1 w-full rounded"
        placeholder="Club name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label className="block text-sm font-medium" htmlFor="category">
        Category
      </label>
      <select
        id="category"
        className="border p-1 w-full rounded"
        value={category}
        onChange={(e) => setCategory(e.target.value as SpotCategory)}
      >
        {categories.map((c) => (
          <option key={c} value={c} className="capitalize">
            {c}
          </option>
        ))}
      </select>
      <input
        className="border p-1 w-full rounded"
        placeholder="Google Maps link"
        value={gmap}
        onChange={(e) => setGmap(e.target.value)}
      />
      <input
        className="border p-1 w-full rounded"
        placeholder="Website (optional)"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />
      <textarea
        className="border p-1 w-full rounded"
        placeholder="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <button
        className="bg-emerald-500 text-white px-3 py-1 rounded"
        onClick={submit}
      >
        Submit
      </button>
    </div>
  );
}