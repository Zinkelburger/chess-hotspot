'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import type { DayOfWeek } from '@/types/spot';
import {
  DAYS,
  DAY_SHORT,
  FORMATS,
  FORMAT_LABELS,
  KINDS,
  KIND_LABELS,
  addDays,
  weekendRange,
  type Filters,
  type Format,
  type Kind,
} from '@/lib/explore';
import { GITHUB_URL } from '@/lib/constants';
import Icon from './Icon';

type Props = {
  filters: Filters;
  onChange: (filters: Filters) => void;
  /** The visitor's local date; '' until the page has hydrated. */
  today: string;
  /** Set on a page that lists one kind: its Find row would have nothing to choose. */
  only?: Kind;
  viewMode: 'map' | 'feed';
  onViewModeToggle: () => void;
  /** Feed only: list everything, or just what is inside the map's last view. */
  area?: { scoped: boolean; onChange: (scoped: boolean) => void };
};

export const KIND_PILL: Record<Kind, string> = {
  club: 'pretty-pill-green',
  tournament: 'pretty-pill-blue',
};
export const FORMAT_PILL: Record<Format, string> = {
  classical: 'pretty-pill-amber',
  rapid: 'pretty-pill-sky',
  blitz: 'pretty-pill-rose',
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(x => x !== value) : [...list, value];
}

function Pill({
  active,
  activeClass = 'pretty-pill-green',
  onClick,
  label,
  children,
  popup,
}: {
  active: boolean;
  activeClass?: string;
  onClick: () => void;
  label?: string;
  children: React.ReactNode;
  popup?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      aria-haspopup={popup ? 'dialog' : undefined}
      className={clsx('pretty-pill', active ? activeClass : 'pretty-pill-ghost')}
    >
      {children}
    </button>
  );
}

const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

/**
 * The one filter surface, the same on a phone and a desktop: labelled rows of
 * pills, nothing tucked behind a menu. A phone puts each row on a rail you
 * swipe sideways; wider screens wrap. The coloured pills double as the map's
 * legend — a club pin is the green of "Clubs", a tournament the blue of
 * "Tournaments".
 */
export default function FilterBar({
  filters,
  onChange,
  today,
  only,
  viewMode,
  onViewModeToggle,
  area,
}: Props) {
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  /** Time controls and prize funds describe tournaments, not club nights. */
  const clubsOnly = only === 'club';
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  const customActive = filters.when === 'custom';
  const customLabel =
    customActive && (filters.from || filters.to)
      ? `${filters.from ? shortDay(filters.from) : 'Now'} – ${filters.to ? shortDay(filters.to) : 'onward'}`
      : 'Custom';

  return (
    <div
      className={clsx(
        'filter-bar',
        area && 'filter-bar-with-area',
        clubsOnly && 'filter-bar-clubs',
      )}
    >
      {!clubsOnly && <div className="filter-row-top">
        {!only && <div className="filter-group filter-group-find">
          <span className="filter-label">Find</span>
          <div className="filter-pills">
            <Pill active={filters.kinds.length === 0} onClick={() => set({ kinds: [] })}>
              Any
            </Pill>
            {KINDS.map(kind => (
              <Pill
                key={kind}
                active={filters.kinds.includes(kind)}
                activeClass={KIND_PILL[kind]}
                onClick={() => set({ kinds: toggle(filters.kinds, kind) })}
              >
                <span className={`pill-dot pill-dot-${kind}`} aria-hidden="true" />
                {KIND_LABELS[kind]}
              </Pill>
            ))}
          </div>
        </div>}
        <div className="filter-group filter-group-play">
          <span className="filter-label">Play</span>
          <div className="filter-pills">
            <Pill active={filters.formats.length === 0} onClick={() => set({ formats: [] })}>
              Any
            </Pill>
            {FORMATS.map(format => (
              <Pill
                key={format}
                active={filters.formats.includes(format)}
                activeClass={FORMAT_PILL[format]}
                onClick={() => set({ formats: toggle(filters.formats, format) })}
              >
                {FORMAT_LABELS[format]}
              </Pill>
            ))}
          </div>
        </div>
      </div>}

      <div className="filter-group filter-group-day">
        <span className="filter-label">Day</span>
        <DayPills selected={filters.days} onChange={days => set({ days })} />
      </div>

      <div className="filter-group filter-group-when">
        <span className="filter-label">When</span>
        <div className="filter-pills">
          <Pill
            active={filters.when === 'any'}
            onClick={() => set({ when: 'any', from: '', to: '' })}
          >
            Any
          </Pill>
          <Pill
            active={filters.when === 'today'}
            onClick={() =>
              set({ when: filters.when === 'today' ? 'any' : 'today', from: '', to: '' })
            }
          >
            Today
          </Pill>
          <Pill
            active={filters.when === 'weekend'}
            onClick={() =>
              set({ when: filters.when === 'weekend' ? 'any' : 'weekend', from: '', to: '' })
            }
          >
            This weekend
          </Pill>
          <Pill active={customActive} onClick={() => setDateDialogOpen(true)} popup>
            {customLabel}
          </Pill>
          {!clubsOnly && (
            <Pill
              active={filters.big}
              activeClass="pretty-pill-fuchsia"
              onClick={() => set({ big: !filters.big })}
              label="Big events: tournaments with $5,000 or more in prizes"
            >
              <Icon name="star" size={13} />
              Big events
            </Pill>
          )}
        </div>
      </div>

      {area && (
        <div className="filter-group filter-group-area">
          <span className="filter-label">Where</span>
          <div className="filter-pills">
            <Pill active={!area.scoped} onClick={() => area.onChange(false)}>
              Everywhere
            </Pill>
            <Pill active={area.scoped} onClick={() => area.onChange(true)}>
              Map area
            </Pill>
          </div>
        </div>
      )}

      <div className="filter-actions">
        {viewMode === 'map' && (
          <>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="pretty-pill pretty-pill-ghost filter-desktop-only"
              aria-label="GitHub repository"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </a>
            <Link href="/club_submission" className="pretty-pill pretty-pill-ghost filter-desktop-only">
              + Suggest a club
            </Link>
          </>
        )}
        <button type="button" onClick={onViewModeToggle} className="pretty-pill pretty-pill-neutral">
          <Icon name={viewMode === 'map' ? 'feed' : 'map'} size={14} />
          {viewMode === 'map' ? 'Feed' : 'Map'}
        </button>
      </div>

      {dateDialogOpen && (
        <DateDialog
          filters={filters}
          today={today}
          onChange={onChange}
          onClose={() => setDateDialogOpen(false)}
        />
      )}
    </div>
  );
}

