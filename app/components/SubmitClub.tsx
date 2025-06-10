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
    return (
      <p className="p-6 text-center text-primary font-medium">
        Thanks for your submission!
      </p>
    );
  }

  // shared style for all fields
  const fieldStyle: React.CSSProperties = {
    display:     'block',
    width:       '100%',
    background:  '#f8f8f8',
    boxSizing:    'border-box',
    color:       '#333333',
    border:      '1px solid #ccc',
    borderRadius:'0.375rem',
    padding:     '0.25rem 0.15rem',
  };

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-sm mx-auto"
      style={{
        display: 'flex',
        flexDirection: 'column',
        rowGap: '0.75rem',
      }}
    >
      {/* Name */}
      <label className="block text-sm font-medium">
        Club name
        <input
          type="text"
          style={fieldStyle}
          placeholder="Club name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>

      {/* Category */}
      <label className="block text-sm font-medium">
        Category
        <select
          style={fieldStyle}
          value={category}
          onChange={(e) => setCategory(e.target.value as SpotCategory)}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      {/* Google Maps */}
      <label className="block text-sm font-medium">
        Google Maps link
        <input
          type="url"
          style={fieldStyle}
          placeholder="https://maps.google.com/..."
          value={gmap}
          onChange={(e) => setGmap(e.target.value)}
          required
        />
      </label>

      {/* Website */}
      <label className="block text-sm font-medium">
        Website (optional)
        <input
          type="url"
          style={fieldStyle}
          placeholder="https://example.com"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </label>

      {/* Notes */}
      <label className="block text-sm font-medium">
        Notes
        <textarea
          rows={3}
          style={fieldStyle}
          placeholder="Any extra details"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      {/* Submit button */}
      <button type="submit" className="button-style mx-auto">
        Submit
      </button>
    </form>
  );
}
