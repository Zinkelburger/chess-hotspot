"""Use GeoNames postal centroids, never present them as exact venue coordinates.
Source: https://download.geonames.org/export/zip/ (CC BY 4.0).
No per-address calls, API key, or transmission of user locations.
"""
import csv
import io
import json
from pathlib import Path
import re
import zipfile
import requests

class Geocoder:
    def __init__(self):
        self.cache_path = Path('data/event-geocodes.json')
        self.cache = json.loads(self.cache_path.read_text()) if self.cache_path.exists() else {}
        self.rows = None
        self.spots = json.loads(Path('public/spots.v1.json').read_text())

    def load(self):
        path = Path('data/geonames/US.zip')
        if not path.exists():
            response = requests.get('https://download.geonames.org/export/zip/US.zip', timeout=60)
            response.raise_for_status(); path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(response.content)
        with zipfile.ZipFile(path) as archive:
            self.rows = list(csv.reader(io.StringIO(archive.read('US.txt').decode()), delimiter='\t'))

    def resolve(self, event):
        if event.online: event.lat = event.lng = None; return
        # Reuse the verified Boylston venue across sources only when identity and
        # the complete street/city/state/ZIP agree; a shared ZIP alone is not enough.
        address = (event.address or '').lower()
        identity = ' '.join([event.venue or '', event.organizer or '', event.name]).lower()
        at_boylston = ('boylston' in identity and (event.city or '').casefold() == 'boston'
                       and event.state == 'MA' and re.search(r'\b35\s+kingston\s+st(?:reet)?\b', address)
                       and re.search(r'\b02111\b', address))
        if at_boylston:
            spot = next((s for s in self.spots if s['id'] == 'boylston_chess_club'), None)
            if spot and '35 Kingston' in spot.get('address','') and spot.get('lat'):
                event.lat, event.lng = spot['lat'],spot['lng']; event.locationPrecision='venue';event.hostClubId=spot['id'];return
        if event.lat is not None and event.lng is not None:
            event.locationPrecision = event.locationPrecision or 'approximate'; return
        zip_matches = list(re.finditer(r'\b(\d{5})(?:-\d{4})?\b',event.address or ''))
        zip_match = zip_matches[-1] if zip_matches else None
        key = '|'.join([event.city or '',event.state or '',zip_match[1] if zip_match else ''])
        if key not in self.cache:
            if self.rows is None: self.load()
            matches = [r for r in self.rows if r[4] == event.state and ((zip_match and r[1] == zip_match[1]) or (not zip_match and r[2].casefold() == (event.city or '').casefold()))]
            self.cache[key] = {'lat':sum(float(r[9]) for r in matches)/len(matches),'lng':sum(float(r[10]) for r in matches)/len(matches),'precision':'postal' if zip_match else 'city'} if matches else None
        result = self.cache[key]
        if result:
            event.lat,event.lng,event.locationPrecision = result['lat'],result['lng'],result['precision']

    def save(self):
        self.cache_path.write_text(json.dumps(self.cache,indent=2,sort_keys=True)+'\n')
