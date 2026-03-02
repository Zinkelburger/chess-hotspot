export type EventType = 'tournament' | 'meetup' | 'simul' | 'lesson';

export type RatingSystem = 'USCF' | 'FIDE' | 'none';
export type TimeControlKind = 'blitz' | 'rapid' | 'classical' | 'custom';

export interface TimeControl {
  kind: TimeControlKind;
  /** Base time in minutes (ex: 90 for G/90). */
  baseMinutes?: number;
  /** Fischer increment in seconds (ex: +10). */
  incrementSeconds?: number;
  /** Bronstein/simple delay in seconds (ex: d5, d30). */
  delaySeconds?: number;
  /** Original source text when parsing is messy. */
  raw?: string;
}

export interface EventPrize {
  place?: number;
  amountUsd?: number;
  description?: string;
}

export interface EventSection {
  name: string; // "Open", "U2200", "U1800", etc.
  minRating?: number;
  maxRating?: number;
  unratedAllowed?: boolean;
  rated?: boolean;
  ratingSystem?: Exclude<RatingSystem, 'none'>;
  entryFeeUsd?: number;
  prizes?: EventPrize[];
  raw?: string;
}

export interface EventScheduleOption {
  name: string; // "5-Day", "3-Day", "Main", etc.
  startDate?: string; // ISO date
  endDate?: string;   // ISO date
  roundTimes?: string[];
  registrationDeadline?: string;
  raw?: string;
}

export interface ChessEvent {
  id: string;
  name: string;
  date: string;            // ISO date "2026-07-12"
  endDate?: string;        // for multi-day events
  time?: string;           // start time "10:00"
  type: EventType;
  hostClubId?: string;     // links back to a Spot id
  /** Venue name if the event isn't at the host club's usual location */
  venue?: string;
  address?: string;
  lat?: number;
  lng?: number;
  timezone?: string; // IANA timezone, e.g. "America/New_York"

  format?: TimeControlKind;
  timeControl?: TimeControl;

  rated?: boolean;
  ratingSystem?: RatingSystem;

  // Structured fees/prizes for filtering.
  entryFeeText?: string;
  entryFeeUsdMin?: number;
  entryFeeUsdMax?: number;
  prizeFundGuaranteedUsd?: number;
  topPrizeUsd?: number;

  sections?: EventSection[];
  scheduleOptions?: EventScheduleOption[];

  tags?: string[];
  website?: string;
  notes?: string | null;
}
