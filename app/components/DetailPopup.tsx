'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SpotRaw } from '@/types/spot';
import type { ChessEvent } from '@/types/event';
import {
  DAY_SHORT,
  FORMAT_LABELS,
  clubDays,
  clubPlace,
  clubSchedule,
  clubWebsites,
  daysBetween,
  eventAddress,
  eventDateText,
  eventFee,
  eventFormats,
  eventPrize,
  isBigEvent,
  itemHash,
  itemKey,
  itemName,
  localDate,
  type Item,
} from '@/lib/explore';
import { SITE_URL, eventPath } from '@/lib/event-seo';
import { eventCalendarUrl } from '@/lib/event-display';
import { sourceNames } from '@/lib/events';
import { FORMAT_PILL } from './FilterBar';
import Icon from './Icon';
import MetaRow from './MetaRow';
import ShareButton from './ShareButton';

/**
 * The card every pin, feed row and search result opens: centred on a desktop,
 * a sheet rising from the bottom edge on a phone. Who and what it is stays
 * pinned at the top, the links stay pinned at the bottom, and only the story
 * in between scrolls.
 */
export function PopupShell({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A modal owns focus while it is open and hands it back when it closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cardRef.current?.querySelector<HTMLElement>('.popup-close')?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="popup-backdrop"
      onClick={onClose}
    >
      <div ref={cardRef} className="popup-card" onClick={e => e.stopPropagation()}>
        <div className="popup-grabber" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

export function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="pretty-pill pretty-pill-neutral popup-close"
    >
      <Icon name="close" size={14} />
    </button>
  );
}

const URL_RE = /(https?:\/\/[^\s,)]+)/g;

