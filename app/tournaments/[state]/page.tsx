import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import SeoShell from '@/app/components/SeoShell';
import SeoEventList from '@/app/components/SeoEventList';
import { statePages } from '@/lib/event-pages';
import { SITE_URL, safeJsonLd } from '@/lib/event-seo';
type Props = { params: Promise<{ state: string }> };
export function generateStaticParams() { return statePages.map(s => ({state:s.slug})); }
export async function generateMetadata({params}:Props):Promise<Metadata> { const {state}=await params; const page=statePages.find(s=>s.slug===state); if(!page) return {}; return {title:`${page.name} Chess Tournaments & Events`,description:`Find upcoming chess tournaments in ${page.name}. Compare dates, cities, venues, time controls and registration information.`,alternates:{canonical:`${SITE_URL}/tournaments/${page.slug}`},robots:page.events.length ? undefined : {index:false,follow:true}}; }
export default async function StatePage({params}:Props) {
 const {state}=await params; const page=statePages.find(s=>s.slug===state); if(!page) notFound();
 const cities=[...new Set(page.events.map(e=>e.city).filter(Boolean))].sort();
 const crumbs={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Chess events',item:`${SITE_URL}/events`},{'@type':'ListItem',position:2,name:page.name,item:`${SITE_URL}/tournaments/${page.slug}`}]};
 return <SeoShell><script type="application/ld+json" dangerouslySetInnerHTML={{__html:safeJsonLd(crumbs)}}/><nav className="seo-breadcrumb" aria-label="Breadcrumb"><Link href="/events">All states</Link><span> / {page.name}</span></nav><p className="seo-eyebrow">Play in {page.name}</p><h1>{page.name} chess tournaments</h1><p className="seo-intro">{page.events.length} upcoming and ongoing chess events{cities.length ? ` across ${cities.length} ${cities.length===1?'city':'cities'}`:''}. Compare dates and formats, then follow the organizer’s listing for registration.</p><div className="seo-actions"><Link className="seo-primary" href={`/tournaments?state=${page.code}`}>Filter and map {page.name} tournaments →</Link></div>{cities.length>0 && <p className="seo-cities"><strong>Places to play:</strong> {cities.join(' · ')}</p>}{page.events.length ? <SeoEventList events={page.events}/> : <p>No upcoming events are currently listed. <Link href="/events">Browse other states.</Link></p>}</SeoShell>;
}
