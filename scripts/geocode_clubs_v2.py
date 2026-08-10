#!/usr/bin/env python3
"""
Geocode chess.com clubs - v2 with much smarter city/state extraction.
Only geocodes when confident about the location.
"""

import json
import re
import time
import sys
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError

geolocator = Nominatim(user_agent="chess-hotspot-geocoder-v2", timeout=10)

US_STATES_FULL = {
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
    'district of columbia': 'DC',
}
STATE_ABBREVS = set(US_STATES_FULL.values())


def extract_location(name, notes):
    """
    Extract city and state from club name and notes.
    Returns (city, state, confidence) where confidence is 'high' or 'low'.
    """
    # Strategy 1: Look for "City, ST" in notes (most reliable)
    # Match "City, ST" or "City, State Name" patterns
    if notes:
        # "City, ST" - 2-letter state abbreviation
        for m in re.finditer(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\b', notes):
            city, state = m.group(1).strip(), m.group(2)
            if state in STATE_ABBREVS and len(city) >= 3:
                return city, state, 'high'
        
        # "City, Full State Name"
        for state_name, abbrev in US_STATES_FULL.items():
            pattern = rf'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+{re.escape(state_name)}\b'
            m = re.search(pattern, notes, re.IGNORECASE)
            if m:
                city = m.group(1).strip()
                if len(city) >= 3:
                    return city, abbrev, 'high'
        
        # "in City, State" or "located in City"
        m = re.search(r'(?:located|based|meets?|meeting|in)\s+(?:in\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+([A-Z]{2})\b', notes)
        if m:
            city, state = m.group(1).strip(), m.group(2)
            if state in STATE_ABBREVS and len(city) >= 3:
                return city, state, 'high'
        
        # ZIP code pattern: "City State ZIP"
        m = re.search(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+([A-Z]{2})\s+(\d{5})\b', notes)
        if m:
            city, state = m.group(1).strip(), m.group(2)
            if state in STATE_ABBREVS:
                return city, state, 'high'
    
    # Strategy 2: Extract from club name with state abbreviation
    # "City ST Chess Club" or "City State Chess ..."
    name_clean = re.sub(r'\s*-\s*USCF.*$', '', name, flags=re.IGNORECASE)
    name_clean = re.sub(r'\s+chess\s+club.*$', '', name_clean, flags=re.IGNORECASE)
    name_clean = re.sub(r'\s+chess$', '', name_clean, flags=re.IGNORECASE)
    name_clean = re.sub(r'\s+cc$', '', name_clean, flags=re.IGNORECASE)
    name_clean = name_clean.strip()
    
    # "Lexington MO" or "Newton Ia"
    parts = name_clean.rsplit(None, 1)
    if len(parts) == 2:
        potential_city = parts[0]
        potential_state = parts[1].upper()
        if potential_state in STATE_ABBREVS and len(potential_city) >= 3:
            # Validate it's a real city name (not a random word)
            if potential_city[0].isupper() and not potential_city.isupper():
                return potential_city, potential_state, 'high'
    
    # "City Chess Club" where City is a well-known city name
    # Only if we can also find the state from notes context
    if notes:
        for state_name, abbrev in US_STATES_FULL.items():
            if state_name in notes.lower() or abbrev in re.findall(r'\b[A-Z]{2}\b', notes):
                # Check if the club name starts with a city
                m = re.match(r'^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:Chess|Library|County)', name)
                if m:
                    city = m.group(1)
                    found_state = abbrev if abbrev in re.findall(r'\b[A-Z]{2}\b', notes) else None
                    if found_state and found_state in STATE_ABBREVS:
                        return city, found_state, 'high'
    
    # Strategy 3: Major cities that are unambiguous from the name alone
    UNAMBIGUOUS_CITIES = {
        'washington dc': ('Washington', 'DC'), 'dupont circle': ('Washington', 'DC'),
        'brooklyn': ('Brooklyn', 'NY'), 'manhattan': ('New York', 'NY'),
        'queens': ('Queens', 'NY'), 'bronx': ('Bronx', 'NY'),
        'harlem': ('New York', 'NY'), 'astoria': ('Queens', 'NY'),
        'atlanta': ('Atlanta', 'GA'), 'chicago': ('Chicago', 'IL'),
        'dallas': ('Dallas', 'TX'), 'houston': ('Houston', 'TX'),
        'los angeles': ('Los Angeles', 'CA'), 'san francisco': ('San Francisco', 'CA'),
        'detroit': ('Detroit', 'MI'), 'boston': ('Boston', 'MA'),
        'philadelphia': ('Philadelphia', 'PA'), 'phoenix': ('Phoenix', 'AZ'),
        'seattle': ('Seattle', 'WA'), 'denver': ('Denver', 'CO'),
        'portland': ('Portland', 'OR'), 'orlando': ('Orlando', 'FL'),
        'miami': ('Miami', 'FL'), 'austin': ('Austin', 'TX'),
        'nashville': ('Nashville', 'TN'), 'raleigh': ('Raleigh', 'NC'),
        'charlotte': ('Charlotte', 'NC'), 'san antonio': ('San Antonio', 'TX'),
        'indianapolis': ('Indianapolis', 'IN'), 'columbus': ('Columbus', 'OH'),
        'san diego': ('San Diego', 'CA'), 'pittsburgh': ('Pittsburgh', 'PA'),
        'louisville': ('Louisville', 'KY'), 'milwaukee': ('Milwaukee', 'WI'),
        'baltimore': ('Baltimore', 'MD'), 'el paso': ('El Paso', 'TX'),
        'las vegas': ('Las Vegas', 'NV'), 'memphis': ('Memphis', 'TN'),
        'sacramento': ('Sacramento', 'CA'), 'oklahoma city': ('Oklahoma City', 'OK'),
        'tucson': ('Tucson', 'AZ'), 'fresno': ('Fresno', 'CA'),
        'tampa': ('Tampa', 'FL'), 'st louis': ('St. Louis', 'MO'),
        'saint louis': ('St. Louis', 'MO'), 'new orleans': ('New Orleans', 'LA'),
        'cleveland': ('Cleveland', 'OH'), 'jacksonville': ('Jacksonville', 'FL'),
        'new york': ('New York', 'NY'), 'nyc': ('New York', 'NY'),
        'dtla': ('Los Angeles', 'CA'), 'slc': ('Salt Lake City', 'UT'),
        'phx': ('Phoenix', 'AZ'), 'pdx': ('Portland', 'OR'),
    }
    
    lower_name = name.lower()
    for city_key, (city, state) in UNAMBIGUOUS_CITIES.items():
        if city_key in lower_name:
            return city, state, 'high'
    
    # Also check notes for unambiguous cities
    if notes:
        lower_notes = notes.lower()
        for city_key, (city, state) in UNAMBIGUOUS_CITIES.items():
            if city_key in lower_notes:
                return city, state, 'high'
    
    return None, None, 'none'


def has_useful_info(notes):
    """Check if notes contain any useful meetup info."""
    if not notes:
        return False
    lower = notes.lower()
    useful = [
        'meet', 'meets', 'meeting', 'located', 'based in',
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
        'pm', 'a.m', 'weekly', 'library', 'church', 'center', 'community',
        'cafe', 'coffee', 'restaurant', 'brewing', 'brewery', 'bar ',
        'welcome', 'drop-in', 'drop in', 'all ages', 'all levels',
        'casual', 'rated', 'tournament', 'otb', 'over the board',
        'address', 'street', ' ave ', ' blvd ', ' rd ',
    ]
    return any(x in lower for x in useful)


geocode_cache = {}

def geocode_location(city, state, retries=3):
    """Geocode a city/state. Caches results."""
    key = f"{city}, {state}"
    if key in geocode_cache:
        return geocode_cache[key]
    
    query = f"{city}, {state}, USA" if state else f"{city}, USA"
    
    for attempt in range(retries):
        try:
            time.sleep(1.05)
            location = geolocator.geocode(query, country_codes=['us'])
            if location:
                result = (round(location.latitude, 6), round(location.longitude, 6))
                geocode_cache[key] = result
                return result
            geocode_cache[key] = (None, None)
            return None, None
        except (GeocoderTimedOut, GeocoderServiceError) as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                print(f"  Geocoding error for {query}: {e}", file=sys.stderr)
                return None, None


def main():
    with open('public/spots.v1.json') as f:
        data = json.load(f)
    
    targets = [(i, d) for i, d in enumerate(data) 
               if not d.get('skip') and not d.get('lat') 
               and d.get('source') == 'chesscom_club']
    
    print(f"Processing {len(targets)} chess.com clubs without coordinates")
    
    skipped = 0
    geocoded = 0
    failed_extract = 0
    failed_geocode = 0
    
    for count, (idx, entry) in enumerate(targets):
        name = entry['name']
        notes = entry.get('notes', '')
        
        if count % 100 == 0:
            print(f"\nProgress: {count}/{len(targets)} (geocoded={geocoded}, skipped={skipped}, failed_extract={failed_extract})")
        
        # Skip entries with truly no useful info at all
        if not has_useful_info(notes):
            entry['skip'] = True
            entry['skip_reason'] = 'no_info'
            skipped += 1
            continue
        
        city, state, confidence = extract_location(name, notes)
        
        if city and confidence == 'high':
            if not entry.get('city'):
                entry['city'] = city
            if state and not entry.get('state'):
                entry['state'] = state
            
            lat, lng = geocode_location(city, state)
            if lat:
                entry['lat'] = lat
                entry['lng'] = lng
                geocoded += 1
                if count < 500 or count % 50 == 0:
                    print(f"  ✓ [{idx}] {name} -> {city}, {state} ({lat:.4f}, {lng:.4f})")
            else:
                failed_geocode += 1
                print(f"  ✗ [{idx}] {name} -> {city}, {state} (geocode failed)")
        else:
            failed_extract += 1
    
    print(f"\n=== RESULTS ===")
    print(f"Total processed: {len(targets)}")
    print(f"Geocoded successfully: {geocoded}")
    print(f"Skipped (no useful info): {skipped}")
    print(f"Could not extract city/state: {failed_extract}")
    print(f"Geocoding failed: {failed_geocode}")
    print(f"Unique geocode queries: {len(geocode_cache)}")
    
    with open('public/spots.v1.json', 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"\nWrote updated spots.v1.json")


if __name__ == '__main__':
    main()
