'use client';
import { useState } from 'react';

export default function SubmitClub() {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (!name) return;
    await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, notes })
    });
    setSubmitted(true);
    setName('');
    setNotes('');
  };

  if (submitted) return <p className="p-4">Thanks for your submission!</p>;

  return (
    <div className="p-4 space-y-2 border-t">
      <h3 className="font-semibold">Submit a club</h3>
      <input
        className="border p-1 w-full rounded"
        placeholder="Club name"
        value={name}
        onChange={(e) => setName(e.target.value)}
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