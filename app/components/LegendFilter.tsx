'use client';

import clsx from 'clsx';
import Link from 'next/link';
import type { SpotCategory, DayOfWeek } from '@/types/spot';

export const CategoryColors: Record<SpotCategory, string> = {
  park:       '#34D399',
  tournament: '#3B82F6',
  club:       '#F59E0B',
};

const WEEK_DAYS: DayOfWeek[] = [
  'Monday','Tuesday','Wednesday',
  'Thursday','Friday','Saturday','Sunday',
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
    <div className="w-full h-full bg-gray-100/90 border-t border-gray-200 flex items-center justify-between px-3 py-0">
      {/* ← LEFT GROUP */}
      <div className="flex items-center overflow-x-auto">
        {/* 1) Category chips */}
        <div className="flex items-center space-x-3">
          {Object.entries(CategoryColors).map(([cat, color]) => {
            const active = selectedCategories.includes(cat as SpotCategory);
            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat as SpotCategory)}
                className={clsx(
                  'flex items-center space-x-1 px-2 py-0.5 rounded-full border transition-opacity',
                  active ? 'text-white' : 'text-gray-700'
                )}
                style={{
                  backgroundColor: active ? color : 'white',
                  borderColor: color,
                  opacity: active ? 1 : 0.4,
                }}
                aria-pressed={active}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm font-medium capitalize">{cat}</span>
              </button>
            );
          })}
        </div>

        {/* spacing + actions */}
        <div className="flex items-center ml-4 space-x-3 flex-shrink-0">
          <Link
            href="/club_submission"
            className="button-style px-2 py-1 text-sm gap-1 inline-flex items-center rounded-full"
            style={{
              fontSize: '0.75rem',
              lineHeight: '1rem',
              padding: '0.15rem 0.5rem',
              marginLeft: '0.75rem',
              marginRight: '0.25rem',
            }}
          >
            <span>Suggest a Club</span>
          </Link>

          <a
            href="https://github.com/Zinkelburger/chess-hotspot"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center p-1 hover:opacity-80 transition"
          >
            <img src="/github.svg" alt="GitHub" width={28} height={28} />
          </a>
        </div>
      </div>

      {/* → RIGHT GROUP: day-of-week filter */}
      <div className="flex items-center justify-end gap-1 max-w-[50%]">
        <span className="text-[0.6rem] font-medium flex-none">Open:</span>
        <div className="flex flex-wrap gap-1 overflow-visible">
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
                  'flex-none px-0 py-[2px] rounded-full border text-[0.6rem] font-medium text-center truncate transition-opacity',
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
    </div>
  );
}
