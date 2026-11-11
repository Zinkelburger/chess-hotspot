"""Small, cached, polite HTTP client and conservative metadata helpers."""
from __future__ import annotations
import hashlib
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from .details import cancellation_evidence

CACHE = Path('data/event-http-cache')
STATES = dict(zip('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(), 'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|District of Columbia|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming'.split('|')))

def text(node):
    return node.get_text(' ', strip=True) if node else ''

def state_code(value):
    return next((code for code, name in STATES.items() if value.lower() in (code.lower(), name.lower())), None)

class Client:
    def __init__(self, ttl=21600):
        self.ttl = ttl
        self.last_request = {}
        self.session = requests.Session()
        retry = Retry(total=2, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504], allowed_methods=["GET"], respect_retry_after_header=True)
        self.session.mount("https://", HTTPAdapter(max_retries=retry))
        self.session.mount("http://", HTTPAdapter(max_retries=retry))
        self.session.headers['User-Agent'] = 'ChessHotspot/1.0 (+https://chesshotspot.com; public tournament directory)'

    def get(self, url):
        path = CACHE / (hashlib.sha256(url.encode()).hexdigest() + '.html')
        if path.exists() and time.time() - path.stat().st_mtime < self.ttl:
            return path.read_text()
        host = urlparse(url).netloc
        time.sleep(max(0, .35 - (time.monotonic() - self.last_request.get(host, 0))))
        self.last_request[host] = time.monotonic()
        response = self.session.get(url, timeout=25)
        response.raise_for_status()
        content = response.text
        if len(content) < 100:
            raise ValueError(f'Empty response: {url}')
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        return content

    def soup(self, url):
        return BeautifulSoup(self.get(url), 'html.parser')

def source_ref(source_id, url):
    return {'id': source_id, 'url': url, 'fetchedAt': datetime.now(timezone.utc).isoformat(timespec='seconds')}

def enrich(event, content):
    # A mention of "unrated players" does not mean an unrated tournament.
    if re.search(r'\bunrated\b', event.name, re.I) and not re.search(r'\brated\b', event.name, re.I):
        event.rated, event.ratingSystem = False, 'none'
    elif re.search(r'US(?:CF| Chess|Chess).*?(?:rated|membership)|USCF-rated', content, re.I):
        event.rated, event.ratingSystem = True, 'USCF'
    if re.search(r'\bFIDE[- ]rated\b', content, re.I): event.fideRated = True
    event.cancellationEvidence = cancellation_evidence(event.name, content)
    event.timeControls = parse_time_controls(content) or None
    tc = parse_time_control(content)
    if tc:
        event.timeControl = tc
        event.format = tc['kind']
        if tc['kind'] == 'custom':
            event.reviewFlags = sorted(set((event.reviewFlags or []) + ['multiple-or-ambiguous-time-controls']))
    if re.search(r'scholastic|\bK[–-]12\b', event.name, re.I): event.audience = 'scholastic'
    event.sections = [{'name': m[0], 'maxRating': int(m[1]) - 1} for m in re.finditer(r'\b(?:U|Under\s+)(\d{3,4})\b', content, re.I)] or event.sections
    return event


def stable_id(source_id, url, occurrence):
    return f"{source_id}-{hashlib.sha256(url.encode()).hexdigest()[:16]}-{occurrence}"


def parse_time_controls(content):
    # Auxiliary events and explicit cross-promotions must not change the main event.
    content = re.split(r'\b(?:SIDE EVENTS?\s*:|Also enter our\b)', content, flags=re.I)[0]
    suffix = r'\s*(?:min(?:utes?)?)?\s*[-;,]?\s*(?:(?:\+|inc/?|i)\s*(\d+)|d\s*(\d+))?'
    staged_pattern = re.compile(r'\b(\d{1,3})/(\d{1,3})\s*[,;]?\s*(?:SD|G)/(\d{1,3})' + suffix, re.I)
    flat_pattern = re.compile(r'\bG\s*/\s*(\d+(?:\.\d+)?)' + suffix, re.I)
    found, occupied = [], []
    for m in staged_pattern.finditer(content):
        occupied.append(m.span())
        # Legacy 40/2, G/1 uses hours. Preserve it without pretending it is 1-minute blitz.
        tc = {'kind': 'classical' if int(m[2]) > 5 else 'custom', 'raw': m[0].strip()}
        if int(m[2]) > 5:
            tc['baseMinutes'] = int(m[2])
        if m[4]: tc['incrementSeconds'] = int(m[4])
        if m[5]: tc['delaySeconds'] = int(m[5])
        found.append((m.start(), tc))
    legacy_hours = any(tc['kind'] == 'custom' for _, tc in found)
    for m in flat_pattern.finditer(content):
        if any(a <= m.start() < b for a, b in occupied): continue
        base = float(m[1])
        tc = {'kind': 'classical' if base >= 60 else 'rapid' if base >= 10 else 'blitz', 'baseMinutes': base, 'raw': m[0].strip()}
        if legacy_hours and base <= 5:
            tc['kind'] = 'custom'
            tc.pop('baseMinutes')
        if m[2]: tc['incrementSeconds'] = int(m[2])
        if m[3]: tc['delaySeconds'] = int(m[3])
        found.append((m.start(), tc))
    controls, seen = [], set()
    for _, tc in sorted(found, key=lambda item: item[0]):
        key = tuple((k, v) for k, v in tc.items() if k != 'raw')
        if tc['kind'] == 'custom': key += (('raw', tc['raw']),)
        if key not in seen:
            controls.append(tc); seen.add(key)
    return controls


def parse_time_control(content):
    controls = parse_time_controls(content)
    if not controls: return None
    if len(controls) == 1: return controls[0]
    return {'kind': 'custom', 'raw': ' / '.join(tc['raw'] for tc in controls)}
