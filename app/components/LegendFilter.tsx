'use client';

import { useId } from 'react';
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
  selectedDay: DayOfWeek | '';
  onDayChange: (d: DayOfWeek | '') => void;
};

const WEEK_DAYS: DayOfWeek[] = [
  'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday', 'Sunday'
];

export default function LegendFilter({
  selectedCategories,
  toggleCategory,
  selectedDay,
  onDayChange
}: Props) {
  /* give the <select> a unique id for a11y */
  const selectId = useId();

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
              className="flex items-center space-x-1 whitespace-nowrap select-none"
              style={{ opacity: active ? 1 : 0.35 }}
              aria-pressed={active}
            >
              <span
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm capitalize">{cat}</span>
            </button>
          );
        })}
      </div>

      {/* ------- Day-of-week filter ------- */}
      <div className="flex items-center space-x-2">
        <label htmlFor={selectId} className="text-sm">Open&nbsp;on:</label>
        <select
          id={selectId}
          value={selectedDay}
          onChange={e =>
            onDayChange((e.target.value as DayOfWeek) || '')
          }
          className="text-sm bg-white border rounded px-1 py-0.5"
        >
          <option value="">Any</option>
          {WEEK_DAYS.map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
