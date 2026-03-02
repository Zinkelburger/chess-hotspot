export type SpotCategory = 'park' | 'club';

export type DayOfWeek =
  | 'Monday' | 'Tuesday' | 'Wednesday'
  | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

/** Opening hours for a given day. Times optional when only the day is known. */
export interface Hours {
  open?: string;   // e.g. "09:00"
  close?: string;  // e.g. "17:30"
}

export interface SpotRaw {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: SpotCategory;
  hours?: Partial<Record<DayOfWeek, Hours>>;
  /** e.g. "Summer", "May–September", null if year-round */
  seasonal?: string | null;
  photo?: string | null;
  gmap?: string | null;
  website?: string | string[] | null;
  notes?: string | null;
}
