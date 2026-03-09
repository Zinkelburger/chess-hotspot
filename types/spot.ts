export type SpotCategory = 'park' | 'club';

export type DayOfWeek =
  | 'Monday' | 'Tuesday' | 'Wednesday'
  | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

/** Opening hours for a given day. Times optional when only the day is known. */
export interface Hours {
  open?: string;   // e.g. "09:00"
  close?: string;  // e.g. "17:30"
}

export type UscfAffiliateType =
  | 'Club' | 'School' | 'State Chapter' | 'Organizer'
  | 'Chess Camp/Program' | 'College' | 'League' | 'Other';

export type SkipReason =
  | 'state_org' | 'school' | 'college' | 'scholastic'
  | 'academy' | 'organizer' | 'no_info' | 'online_only'
  | 'military' | 'library_program' | 'youth_only' | 'other';

export type WebsiteConfidence = 'verified' | 'questionable' | 'mismatch';

export interface SpotRaw {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  category: SpotCategory;
  uscf_id?: string | null;
  is_active_uscf?: boolean;
  uscf_affiliate_type?: UscfAffiliateType | null;
  uscf_activities?: string[];
  has_weekly_club_meetings?: boolean;
  skip?: boolean;
  skip_reason?: SkipReason | null;
  claude_added?: boolean;
  hours?: Partial<Record<DayOfWeek, Hours>>;
  /** e.g. "Summer", "May–September", null if year-round */
  seasonal?: string | null;
  photo?: string | null;
  gmap?: string | null;
  website?: string | string[] | null;
  /** Per-URL confidence from manual review. Only URLs needing a flag are listed. */
  website_confidence?: Record<string, WebsiteConfidence>;
  notes?: string | null;
}
