'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DAY_SHORT,
  FORMAT_LABELS,
  buildFeed,
  clubHoursOn,
  clubPlace,
  clubSchedule,
  eventDateText,
  eventFee,
  eventFormats,
  eventPlace,
  eventPrize,
  isBigEvent,
  itemName,
  matchesQuery,
  tokenize,
  type FeedEntry,
  type Filters,
  type Item,
  type Kind,
} from '@/lib/explore';
import { eventPath } from '@/lib/event-seo';
import FilterBar, { FORMAT_PILL } from './FilterBar';
import Icon from './Icon';
import MetaRow from './MetaRow';
import SiteNav from './SiteNav';

type Props = {
  /** Listings that already pass the filters (and the map area, if scoped). */
  items: Item[];
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  today: string;
  /** Set on a page that lists one kind. */
  only?: Kind;
  area: { scoped: boolean; onChange: (scoped: boolean) => void };
  /** False until the listings have downloaded. */
  loaded: boolean;
  /** "Updated Oct 3" for the footnote, when known. */
  updatedAt: string | null;
  onSelect: (item: Item) => void;
  onClose: () => void;
};

/** Cards drawn at first, and added per "Show more". Keeps a long list quick. */
const PAGE = 60;

const DESC_LEN = 130;
const clip = (text: string) =>
  text.length > DESC_LEN ? `${text.slice(0, text.lastIndexOf(' ', DESC_LEN))}…` : text;

/**
 * Everything on the map as a dated list: what is on today, tomorrow, this
 * weekend. Shares the map's filter bar, so the two views never disagree.
 */
