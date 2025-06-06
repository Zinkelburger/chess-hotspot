'use client';

import clsx from 'clsx';
import Link from 'next/link';
import type { SpotCategory, DayOfWeek } from '@/types/spot';

/* ------------------------------------------------------------------ *
 * 1. Category-to-colour mapping                                       *
 * ------------------------------------------------------------------ */
export const CategoryColors: Record<SpotCategory, string> = {
  park:       '#34D399', // emerald-400
  tournament: '#3B82F6', // blue-500
  club:       '#F59E0B', // amber-500
  // add more categories → colour codes …
};

/* ------------------------------------------------------------------ *
 * 2. Legend + Filter component                                        *
 * ------------------------------------------------------------------ */
type Props = {
  selectedCategories: SpotCategory[];
  toggleCategory: (c: SpotCategory) => void;
  selectedDays: DayOfWeek[];
  onDaysChange: (d: DayOfWeek[]) => void;
};

const WEEK_DAYS: DayOfWeek[] = [
  'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday', 'Sunday'
];

export default function LegendFilter({
  selectedCategories,
  toggleCategory,
  selectedDays,
  onDaysChange
}: Props) {
    return (
    <div
      /* fills the 10% bar at the bottom of MapView */
      className="w-full h-full bg-gray-100/90 border-t border-gray-200
                 flex items-center gap-4 px-3 py-2"
    >
      {/* ─────────── 1) Category chips ─────────── */}
      <div className="flex items-center space-x-4 pr-2 overflow-x-auto flex-1">
        {Object.entries(CategoryColors).map(([cat, color]) => {
          const active = selectedCategories.includes(cat as SpotCategory);
          return (
            <button
              key={cat}
              onClick={() => toggleCategory(cat as SpotCategory)}
              className={clsx(
                'flex items-center space-x-1 select-none px-2 py-0.5 rounded-full border',
                active ? 'text-white' : 'text-gray-700'
              )}
              style={{
                opacity: active ? 1 : 0.4,
                backgroundColor: active ? color : 'white',
                borderColor: color
              }}
              aria-pressed={active}
            >
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-sm font-medium capitalize">{cat}</span>
            </button>
          );
        })}
      </div>

      {/* 2) Suggest / GitHub – perfectly centred */}
      <div className="flex items-center gap-4 mx-auto flex-shrink-0">
        <Link href="/club_submission">
          <button
            type="button"
            className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-500
                       text-gray-900 font-semibold px-4 py-1.5 rounded-lg shadow transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"
                 fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd"
                    d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                    clipRule="evenodd" />
            </svg>
            Suggest&nbsp;a&nbsp;club
          </button>
        </Link>

        <a href="https://github.com/Zinkelburger/chess-hotspot"
           target="_blank" rel="noopener"
           className="hover:opacity-80 transition">
          <img src="/github.svg" alt="GitHub" className="w-7 h-7" />
        </a>
      </div>

      {/* 3) Day-of-week filter – right edge */}
      <div className="flex items-center space-x-2 pl-2 overflow-x-auto flex-1 justify-end">
        <span className="text-sm">Open&nbsp;on:</span>
        {['', ...WEEK_DAYS].map((day) => {
          const active = day
            ? selectedDays.includes(day as DayOfWeek)
            : selectedDays.length === 0;
          return (
            <button
              key={day || 'any'}
              onClick={() => {
                if (day === '') return onDaysChange([]);
                const d = day as DayOfWeek;
                onDaysChange(
                  active
                    ? selectedDays.filter((x) => x !== d)
                    : [...selectedDays, d]
                );
              }}
              className={clsx(
                'px-3 py-1 rounded-full border font-medium text-base',
                active
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-white text-gray-700 border-gray-300'
              )}
              style={{ opacity: active ? 1 : 0.4 }}
              aria-pressed={active}
            >
              {day || 'Any'}
            </button>
          );
        })}
      </div>
    </div>
  );
}