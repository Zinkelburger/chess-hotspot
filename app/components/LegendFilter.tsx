'use client';

import clsx from 'clsx';
import type { SpotCategory, DayOfWeek } from '@/types/spot';

/* ------------------------------------------------------------------ *
 * 1. Category-to-colour mapping                                       *
 *    – Extend as you add new categories.                              *
 * ------------------------------------------------------------------ */
export const CategoryColors: Record<SpotCategory, string> = {
  park:       '#34D399', // emerald-400
  tournament: '#3B82F6', // blue-500
  club:       '#F59E0B', // amber-500
  // more categories → colour codes …
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
      className="w-full bg-gray-100/90 border-t border-gray-200
                 flex items-center justify-between px-3"
      style={{ height: '100%' }}   /* parent sets this to 10% viewport */
    >
      {/* ------- Category legend / toggles ------- */}
      <div className="flex space-x-4 overflow-x-auto pr-2">
        {Object.entries(CategoryColors).map(([cat, color]) => {
          const active = selectedCategories.includes(cat as SpotCategory);
          return (
            <button
              key={cat}
              onClick={() => toggleCategory(cat as SpotCategory)}
              className={clsx(
                'flex items-center space-x-1 whitespace-nowrap select-none px-2 py-0.5 rounded-full border',
                active ? 'text-white' : 'text-gray-700'
              )}
              style={{
                opacity: active ? 1 : 0.4,
                backgroundColor: active ? color : 'white',
                borderColor: color
              }}
              aria-pressed={active}
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm font-medium capitalize">{cat}</span>
            </button>
          );
        })}
      </div>

      {/* ------- Day-of-week filter ------- */}
      <div className="flex items-center space-x-2">
         <span className="text-sm flex-shrink-0">Open&nbsp;on:</span>
        <div className="flex space-x-1 overflow-x-auto">
          {['', ...WEEK_DAYS].map(day => {
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
                      ? selectedDays.filter(x => x !== d)
                      : [...selectedDays, d]
                  );
                }}
                className={clsx(
                  'px-3 py-1 rounded-full border font-medium text-base whitespace-nowrap',
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
