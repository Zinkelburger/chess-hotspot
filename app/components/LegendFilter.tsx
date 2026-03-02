'use client';

import clsx from 'clsx';
import Link from 'next/link';
import type { SpotCategory, DayOfWeek } from '@/types/spot';
import { CATEGORY_COLORS, GITHUB_URL } from '@/lib/constants';

const DAYS: (DayOfWeek | '')[] = [
  '', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];
const DAY_LABELS: string[] = [
  'Any', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
];

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
    <div className="w-full bg-gray-100/90 grid grid-cols-[auto_1fr_auto] items-center py-2">
      {/* Category chips */}
      <div className="flex items-center overflow-x-auto gap-2 px-4">
        {Object.entries(CATEGORY_COLORS).map(([cat, color]) => {
          const active = selectedCategories.includes(cat as SpotCategory);
          return (
            <button
              key={cat}
              onClick={() => toggleCategory(cat as SpotCategory)}
              className={clsx(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm whitespace-nowrap',
                'transition hover:brightness-90 hover:shadow-md',
                active ? 'text-white' : 'text-gray-700 opacity-70 hover:opacity-100',
              )}
              style={{ backgroundColor: active ? color : 'white', borderColor: color }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="capitalize">{cat}</span>
            </button>
          );
        })}
      </div>

      {/* Center links */}
      <div className="justify-self-center flex items-center gap-3">
        <Link
          href="/club_submission"
          className="inline-flex items-center rounded-full bg-secondary text-text px-3 py-1 text-sm font-medium no-underline transition-all hover:brightness-90 hover:-translate-y-px hover:shadow-lg"
        >
          Suggest a Club
        </Link>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center p-1 transition hover:opacity-80"
        >
          <img src="/github.svg" alt="GitHub" width={24} height={24} />
        </a>
      </div>

      {/* Day-of-week filters */}
      <div className="justify-self-end flex items-center gap-1.5 overflow-x-auto px-4">
        <span className="font-medium text-sm whitespace-nowrap mr-1">Open:</span>
        {DAYS.map((day, idx) => {
          const label = DAY_LABELS[idx];
          const active = day
            ? selectedDays.includes(day as DayOfWeek)
            : selectedDays.length === 0;
          return (
            <button
              key={label}
              onClick={() => {
                if (day === '') return onDaysChange([]);
                const d = day as DayOfWeek;
                onDaysChange(
                  active
                    ? selectedDays.filter((x) => x !== d)
                    : [...selectedDays, d],
                );
              }}
              className={clsx(
                'shrink-0 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition-all',
                active
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-white text-gray-500 border-gray-300 hover:text-gray-700 hover:border-gray-400',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