function DayPills({
  selected,
  onChange,
}: {
  selected: DayOfWeek[];
  onChange: (days: DayOfWeek[]) => void;
}) {
  return (
    <div className="filter-pills">
      <Pill active={selected.length === 0} onClick={() => onChange([])}>
        Any
      </Pill>
      {DAYS.map(day => (
        <Pill
          key={day}
          active={selected.includes(day)}
          onClick={() => onChange(toggle(selected, day))}
          label={day}
        >
          {DAY_SHORT[day]}
        </Pill>
      ))}
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Pick any stretch of dates. Opens centred on a desktop and as a bottom sheet
 * on a phone; closes on Escape or a click outside, keeps Tab inside while it
 * is open, and hands focus back to the pill that opened it.
 */
function DateDialog({
  filters,
  today,
  onChange,
  onClose,
}: {
  filters: Filters;
  today: string;
  onChange: (filters: Filters) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const outside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) onClose();
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', keys);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', keys);
    };
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const setRange = (from: string, to: string) =>
    onChange({ ...filters, when: from || to ? 'custom' : 'any', from, to });

  const weekend = weekendRange(today);
  const picks: { label: string; from: string; to: string }[] = [
    { label: 'Tomorrow', from: addDays(today, 1), to: addDays(today, 1) },
    { label: 'This weekend', from: weekend.from, to: weekend.to },
    { label: 'Next 7 days', from: today, to: addDays(today, 6) },
    { label: 'Next 30 days', from: today, to: addDays(today, 29) },
    { label: 'Next 3 months', from: today, to: addDays(today, 91) },
  ];

  return (
    <div className="filter-dialog-backdrop">
      <div
        ref={dialogRef}
        className="filter-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="filter-dialog-header">
          <h3 id={titleId}>When</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="pretty-pill pretty-pill-ghost popup-close"
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="filter-dialog-body">
          <div className="filter-dialog-section">
            <p className="filter-dialog-label">Quick picks</p>
            <div className="filter-dialog-pills">
              {picks.map(pick => (
                <Pill
                  key={pick.label}
                  active={
                    filters.when === 'custom' &&
                    filters.from === pick.from &&
                    filters.to === pick.to
                  }
                  onClick={() => setRange(pick.from, pick.to)}
                >
                  {pick.label}
                </Pill>
              ))}
            </div>
          </div>

          <div className="filter-dialog-inputs">
            <div className="filter-dialog-field">
              <label htmlFor={`${titleId}-from`}>From</label>
              <input
                id={`${titleId}-from`}
                type="date"
                min={today}
                max={filters.to || undefined}
                value={filters.when === 'custom' ? filters.from : ''}
                onChange={e =>
                  setRange(e.target.value, filters.when === 'custom' ? filters.to : '')
                }
              />
            </div>
            <div className="filter-dialog-field">
              <label htmlFor={`${titleId}-to`}>To</label>
              <input
                id={`${titleId}-to`}
                type="date"
                min={(filters.when === 'custom' && filters.from) || today}
                value={filters.when === 'custom' ? filters.to : ''}
                onChange={e =>
                  setRange(filters.when === 'custom' ? filters.from : '', e.target.value)
                }
              />
            </div>
          </div>

          <div className="filter-dialog-section">
            <p className="filter-dialog-label">Days of the week</p>
            <p className="filter-dialog-hint">Only show certain days inside the dates above.</p>
            <DayPills selected={filters.days} onChange={days => onChange({ ...filters, days })} />
          </div>

          <div className="filter-dialog-actions">
            <button
              type="button"
              onClick={() => onChange({ ...filters, when: 'any', from: '', to: '', days: [] })}
              className="pretty-pill pretty-pill-ghost"
            >
              Any time
            </button>
            <button type="button" onClick={onClose} className="pretty-pill pretty-pill-green">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
