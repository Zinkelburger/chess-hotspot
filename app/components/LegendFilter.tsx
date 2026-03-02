'use client';

import clsx from 'clsx';
import Link from 'next/link';
import type { DayOfWeek } from '@/types/spot';
import type { EventType, TimeControlKind } from '@/types/event';
import { GITHUB_URL } from '@/lib/constants';

export type ViewMode = 'clubs' | 'events';

const DAYS: (DayOfWeek | '')[] = [
  '',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const DAY_LABELS: string[] = ['Any', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EVENT_TYPES: (EventType | '')[] = ['', 'tournament', 'meetup', 'simul', 'lesson'];
const EVENT_TYPE_LABELS = ['Any', 'Tournament', 'Meetup', 'Simul', 'Lesson'];
const EVENT_FORMATS: ('any' | TimeControlKind)[] = ['any', 'blitz', 'rapid', 'classical'];
const EVENT_FORMAT_LABELS = ['Any', 'Blitz', 'Rapid', 'Classical'];

type Props = {
  selectedView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  selectedDays: DayOfWeek[];
  onDaysChange: (d: DayOfWeek[]) => void;
  selectedEventTypes: EventType[];
  onEventTypesChange: (types: EventType[]) => void;
  eventRatedFilter: 'any' | 'rated' | 'casual';
  onEventRatedFilterChange: (value: 'any' | 'rated' | 'casual') => void;
  eventFormatFilter: 'any' | TimeControlKind;
  onEventFormatFilterChange: (value: 'any' | TimeControlKind) => void;
  eventDateRange: 'any' | '30d' | '90d';
  onEventDateRangeChange: (value: 'any' | '30d' | '90d') => void;
};

export default function LegendFilter({
  selectedView,
  onViewChange,
  selectedDays,
  onDaysChange,
  selectedEventTypes,
  onEventTypesChange,
  eventRatedFilter,
  onEventRatedFilterChange,
  eventFormatFilter,
  onEventFormatFilterChange,
  eventDateRange,
  onEventDateRangeChange,
}: Props) {
  return (
    <div className="w-full bg-gray-100/95 border-t border-gray-200 px-4 py-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-y-3 gap-x-4 sm:gap-y-4 sm:gap-x-6 lg:gap-y-6 lg:gap-x-8">
        <div className="flex items-center gap-2 shrink-0 justify-self-start sm:pl-4 sm:border-l sm:border-gray-300/80">
          <button
            onClick={() => onViewChange('clubs')}
            className={clsx(
              'pretty-pill min-w-[7.5rem] shrink-0',
              selectedView === 'clubs'
                ? 'pretty-pill-green'
                : 'pretty-pill-ghost opacity-75 hover:opacity-100',
            )}
          >
            <span>Clubs</span>
          </button>
          <button
            onClick={() => onViewChange('events')}
            className={clsx(
              'pretty-pill min-w-[7.5rem] shrink-0',
              selectedView === 'events'
                ? 'pretty-pill-blue'
                : 'pretty-pill-ghost opacity-75 hover:opacity-100',
            )}
          >
            <span>Events</span>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0 justify-self-center">
          <Link href="/club_submission" className="pretty-pill pretty-pill-green shrink-0">
            Suggest a Club
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="pretty-pill pretty-pill-neutral shrink-0"
          >
            <img src="/github.svg" alt="GitHub" width={24} height={24} />
          </a>
        </div>

        <div
          className={clsx(
            'min-w-0 justify-self-end sm:pl-4 sm:border-l sm:border-gray-300/80',
            selectedView === 'events' && 'sm:min-h-[4.75rem]',
          )}
        >
          {selectedView === 'clubs' && (
            <div className="flex justify-end">
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">Open:</span>
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
                        active ? 'pretty-pill-green' : 'pretty-pill-ghost',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedView === 'events' && (
            <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">Type:</span>
                {EVENT_TYPES.map((type, idx) => {
                  const active = type
                    ? selectedEventTypes.includes(type as EventType)
                    : selectedEventTypes.length === 0;
                  return (
                    <button
                      key={`type-${EVENT_TYPE_LABELS[idx]}`}
                      onClick={() => {
                        if (!type) return onEventTypesChange([]);
                        const nextType = type as EventType;
                        onEventTypesChange(
                          active
                            ? selectedEventTypes.filter((t) => t !== nextType)
                            : [...selectedEventTypes, nextType],
                        );
                      }}
                      className={clsx(
                        'pretty-pill text-xs whitespace-nowrap',
                        active ? 'pretty-pill-blue' : 'pretty-pill-ghost',
                      )}
                    >
                      {EVENT_TYPE_LABELS[idx]}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">Rated:</span>
                {[
                  { value: 'any' as const, label: 'Any' },
                  { value: 'rated' as const, label: 'Yes' },
                  { value: 'casual' as const, label: 'No' },
                ].map((opt) => (
                  <button
                    key={`rated-${opt.value}`}
                    onClick={() => onEventRatedFilterChange(opt.value)}
                    className={clsx(
                      'pretty-pill text-xs whitespace-nowrap',
                      eventRatedFilter === opt.value ? 'pretty-pill-blue' : 'pretty-pill-ghost',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">Format:</span>
                {EVENT_FORMATS.map((format, idx) => (
                  <button
                    key={`format-${format}`}
                    onClick={() => onEventFormatFilterChange(format)}
                    className={clsx(
                      'pretty-pill text-xs whitespace-nowrap',
                      eventFormatFilter === format ? 'pretty-pill-blue' : 'pretty-pill-ghost',
                    )}
                  >
                    {EVENT_FORMAT_LABELS[idx]}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">When:</span>
                {[
                  { value: 'any' as const, label: 'Any' },
                  { value: '30d' as const, label: '30d' },
                  { value: '90d' as const, label: '90d' },
                ].map((opt) => (
                  <button
                    key={`date-${opt.value}`}
                    onClick={() => onEventDateRangeChange(opt.value)}
                    className={clsx(
                      'pretty-pill text-xs whitespace-nowrap',
                      eventDateRange === opt.value ? 'pretty-pill-blue' : 'pretty-pill-ghost',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
