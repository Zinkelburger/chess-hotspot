'use client';
import { useState, type FormEvent } from 'react';
import type { SpotCategory } from '@/types/spot';

const categories: SpotCategory[] = ['park', 'tournament', 'club'];

export default function SubmitClub() {
  const [name, setName]         = useState('');
  const [category, setCategory] = useState<SpotCategory>('club');
  const [gmap, setGmap]         = useState('');
  const [website, setWebsite]   = useState('');
  const [notes, setNotes]       = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name) return;
    await fetch('/api/submit', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, category, gmap, website, notes }),
    });
    setSubmitted(true);
    setName(''); setCategory('club'); setGmap(''); setWebsite(''); setNotes('');
  };

  if (submitted) {
    return <p className="p-6 text-center text-primary font-medium">
             Thanks for your submission!
           </p>;
  }

  return (
    <form onSubmit={submit} className="space-y-5 w-full">
      <h3 className="font-semibold text-lg text-primary">Submit a club</h3>

      <input
        className="block w-full rounded-md border border-secondary bg-background
                   px-3 py-2 text-text placeholder:text-secondary/70
                   focus:outline-none focus:ring-2 focus:ring-primary"
        placeholder="Club name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />

      <label htmlFor="category" className="text-sm font-medium text-text">
        Category
      </label>
      <select
        id="category"
        className="block w-full rounded-md border border-secondary bg-background
                   px-3 py-2 text-text capitalize
                   focus:outline-none focus:ring-2 focus:ring-primary"
        value={category}
        onChange={(e) => setCategory(e.target.value as SpotCategory)}
      >
        {categories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <input
        className="block w-full rounded-md border border-secondary bg-background
                   px-3 py-2 text-text placeholder:text-secondary/70
                   focus:outline-none focus:ring-2 focus:ring-primary"
        placeholder="Google Maps link"
        value={gmap}
        onChange={(e) => setGmap(e.target.value)}
        required
      />

      <input
        className="block w-full rounded-md border border-secondary bg-background
                   px-3 py-2 text-text placeholder:text-secondary/70
                   focus:outline-none focus:ring-2 focus:ring-primary"
        placeholder="Website (optional)"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />

      <textarea
        rows={3}
        className="block w-full rounded-md border border-secondary bg-background
                   px-3 py-2 text-text placeholder:text-secondary/70
                   focus:outline-none focus:ring-2 focus:ring-primary"
        placeholder="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <button
        type="submit"
        className="w-full rounded-md bg-primary py-2 text-background font-semibold
                   hover:bg-primary/90 active:bg-primary/80 transition"
      >
        Submit
      </button>
    </form>
  );
}
