#!/usr/bin/env python3
"""
Geocode chess.com clubs that have location info in their notes/names
but are missing lat/lng coordinates. Also skip clubs with no useful info.
"""

import json
import re
import time
import sys
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError

geolocator = Nominatim(user_agent="chess-hotspot-geocoder-v1", timeout=10)

US_STATES = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
    'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
    'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
    'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
    'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN',
    'mississippi': 'MS', 'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE',
    'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
    'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
    'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK', 'oregon': 'OR',
    'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
    'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA',
    'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
    'district of columbia': 'DC', 'washington dc': 'DC', 'washington d.c.': 'DC',
    'puerto rico': 'PR',
}

STATE_ABBREVS = set(US_STATES.values())

CITY_PATTERNS_IN_NAME = [
    # "City Name Chess Club" or "City Name CC" etc.
    r'^(.+?)\s+(?:chess\s+club|chess|cc|chess\s+society|chess\s+group)',
    # "Chess Club of City Name"
    r'chess\s+club\s+(?:of|in)\s+(.+)',
]

def extract_location_from_name(name):
    """Try to extract a city/state from the club name."""
    lower = name.lower().strip()
    
    for pattern in CITY_PATTERNS_IN_NAME:
        m = re.match(pattern, lower, re.IGNORECASE)
        if m:
            loc = m.group(1).strip()
            # Check for state abbreviation at end: "Lexington MO"
            parts = loc.rsplit(None, 1)
            if len(parts) == 2 and parts[1].upper() in STATE_ABBREVS:
                return parts[0].title(), parts[1].upper()
            # Check for state name
            for state_name, abbrev in US_STATES.items():
                if loc.endswith(state_name):
                    city = loc[:-len(state_name)].strip().rstrip(',').strip()
                    if city:
                        return city.title(), abbrev
            return loc.title(), None
    
    return None, None


def extract_location_from_notes(notes):
    """Try to extract city/state from notes text."""
    if not notes:
        return None, None
    
    # "located in City, State"
    patterns = [
        r'(?:located|based|meets?|meeting)\s+(?:in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+([A-Z]{2})\b',
        r'(?:in|from|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+([A-Z]{2})\b',
        r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s+([A-Z]{2})\s+(?:area|region|community)',
    ]
    
    for pattern in patterns:
        m = re.search(pattern, notes)
        if m:
            city = m.group(1).strip()
            state = m.group(2).strip()
            if state in STATE_ABBREVS and len(city) > 2:
                return city, state
    
    # Just find "City, ST" pattern
    m = re.search(r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\b', notes)
    if m:
        city = m.group(1).strip()
        state = m.group(2).strip()
        if state in STATE_ABBREVS and len(city) > 2:
            return city, state
    
    return None, None


def has_useful_info(notes):
    """Check if notes contain any useful location/meeting info."""
    if not notes:
        return False
    lower = notes.lower()
    useful_indicators = [
        'meet', 'meets', 'meeting', 'located', 'based in', 'address',
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
        'pm', 'am', 'weekly', 'monthly', 'library', 'church', 'center',
        'cafe', 'coffee', 'restaurant', 'bar ', 'pub ', 'brew',
        'welcome', 'drop-in', 'drop in', 'open to', 'all ages', 'all levels',
        'casual', 'rated', 'tournament', 'otb', 'over the board',
    ]
    return any(x in lower for x in useful_indicators)


def geocode_location(city, state=None, retries=3):
    """Geocode a city/state to lat/lng."""
    query = f"{city}, {state}, USA" if state else f"{city}, USA"
    
    for attempt in range(retries):
        try:
            time.sleep(1.1)  # Nominatim rate limit
            location = geolocator.geocode(query, country_codes=['us'])
            if location:
                return location.latitude, location.longitude
            return None, None
        except (GeocoderTimedOut, GeocoderServiceError) as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                print(f"  Geocoding failed for {query}: {e}", file=sys.stderr)
                return None, None


def main():
    with open('public/spots.v1.json') as f:
        data = json.load(f)
    
    active_no_loc = [(i, d) for i, d in enumerate(data) 
                     if not d.get('skip') and not d.get('lat') 
                     and d.get('source') == 'chesscom_club']
    
    print(f"Processing {len(active_no_loc)} chess.com clubs without coordinates")
    
    skipped = 0
    geocoded = 0
    failed = 0
    already_have_city = 0
    
    for count, (idx, entry) in enumerate(active_no_loc):
        name = entry['name']
        notes = entry.get('notes', '')
        
        if count % 50 == 0:
            print(f"\nProgress: {count}/{len(active_no_loc)} (geocoded={geocoded}, skipped={skipped}, failed={failed})")
        
        # Skip entries with no useful info
        if not has_useful_info(notes):
            entry['skip'] = True
            entry['skip_reason'] = 'no_info'
            skipped += 1
            continue
        
        # Try to extract city/state
        city, state = entry.get('city'), entry.get('state')
        
        if not city:
            city, state = extract_location_from_name(name)
        
        if not city:
            city, state = extract_location_from_notes(notes)
        
        if city:
            if not entry.get('city'):
                entry['city'] = city
            if state and not entry.get('state'):
                entry['state'] = state
            
            lat, lng = geocode_location(city, state)
            if lat:
                entry['lat'] = round(lat, 6)
                entry['lng'] = round(lng, 6)
                geocoded += 1
                print(f"  ✓ [{idx}] {name} -> {city}, {state} ({lat:.4f}, {lng:.4f})")
            else:
                failed += 1
                print(f"  ✗ [{idx}] {name} -> {city}, {state} (geocode failed)")
        else:
            failed += 1
    
    print(f"\n=== RESULTS ===")
    print(f"Total processed: {len(active_no_loc)}")
    print(f"Geocoded: {geocoded}")
    print(f"Skipped (no useful info): {skipped}")
    print(f"Failed (couldn't extract/geocode location): {failed}")
    
    with open('public/spots.v1.json', 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"\nWrote updated spots.v1.json")


if __name__ == '__main__':
    main()
