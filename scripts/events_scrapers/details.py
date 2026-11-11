"""Preserve labelled organizer text; never infer prices or dates from conditions."""
import re
from bs4 import BeautifulSoup

LABELS = r'ENTRY FEES?|EF|REGISTRATION(?: DEADLINE)?|REG|ROUND TIMES?|RDS|SCHEDULE|START TIME|TIME CONTROLS?|PRIZES?(?: & SECTIONS)?|SECTIONS|CONTACT|INFO|HOTEL BOOKING|HOTEL|HR|WHERE|WHEN|ELIGIBILITY|REQUIREMENTS|OTHER NOTES|SPECIAL NOTES|BYES|ENT|SIDE EVENTS'
BOUNDARY = re.compile(rf'(?:^|\n)[ \t]*(?:{LABELS})(?:[ \t]*:|[ \t]*(?=\n|$))|\b(?:EF|REG|RDS|HR|ENT|INFO|SIDE EVENTS)\s*:', re.I)


def body_lines(node):
    if node is None:
        return ''
    copy = BeautifulSoup(str(node), 'html.parser')
    for br in copy.find_all('br'):
        br.replace_with('\n')
    for block in copy.find_all(['p', 'div', 'li', 'h2', 'h3', 'h4', 'tr']):
        block.append('\n')
    return '\n'.join(re.sub(r'[ \t\xa0]+', ' ', line).strip() for line in copy.get_text().replace('\u200b', '').splitlines() if line.strip())


def labelled(content, label):
    # A heading may be its own paragraph or share a line with its value.
    short_labels = [abbr for abbr in ('EF', 'REG', 'RDS') if re.fullmatch(label, abbr, re.I)]
    inline = r'|\b(?:' + '|'.join(short_labels) + r')\s*:' if short_labels else ''
    start = re.compile(rf'(?:^|\n)[ \t]*(?:{label})(?:[ \t]*:|[ \t]*(?=\n|$)|[ \t]+(?=\$))' + inline, re.I)
    values = []
    heading = re.compile(r'(?:^|\n)[A-Z][A-Z &/–-]{2,60}:?\s*(?=\n|$)')
    for match in start.finditer(content):
        end = BOUNDARY.search(content, match.end())
        other_heading = heading.search(content, match.end())
        stops = [m.start() for m in (end, other_heading) if m]
        stop = min(stops) if stops else len(content)
        # Inline compact EF values end before prize-fund shorthand, not at the end of a page.
        if match[0].strip().upper().startswith('EF'):
            prize = content.find('$$', match.end(), stop)
            if prize >= 0: stop = prize
        value = content[match.end():stop].strip(' :\n')
        if value:
            values.append(value)
    result = '\n'.join(dict.fromkeys(values))
    return excerpt(result)


def excerpt(result):
    if len(result) > 1600:
        # Explicitly label an excerpt rather than cutting a condition without warning.
        cut = max(result.rfind('\n', 800, 1600), result.rfind('. ', 800, 1600))
        if cut < 0: cut = result.rfind(' ', 0, 1600)
        if cut < 0: cut = 1600
        result = result[:cut].rstrip() + '\n… See official listing for remaining details and conditions.'
    return result or None



def attendance_details(event, node):
    content = body_lines(node)
    if len(re.findall(r'\bEF\s*:', content, re.I)) > 1:
        # Compact ads interleave prices, sections and prizes in one paragraph.
        # Detached EF snippets can attach a price to the wrong eligibility bracket.
        event.reviewFlags = sorted(set((event.reviewFlags or []) + ['section-specific-fees-need-review']))
    else:
        event.entryFeeText = labelled(content, r'ENTRY FEES?|EF') or event.entryFeeText
    event.scheduleText = labelled(content, r'ROUND TIMES?|RDS|SCHEDULE|START TIME') or event.scheduleText
    event.registrationText = labelled(content, r'REGISTRATION(?: DEADLINE)?|REG') or event.registrationText
    # Inline deadlines outside a heading are retained with their conditions.
    if not event.registrationText:
        lines = [line for line in content.splitlines() if re.search(r'\b(?:registration|entries)\b.{0,60}\b(?:closes?|deadline|postmarked)\b', line, re.I)]
        event.registrationText = excerpt('\n'.join(lines))
    return event


def cancellation_evidence(name, content):
    if re.search(r'\b(?:cancelled|canceled|postponed)\b', name, re.I):
        return name
    # Explicit notices only; "cancellation policy" and conditional refunds do not qualify.
    match = re.search(r'(?:^|[.!?\n]\s*)(?:Unfortunately,?\s+)?(?:this|the)\s+(?:event|tournament)\s+(?:(?:has been|is|was)\s+)(?:cancelled|canceled|postponed)\b[^.\n]*', content, re.I)
    return match[0] if match else None


def section_details(node):
    """Use labelled section headings, not prize classes or eligibility prose."""
    content = body_lines(node)
    # Keep subheadings inside a combined prizes/sections block.
    start = re.search(r'(?:^|\n)(?:PRIZES?\s*&\s*)?SECTIONS\s*:?(?=\n|$)', content, re.I)
    if not start:
        return None
    block = content[start.end():]
    end = BOUNDARY.search(block)
    if end: block = block[:end.start()]
    sections = []
    for line in block.splitlines():
        under = re.match(r'^((?:U|Under\s+)(\d{3,4}))(?:\s+Section)?\s*(?:$|[-–—])', line, re.I)
        named = re.match(r'^(Open|Championship|Premier|Top)(?:\s+Section)?(?:\s*\((\d{3,4})\+\))?\s*(?:$|[-–—])', line, re.I)
        if under:
            sections.append({'name': under[1], 'maxRating': int(under[2])-1})
        elif named:
            section = {'name': named[1]}
            if named[2]: section['minRating'] = int(named[2])
            sections.append(section)
    return list({s['name'].casefold():s for s in sections}.values()) or None