export default function FeedView({
  items,
  filters,
  onFiltersChange,
  today,
  only,
  area,
  loaded,
  updatedAt,
  onSelect,
  onClose,
}: Props) {
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const clubsOnly = only === 'club';
  const searchLabel = clubsOnly ? 'Search clubs, cities…' : 'Search clubs, tournaments, cities…';

  const tokens = useMemo(() => tokenize(search), [search]);
  const groups = useMemo(
    () =>
      buildFeed(
        tokens.length ? items.filter(item => matchesQuery(item, tokens)) : items,
        filters,
        today,
      ),
    [items, tokens, filters, today],
  );
  const total = useMemo(() => groups.reduce((n, group) => n + group.entries.length, 0), [groups]);

  // A new set of results starts again from the top of the list.
  useEffect(() => setShown(PAGE), [groups]);

  // Fill the page budget group by group, in order.
  let budget = shown;
  const visible = groups.flatMap(group => {
    if (budget <= 0) return [];
    const entries = group.entries.slice(0, budget);
    budget -= entries.length;
    return [{ ...group, entries }];
  });

  return (
    <div className="feed-view">
      <div className="feed-header">
        <SiteNav current="clubs" />
        <div className="feed-search-row">
          <div className="feed-search-wrap">
            <span className="feed-search-icon">
              <Icon name="search" size={15} />
            </span>
            <input
              type="text"
              className="feed-search"
              placeholder={searchLabel}
              aria-label={searchLabel.replace('…', '')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="feed-search-clear"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
          <button type="button" onClick={onClose} className="feed-close-btn" aria-label="Back to the map">
            <Icon name="close" size={16} />
          </button>
        </div>
        <FilterBar
          filters={filters}
          onChange={onFiltersChange}
          today={today}
          only={only}
          viewMode="feed"
          onViewModeToggle={onClose}
          area={area}
        />
      </div>

      <div className="feed-scroll">
        {visible.map(group => (
          <section key={group.key} className="feed-group">
            <h2 className="feed-group-label">{group.label}</h2>
            {group.entries.map(entry => (
              <FeedCard key={entry.key} entry={entry} today={today} onSelect={onSelect} />
            ))}
          </section>
        ))}

        {total > shown && (
          <button
            type="button"
            className="pretty-pill pretty-pill-neutral feed-more"
            onClick={() => setShown(shown + PAGE)}
          >
            Show more · {total - shown} to go
          </button>
        )}

        {loaded && total === 0 && (
          <div className="feed-empty">
            <p>
              {tokens.length
                ? 'Nothing matches that search.'
                : area.scoped
                  ? 'Nothing in this part of the map matches.'
                  : 'Nothing matches these filters.'}
            </p>
            {area.scoped && (
              <button
                type="button"
                className="pretty-pill pretty-pill-green"
                onClick={() => area.onChange(false)}
              >
                Look everywhere
              </button>
            )}
          </div>
        )}
        {!loaded && <div className="feed-empty">Setting up the board…</div>}

        {loaded && (
          <p className="feed-footnote">
            {clubsOnly ? (
              'Clubs are checked by hand: an active club with a regular night gets a pin. '
            ) : (
              <>
                Tournament listings come from US Chess, NA Chess Hub, Boylston Chess Club and
                Continental Chess
                {updatedAt
                  ? `, last refreshed ${new Date(updatedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}`
                  : ''}
                . Clubs are checked by hand.{' '}
              </>
            )}
            <a href="/tournaments">Find a tournament</a>
            {' · '}
            <a href="/learn">Coaches and schools</a>
            {' · '}
            <a href="/club_submission">Suggest a club</a>
          </p>
        )}
      </div>
    </div>
  );
}

function FeedCard({
  entry,
  today,
  onSelect,
}: {
  entry: FeedEntry;
  today: string;
  onSelect: (item: Item) => void;
}) {
  const open = () => onSelect(entry.item);
  return (
    <div
      role="button"
      tabIndex={0}
      className="feed-card"
      onClick={open}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      {entry.kind === 'club' ? (
        <ClubRow entry={entry} />
      ) : (
        <TournamentRow entry={entry} today={today} />
      )}
    </div>
  );
}

function ClubRow({ entry }: { entry: FeedEntry & { kind: 'club' } }) {
  const { spot } = entry.item;
  const place = clubPlace(spot);
  const others = clubSchedule(spot).filter(({ day }) => day !== entry.day);
  const hours = entry.day ? clubHoursOn(spot, entry.day) : '';
  return (
    <>
      <h3 className="feed-card-title">{spot.name}</h3>
      <div className="feed-card-pills">
        <span className="pretty-pill pretty-pill-green">Club</span>
        {entry.day && <span className="pretty-pill pretty-pill-neutral">Every {DAY_SHORT[entry.day]}</span>}
      </div>
      <div className="feed-card-facts">
        {entry.day && (
          <MetaRow icon="calendar">
            {hours ? hours.replace(/^from /, 'From ') : 'Time not listed'}
            {others.length > 0 && ` · also ${others.map(({ day }) => DAY_SHORT[day]).join(', ')}`}
          </MetaRow>
        )}
        {place && <MetaRow icon="pin">{place}</MetaRow>}
      </div>
      {spot.notes && <p className="feed-card-desc">{clip(spot.notes)}</p>}
    </>
  );
}

function TournamentRow({
  entry,
  today,
}: {
  entry: FeedEntry & { kind: 'tournament' };
  today: string;
}) {
  const { event } = entry.item;
  const formats = eventFormats(event);
  const fee = eventFee(event);
  const prize = eventPrize(event);
  return (
    <>
      <h3 className="feed-card-title">
        {/* A real link for search engines and "open in new tab"; a plain
            click opens the card in place. */}
        <a
          href={eventPath(event)}
          onClick={e => {
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) e.stopPropagation();
            else e.preventDefault();
          }}
        >
          {itemName(entry.item)}
        </a>
      </h3>
      <div className="feed-card-pills">
        <span className="pretty-pill pretty-pill-blue">Tournament</span>
        {formats.map(format => (
          <span key={format} className={`pretty-pill ${FORMAT_PILL[format]}`}>
            {FORMAT_LABELS[format]}
          </span>
        ))}
        {event.audience === 'scholastic' && (
          <span className="pretty-pill pretty-pill-violet">Scholastic</span>
        )}
        {isBigEvent(event) && <span className="pretty-pill pretty-pill-fuchsia">Big event</span>}
        {event.online && <span className="pretty-pill pretty-pill-sky">Online</span>}
      </div>
      <div className="feed-card-facts">
        <MetaRow icon="calendar">{eventDateText(event, today || event.date)}</MetaRow>
        <MetaRow icon="pin">{eventPlace(event)}</MetaRow>
        {prize ? (
          <MetaRow icon="trophy">{prize}</MetaRow>
        ) : (
          fee && <MetaRow icon="cost">{clip(fee)}</MetaRow>
        )}
      </div>
    </>
  );
}
