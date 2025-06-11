'use client';

import clsx from 'clsx';
import Link from 'next/link';
import type { SpotCategory, DayOfWeek } from '@/types/spot';

export const CategoryColors: Record<SpotCategory, string> = {
  park: '#00e67f',
  tournament: '#3B82F6',
  club: '#F59E0B',
};

// '' represents “Any” (no filter)
const DAYS: (DayOfWeek | '')[] = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_LABELS: string[] = ['Any', 'Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat', 'Sun'];

type Props = {
  selectedCategories: SpotCategory[];
  toggleCategory: (c: SpotCategory) => void;
  selectedDays: DayOfWeek[];
  onDaysChange: (d: DayOfWeek[]) => void;
};

export default function LegendFilter({
  selectedCategories,
  toggleCategory,
  selectedDays,
  onDaysChange,
}: Props) {
  return (
    <div className="w-full h-full bg-gray-100/90 grid grid-cols-[auto_1fr_auto] items-center px-0 py-0">
      {/* LEFT GROUP — category chips */}
      <div className="flex items-center overflow-x-auto space-x-3 px-4">
        {Object.entries(CategoryColors).map(([cat, color]) => {
          const active = selectedCategories.includes(cat as SpotCategory);
          return (
            <button
              key={cat}
              onClick={() => toggleCategory(cat as SpotCategory)}
              className={clsx(
                'flex items-center space-x-2 rounded-full border',
                'transition-transform duration-200 ease-out hover:brightness-90 hover:shadow-lg',
                active ? 'text-white opacity-100' : 'text-gray-700 opacity-90 hover:opacity-100'
              )}
              style={{ backgroundColor: active ? color : 'white', borderColor: color, padding: '0.15rem 0.5rem', fontSize: '0.9rem', lineHeight: '1rem' }}
            >
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="capitalize">{cat}</span>
            </button>
          );
        })}
      </div>

      {/* MIDDLE GROUP — Suggest & GitHub (locked together) */}
      <div className="justify-self-center flex items-center space-x-3">
        <Link
          href="/club_submission"
          className="button-style inline-flex items-center rounded-full"
          style={{ fontSize: '1rem', lineHeight: '1rem', padding: '0.4rem 0.7rem' }}
        >
          <span>Suggest a Club</span>
        </Link>
        <a
          href="https://github.com/Zinkelburger/chess-hotspot"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center p-1 hover:opacity-80 transition"
        >
          <img src="/github.svg" alt="GitHub" width={28} height={28} />
        </a>
      </div>

      {/* RIGHT GROUP — Open & weekday buttons (single horizontal row) */}
      <div className="justify-self-end flex items-center gap-2 overflow-x-auto px-4 whitespace-nowrap mr-4">
        <span className="font-medium leading-none mr-1" style={{ position: 'relative', top: '-1px', fontSize: '0.9rem' }}>
          Open:
        </span>
        <div className="flex flex-nowrap gap-2" style={{ paddingRight: '1rem' }}>
          {DAYS.map((day, idx) => {
            const label = DAY_LABELS[idx];
            const active = day ? selectedDays.includes(day as DayOfWeek) : selectedDays.length === 0;
            return (
              <button
                key={`${label}-${idx}`}
                onClick={() => {
                  if (day === '') return onDaysChange([]);
                  const d = day as DayOfWeek;
                  onDaysChange(active ? selectedDays.filter((x) => x !== d) : [...selectedDays, d]);
                }}
                className={clsx(
                  'flex-shrink-0 px-2 py-1 rounded-full border leading-none transition-opacity',
                  active ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-gray-700 border-gray-300'
                )}
                style={{ opacity: active ? 1 : 0.4, fontSize: '0.8rem', lineHeight: '1rem', padding: '0.1rem 0.15rem' }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
