'use client';

import clsx from 'clsx';
import Link from 'next/link';
import type { DayOfWeek } from '@/types/spot';
import { GITHUB_URL } from '@/lib/constants';

type ViewMode = 'park' | 'tournament';

const DAYS: (DayOfWeek | '')[] = [
  '', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];
const DAY_LABELS: string[] = [
  'Any', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
];

type Props = {
  selectedView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  selectedDays: DayOfWeek[];
  onDaysChange: (d: DayOfWeek[]) => void;
};

export default function LegendFilter({
  selectedView,
  onViewChange,
  selectedDays,
  onDaysChange,
}: Props) {
  return (
    <div className="w-full bg-gray-100/90 grid grid-cols-[auto_1fr_auto] items-center py-2">
      {/* View chips */}
      <div className="flex items-center overflow-x-auto gap-2 px-4">
        <button
          onClick={() => onViewChange('park')}
          className={clsx(
            'pretty-pill min-w-[7.5rem]',
            selectedView === 'park'
              ? 'pretty-pill-green'
              : 'pretty-pill-ghost opacity-75 hover:opacity-100',
          )}
        >
          <span>Club</span>
        </button>
        <button
          onClick={() => onViewChange('tournament')}
          className={clsx(
            'pretty-pill min-w-[7.5rem]',
            selectedView === 'tournament'
              ? 'pretty-pill-blue'
              : 'pretty-pill-ghost opacity-75 hover:opacity-100',
          )}
        >
          <span>Tournament</span>
        </button>
      </div>

      {/* Center links */}
      <div className="justify-self-center flex items-center gap-3">
        <Link
          href="/club_submission"
          className="pretty-pill pretty-pill-green"
        >
          Suggest a Club
        </Link>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="pretty-pill pretty-pill-neutral"
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
                'pretty-pill text-xs',
                active
                  ? 'pretty-pill-green'
                  : 'pretty-pill-ghost',
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
