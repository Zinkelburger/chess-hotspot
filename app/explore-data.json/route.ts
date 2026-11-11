import spots from '@/public/spots.v1.json';
import type { SpotRaw } from '@/types/spot';
import { isListedClub } from '@/lib/explore';

// The club map's data, written once at build time as a static file. The source
// file holds every club ever researched (most are not listed); the browser
// only needs what can actually be shown. Tournaments have a file of their own,
// /tournaments-data.json, which only the pages that list them download.
export const dynamic = 'force-static';

export type ExploreData = {
  clubs: SpotRaw[];
};

/** Research bookkeeping the interface never reads. */
const CLUB_INTERNALS = [
  'uscf_id',
  'is_active_uscf',
  'uscf_affiliate_type',
  'uscf_activities',
  'has_weekly_club_meetings',
  'skip',
  'skip_reason',
  'claude_added',
  'source',
  'website_confidence_reason',
  'is_chesscom_club',
] as const;

export function GET() {
  const clubs = (spots as SpotRaw[]).filter(isListedClub).map(spot => {
    const club: Record<string, unknown> = { ...spot };
    for (const key of CLUB_INTERNALS) delete club[key];
    return club as unknown as SpotRaw;
  });
  const data: ExploreData = { clubs };
  return Response.json(data);
}
