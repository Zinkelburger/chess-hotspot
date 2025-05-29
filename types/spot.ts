// types/spot.ts
export type SpotCategory = 'park' | 'tournament' | 'club' /* add more here */;

export type DayOfWeek =
  | 'Monday' | 'Tuesday' | 'Wednesday'
  | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

/** simple opening hours for a given day */
export interface Hours {
  open: string;   // e.g. "09:00"
  close: string;  // e.g. "17:30"
}

export interface SpotRaw {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: SpotCategory;      
  hours?: Partial<Record<DayOfWeek, Hours>>;
  photo?: string | null;
  gmap?: string | null;
  website?: string | null;
  notes?: string | null;
}
