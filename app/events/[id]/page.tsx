import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SeoShell from '@/app/components/SeoShell';
import SeoEventList from '@/app/components/SeoEventList';
import { records, activeEvents, pageStatus, buildDay } from '@/lib/event-pages';
import { SITE_URL, eventPath, eventDescription, dateRange, placeLabel, eventJsonLd, safeJsonLd } from '@/lib/event-seo';
import { STATES, stateSlug } from '@/lib/us-states';
import { eventCalendarUrl } from '@/lib/event-display';
import { money, sourceNames } from '@/lib/events';

type Props = { params: Promise<{ id: string }> };
export function generateStaticParams() { return records.map(({event}) => ({id:event.id})); }
export async function generateMetadata({params}:Props):Promise<Metadata> {
  const {id}=await params; const record=records.find(r=>r.event.id===id); if(!record) return {};
  const event=record.event; const canonical=`${SITE_URL}${eventPath(event)}`;
  const title=`${event.name} — ${placeLabel(event)} | ${dateRange(event)}`;
  const description=eventDescription(event);
  return { title, description, alternates:{canonical}, openGraph:{title,description,url:canonical,type:'website'}, robots:['Upcoming','Ongoing'].includes(pageStatus(event)) ? undefined : {index:false,follow:true} };
}
export default async function EventPage({params}:Props) {
  const {id}=await params; const record=records.find(r=>r.event.id===id); if(!record) notFound();
  const event=record.event; const status=pageStatus(event); const active=['Upcoming','Ongoing'].includes(status);
  const state=event.state && STATES[event.state];
  const parent=event.online ? {name:'Online events',path:'/events/online'} : state ? {name:state,path:`/tournaments/${stateSlug(event.state!)}`} : {name:'Chess events',path:'/events'};
  const structured=active ? eventJsonLd(event,buildDay) : null;
  const crumbs={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Chess events',item:`${SITE_URL}/events`},...(parent.path!=='/events'?[{'@type':'ListItem',position:2,name:parent.name,item:`${SITE_URL}${parent.path}`}]:[]),{'@type':'ListItem',position:parent.path==='/events'?2:3,name:event.name,item:`${SITE_URL}${eventPath(event)}`}]};
  const calendar=active ? eventCalendarUrl(event) : null;
  const related=activeEvents.filter(e=>e.id!==event.id && (event.online ? e.online : !e.online && e.state===event.state)).sort((a,b)=>Number(b.city===event.city)-Number(a.city===event.city)).slice(0,4);
  const longRange=(Date.parse(event.endDate||event.date)-Date.parse(event.date))/86400000>7;
  return <SeoShell>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:safeJsonLd(crumbs)}}/>
    {structured && <script type="application/ld+json" dangerouslySetInnerHTML={{__html:safeJsonLd(structured)}}/>}
    <nav className="seo-breadcrumb" aria-label="Breadcrumb"><Link href="/events">Chess events</Link>{parent.path!=='/events' && <> / <Link href={parent.path}>{parent.name}</Link></>}</nav>
    <article>
      <p className="seo-eyebrow">{placeLabel(event)} · {status}</p>
      <h1>{event.name}</h1><p className="seo-intro seo-date">{dateRange(event)}</p>
      {!active && <div className="seo-notice"><strong>{status==='Ended'?'This event has ended.':status==='Needs confirmation'?'This listing needs confirmation.':`This event is ${status.toLowerCase()}.`}</strong><p>{event.cancellationEvidence || (status==='Ended'?'These details are kept for reference. Find upcoming events below.':'It is no longer present in the current verified listings. Check with the organizer before making plans.')}</p></div>}
      {longRange && <p className="seo-notice">This listing spans multiple dates and may be a recurring series. Use the organizer’s schedule to confirm individual sessions.</p>}
      <div className="seo-actions">{event.website && <a className="seo-primary" href={event.website} target="_blank" rel="noopener noreferrer">{active?'Organizer details & registration ↗':'Original organizer listing ↗'}</a>}{active && !event.online && event.lat != null && event.lng != null && <Link className="seo-secondary" href={`/tournaments#event=${encodeURIComponent(event.id)}`}>See it on the map</Link>}<Link className="seo-secondary" href={parent.path}>More {event.online?'online events':`${state || 'chess'} tournaments`}</Link></div>
      <div className="seo-detail-grid"><section className="seo-panel"><h2>When & where</h2><dl>
        <div><dt>Dates</dt><dd>{dateRange(event)}</dd></div>
        {event.dateText && <div><dt>Dates from the organizer</dt><dd>{event.dateText}</dd></div>}
        <div><dt>Venue</dt><dd>{event.online?'Online':event.venue || 'See organizer listing'}{!event.online && event.address && <span className="seo-block">{event.address}</span>}{!event.online && <span className="seo-block">{placeLabel(event)}</span>}</dd></div>
        {event.organizer && <div><dt>Organizer</dt><dd>{event.organizer}</dd></div>}
        {event.timezone && <div><dt>Time zone</dt><dd>{event.timezone}</dd></div>}
      </dl><div className="seo-actions">{!event.online && event.address && <a className="seo-text-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([event.venue,event.address,event.city,event.state].filter(Boolean).join(', '))}`} target="_blank" rel="noopener noreferrer">Directions ↗</a>}{calendar && <a className="seo-text-link" href={calendar} target="_blank" rel="noopener noreferrer">Add dates to calendar ↗</a>}</div></section>
      <section className="seo-panel"><h2>Format & entry</h2><dl>
        <div><dt>Rating</dt><dd>{event.rated ? event.ratingSystem || 'Rated' : event.rated===false?'Unrated':'See organizer listing'}{event.fideRated && event.ratingSystem!=='FIDE'?' · FIDE':''}</dd></div>
        <div><dt>Time control</dt><dd>{event.timeControl?.raw || event.format || 'See organizer listing'}</dd></div>
        <div><dt>Entry fee</dt><dd>{event.entryFeeText || (event.entryFeeUsdMin!=null?`From ${money(event.entryFeeUsdMin)}; confirm section and eligibility conditions with the organizer.`:'See organizer listing')}</dd></div>
        {(event.prizeFundUsd!=null || event.prizeFundGuaranteedUsd!=null) && <div><dt>Prize fund</dt><dd>{money(event.prizeFundUsd ?? event.prizeFundGuaranteedUsd)}{event.prizeFundGuaranteedUsd!=null?' guaranteed':''}</dd></div>}
        {event.sections?.length ? <div><dt>Sections</dt><dd>{[...new Set(event.sections.map(s=>s.name))].join(' · ')}</dd></div>:null}
      </dl></section></div>
      {(event.time || event.scheduleText || event.notes || event.scheduleOptions?.length) && <section className="seo-panel seo-long"><h2>Schedule</h2>{[event.time,event.scheduleText,event.notes].filter(Boolean).map((text,i)=><p key={i}>{text}</p>)}{event.scheduleOptions?.map((option,i)=><p key={i}><strong>{option.name}</strong>{' '}{option.raw || [option.startDate,option.endDate,option.roundTimes?.join(', '),option.registrationDeadline].filter(Boolean).join(' · ')}</p>)}<p className="seo-muted">Confirm round times and any schedule changes with the organizer.</p></section>}
      {event.registrationText && <section className="seo-panel seo-long"><h2>Registration</h2><p>{event.registrationText}</p></section>}
      <section className="seo-source"><h2>Listing sources</h2><p>Event details updated {new Date(record.updatedAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'})}.</p><ul>{(event.sources || []).map(source=><li key={source.id+source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{sourceNames[source.id] || source.id} ↗</a></li>)}</ul></section>
    </article>
    {related.length>0 && <section className="seo-related"><h2>More upcoming {event.online?'online events':`events in ${state || event.state || 'the United States'}`}</h2><SeoEventList events={related}/></section>}
  </SeoShell>;
}
