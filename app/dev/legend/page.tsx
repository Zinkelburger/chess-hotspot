'use client';

import { useState } from 'react';
import LegendFilter, { type ViewMode } from '@/app/components/LegendFilter';
import type { DayOfWeek } from '@/types/spot';
import type { EventType, TimeControlKind } from '@/types/event';

export default function DevLegendPage() {
  const [selectedView, setSelectedView] = useState<ViewMode>('clubs');
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [selectedEventTypes, setSelectedEventTypes] = useState<EventType[]>([]);
  const [eventRatedFilter, setEventRatedFilter] = useState<'any' | 'rated' | 'casual'>('any');
  const [eventFormatFilter, setEventFormatFilter] = useState<'any' | TimeControlKind>('any');
  const [eventDateRange, setEventDateRange] = useState<'any' | '30d' | '90d'>('any');

  return (
    <div className="min-h-screen flex flex-col">
      <div className="p-4 bg-amber-100 border-b text-sm">
        <strong>Dev: LegendFilter</strong> — Resize the window to test breakpoints. sm (640px+) = 3 columns.
      </div>
      <div className="flex-1" />
      <LegendFilter
        selectedView={selectedView}
        onViewChange={setSelectedView}
        selectedDays={selectedDays}
        onDaysChange={setSelectedDays}
        selectedEventTypes={selectedEventTypes}
        onEventTypesChange={setSelectedEventTypes}
        eventRatedFilter={eventRatedFilter}
        onEventRatedFilterChange={setEventRatedFilter}
        eventFormatFilter={eventFormatFilter}
        onEventFormatFilterChange={setEventFormatFilter}
        eventDateRange={eventDateRange}
        onEventDateRangeChange={setEventDateRange}
      />
    </div>
  );
}