/** Organizer text is full of bare links; make them tappable. */
function linkify(text: string): ReactNode[] {
  // split() with a capture group puts the matches at odd indices.
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="popup-link">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

const CLAMP = 320;

/** Long organizer copy starts folded so the card opens short. */
export function Story({ title, text }: { title?: string; text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > CLAMP;
  const shown = open || !long ? text : `${text.slice(0, text.lastIndexOf(' ', CLAMP))}…`;
  return (
    <div className="popup-story">
      {title && <h3 className="popup-story-title">{title}</h3>}
      <p>{linkify(shown)}</p>
      {long && (
        <button type="button" className="popup-more" onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

function linkLabel(url: string): string {
  if (/chess\.com/i.test(url)) return 'Chess.com club';
  if (/facebook\.com/i.test(url)) return 'Facebook';
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.length > 30 ? `${host.slice(0, 28)}…` : host;
  } catch {
    return 'Website';
  }
}

/** A club's links, one pill per destination: its own site first, then the rest. */
function clubLinks(spot: SpotRaw): { url: string; label: string; own: boolean }[] {
  const sites = clubWebsites(spot);
  const all = [...sites, spot.chesscom_url, spot.facebook, ...(spot.other_links || [])].filter(
    (url): url is string => !!url,
  );
  const seen = new Set<string>();
  const links: { url: string; label: string; own: boolean }[] = [];
  for (const url of all) {
    const label = linkLabel(url);
    // The same page is often recorded twice (as the website and as the
    // Chess.com club); one pill per label is enough.
    if (seen.has(label)) continue;
    seen.add(label);
    links.push({ url, label, own: sites.includes(url) && !/chess\.com|facebook\.com/i.test(url) });
  }
  const own = links.filter(link => link.own);
  if (own.length === 1) own[0].label = 'Website';
  return [...own, ...links.filter(link => !link.own)];
}

const mapsUrl = (query: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

// ─── Club ───

type VisitStats = { visits: number; rating: number | null };

/** "Visited 12 times" and the form that adds to it. Quietly absent offline. */
function ClubVisits({ spot }: { spot: SpotRaw }) {
  const [stats, setStats] = useState<VisitStats | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [visitedAt, setVisitedAt] = useState(() => localDate());
  const [sending, setSending] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) =>
      fetch(`/api/visit?spotId=${encodeURIComponent(spot.id)}`, { signal })
        .then(res => (res.ok ? (res.json() as Promise<VisitStats>) : null))
        .then(data => data && setStats(data))
        .catch(() => {}),
    [spot.id],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const submit = async () => {
    if (!rating || !visitedAt) return;
    setSending(true);
    try {
      await fetch('/api/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotId: spot.id, rating, visitedAt }),
      });
      await load();
      setRating(0);
      setFormOpen(false);
    } catch {
      // Leave the form open so the visit can be sent again.
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="popup-visits">
      {!formOpen ? (
        <>
          <span>
            {stats && stats.visits > 0
              ? `Visited ${stats.visits} ${stats.visits === 1 ? 'time' : 'times'}${
                  stats.rating != null ? ` · rated ${stats.rating.toFixed(1)} / 5` : ''
                }`
              : 'Been here?'}
          </span>
          <button
            type="button"
            className="pretty-pill pretty-pill-ghost"
            onClick={() => setFormOpen(true)}
          >
            Report a visit
          </button>
        </>
      ) : (
        <div className="popup-visit-form">
          <label>
            Date visited
            <input
              type="date"
              value={visitedAt}
              max={localDate()}
              onChange={e => setVisitedAt(e.target.value)}
            />
          </label>
          <label>
            Rating
            <select value={rating} onChange={e => setRating(Number(e.target.value))}>
              <option value={0}>Select</option>
              {[1, 2, 3, 4, 5].map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="popup-visit-actions">
            <button
              type="button"
              className="pretty-pill pretty-pill-ghost"
              onClick={() => setFormOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="pretty-pill pretty-pill-green"
              disabled={sending || !rating}
              onClick={submit}
            >
              {sending ? 'Sending…' : 'Submit'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ClubCard({ spot }: { spot: SpotRaw }) {
  const schedule = clubSchedule(spot);
  const place = clubPlace(spot);
  const links = clubLinks(spot);
  const timed = schedule.some(({ text }) => text);
  // The free-text schedule often says what the day/time grid cannot.
  const notes = [spot.notes, spot.meeting_times]
    .filter((text, i, all): text is string => !!text && all.indexOf(text) === i)
    .join('\n\n');
  const directions =
    spot.gmap || (place ? mapsUrl(`${spot.name}, ${place}`) : mapsUrl(`${spot.lat},${spot.lng}`));

  return (
    <>
      <div className="popup-header">
        <div className="popup-pills">
          <span className="pretty-pill pretty-pill-green">Club</span>
          {schedule.length > 0 && schedule.length <= 3 ? (
            schedule.map(({ day }) => (
              <span key={day} className="pretty-pill pretty-pill-neutral">
                {DAY_SHORT[day]}
              </span>
            ))
          ) : schedule.length > 3 ? (
            <span className="pretty-pill pretty-pill-neutral">{schedule.length} days a week</span>
          ) : null}
          {spot.seasonal && <span className="pretty-pill pretty-pill-amber">{spot.seasonal}</span>}
        </div>
        <div className="popup-facts">
          {schedule.length === 0 ? (
            <MetaRow icon="calendar">Meeting times not listed — check with the club</MetaRow>
          ) : timed ? (
            <MetaRow icon="calendar">
              {schedule.map(({ day, text }) => (
                <span key={day} className="popup-schedule-line">
                  <strong>{DAY_SHORT[day]}</strong>
                  {text ? ` ${text}` : ''}
                </span>
              ))}
            </MetaRow>
          ) : (
            <MetaRow icon="calendar">
              Meets {schedule.map(({ day }) => DAY_SHORT[day]).join(', ')} — check with the club for
              times
            </MetaRow>
          )}
          {place && <MetaRow icon="pin">{place}</MetaRow>}
        </div>
      </div>

      <div className="popup-body">
        {spot.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={spot.photo} alt="" className="popup-photo" loading="lazy" />
        )}
        {notes && <Story text={notes} />}
        <ClubVisits spot={spot} />
      </div>

      <div className="popup-footer">
        {links.map(link => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`pretty-pill ${link.own ? 'pretty-pill-green' : 'pretty-pill-neutral'}`}
          >
            {link.label}
          </a>
        ))}
        <a
          href={directions}
          target="_blank"
          rel="noopener noreferrer"
          className="pretty-pill pretty-pill-sky"
        >
          Google Maps
        </a>
      </div>
    </>
  );
}

// ─── Tournament ───

function TournamentCard({ event, today }: { event: ChessEvent; today: string }) {
  const formats = eventFormats(event);
  const fee = eventFee(event);
  const prize = eventPrize(event);
  const calendarUrl = eventCalendarUrl(event);
  const span = daysBetween(event.date, event.endDate || event.date);
  const started = !!today && event.date < today;
  const sections = [...new Set((event.sections || []).map(section => section.name))];
  const schedule = [
    event.time,
    // For a run of weeks the organizer's own wording says which days.
    span > 7 ? event.dateText : '',
    event.scheduleText?.trim(),
    event.notes?.trim(),
  ]
    .filter(Boolean)
    .join('\n');
  const conflict = event.reviewFlags?.some(flag => flag.startsWith('source-conflict-'));
  const address = eventAddress(event);

  return (
    <>
      <div className="popup-header">
        <div className="popup-pills">
          <span className="pretty-pill pretty-pill-blue">Tournament</span>
          {formats.map(format => (
            <span key={format} className={`pretty-pill ${FORMAT_PILL[format]}`}>
              {FORMAT_LABELS[format]}
            </span>
          ))}
          {event.rated === true && (
            <span className="pretty-pill pretty-pill-neutral">
              {event.ratingSystem && event.ratingSystem !== 'none' ? event.ratingSystem : 'Rated'}
              {event.fideRated && event.ratingSystem !== 'FIDE' ? ' + FIDE' : ''}
            </span>
          )}
          {event.rated === false && <span className="pretty-pill pretty-pill-neutral">Unrated</span>}
          {event.audience === 'scholastic' && (
            <span className="pretty-pill pretty-pill-violet">Scholastic</span>
          )}
          {isBigEvent(event) && <span className="pretty-pill pretty-pill-fuchsia">Big event</span>}
          {event.online && <span className="pretty-pill pretty-pill-sky">Online</span>}
        </div>
        <div className="popup-facts">
          <MetaRow icon="calendar">
            {eventDateText(event, today || event.date)}
            {started && ' · under way'}
          </MetaRow>
          <MetaRow icon="pin">
            {event.online ? (
              'Online'
            ) : (
              <>
                {event.venue && <strong>{event.venue}</strong>}
                {event.venue && address ? ' · ' : ''}
                {address || (!event.venue && 'See the organizer’s listing')}
                {event.locationPrecision && event.locationPrecision !== 'venue' && (
                  <span className="popup-fine">
                    The pin marks the {event.locationPrecision === 'postal' ? 'ZIP code' : 'area'},
                    not the door.
                  </span>
                )}
              </>
            )}
          </MetaRow>
          {event.timeControl?.raw && <MetaRow icon="clock">{event.timeControl.raw}</MetaRow>}
          {fee && fee.length <= 110 && <MetaRow icon="cost">{fee}</MetaRow>}
          {prize && <MetaRow icon="trophy">{prize}</MetaRow>}
        </div>
      </div>

      <div className="popup-body">
        {conflict && (
          <p className="popup-notice">
            Our sources disagree on some details. Check the official listing before you register.
          </p>
        )}
        {fee.length > 110 && <Story title="Entry fee" text={fee} />}
        {schedule && <Story title="Schedule" text={schedule} />}
        {event.registrationText && <Story title="Registration" text={event.registrationText} />}
        {sections.length > 0 && <Story title="Sections" text={sections.join(' · ')} />}
        <p className="popup-fine">
          {event.organizer ? `Run by ${event.organizer}. ` : ''}
          Listed by{' '}
          {(event.sources || []).map((source, i) => (
            <span key={source.id + source.url}>
              {i > 0 && ', '}
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="popup-link">
                {sourceNames[source.id] || source.id}
              </a>
            </span>
          ))}
          . Confirm times and fees with the organizer.
        </p>
      </div>

      <div className="popup-footer">
        {event.website && (
          <a
            href={event.website}
            target="_blank"
            rel="noopener noreferrer"
            className="pretty-pill pretty-pill-blue"
          >
            Official details
          </a>
        )}
        {!event.online && (event.address || event.city) && (
          <a
            href={mapsUrl(
              [event.venue, event.address, event.city, event.state].filter(Boolean).join(', '),
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="pretty-pill pretty-pill-sky"
          >
            Google Maps
          </a>
        )}
        {calendarUrl && (
          <a
            href={calendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pretty-pill pretty-pill-violet"
            title="Adds the dates; confirm round times with the organizer"
          >
            Add to calendar
          </a>
        )}
        <a href={eventPath(event)} className="pretty-pill pretty-pill-ghost">
          Full page
        </a>
      </div>
    </>
  );
}

// ─── Popups ───

type DetailProps = {
  item: Item;
  /** The visitor's local date; '' before hydration. */
  today: string;
  onClose: () => void;
  /** Set when the item was opened from a "several things here" list. */
  onBack?: () => void;
  backLabel?: string;
};

export default function DetailPopup({ item, today, onClose, onBack, backLabel }: DetailProps) {
  const name = itemName(item);
  const shareUrl =
    item.kind === 'tournament'
      ? `${SITE_URL}${eventPath(item.event)}`
      : `${SITE_URL}/${itemHash(item)}`;

  return (
    <PopupShell label={name} onClose={onClose}>
      <div className="popup-top">
        <div className="popup-heading">
          <div className="popup-actions">
            <ShareButton url={shareUrl} title={name} />
            <CloseButton onClose={onClose} />
          </div>
          {onBack && (
            <button type="button" className="popup-back" onClick={onBack}>
              <Icon name="back" size={14} />
              {backLabel}
            </button>
          )}
          <h2 className="popup-title">{name}</h2>
        </div>
      </div>
      {item.kind === 'club' ? (
        <ClubCard key={item.id} spot={item.spot} />
      ) : (
        <TournamentCard key={item.id} event={item.event} today={today} />
      )}
    </PopupShell>
  );
}

/** One line of context under a name in a list: when, and what kind. */
export function itemSummary(item: Item, today: string): string {
  if (item.kind === 'club') {
    const days = clubDays(item.spot);
    return ['Club', days.length ? days.map(day => DAY_SHORT[day]).join(', ') : '']
      .filter(Boolean)
      .join(' · ');
  }
  return [
    eventDateText(item.event, today || item.event.date),
    eventFormats(item.event)
      .map(format => FORMAT_LABELS[format])
      .join(' / '),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Several listings under one pin. Most tournament pins mark a ZIP code, so
 * everything in that ZIP lands on the same dot; this lists what is there.
 */
export function StackPopup({
  items,
  today,
  onSelect,
  onClose,
}: {
  items: Item[];
  today: string;
  onSelect: (item: Item) => void;
  onClose: () => void;
}) {
  const tournaments = items.filter(item => item.kind === 'tournament').length;
  const clubs = items.length - tournaments;
  const title = [
    tournaments ? `${tournaments} ${tournaments === 1 ? 'tournament' : 'tournaments'}` : '',
    clubs ? `${clubs} ${clubs === 1 ? 'club' : 'clubs'}` : '',
  ]
    .filter(Boolean)
    .join(' and ');
  const first = items.find(item => item.kind === 'tournament');
  const area =
    first?.kind === 'tournament'
      ? [first.event.city, first.event.state].filter(Boolean).join(', ')
      : '';

  return (
    <PopupShell label={`${title} here`} onClose={onClose}>
      <div className="popup-top">
        <div className="popup-heading">
          <div className="popup-actions">
            <CloseButton onClose={onClose} />
          </div>
          <h2 className="popup-title">
            {title} {area ? `around ${area}` : 'here'}
          </h2>
        </div>
        {tournaments > 1 && (
          <p className="popup-fine">Tournament pins mark the ZIP code, so neighbours share a dot.</p>
        )}
      </div>
      <div className="popup-body popup-list">
        {items.map(item => (
          <button
            key={itemKey(item)}
            type="button"
            className="popup-list-row"
            onClick={() => onSelect(item)}
          >
            <span className={`pill-dot pill-dot-${item.kind}`} aria-hidden="true" />
            <span className="popup-list-text">
              <span className="popup-list-name">{itemName(item)}</span>
              <span className="popup-list-meta">{itemSummary(item, today)}</span>
            </span>
          </button>
        ))}
      </div>
    </PopupShell>
  );
}
