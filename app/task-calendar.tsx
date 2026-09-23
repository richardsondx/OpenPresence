"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Assignment, PublishingPlan } from "@/lib/types";
import { cleanUserFacingAssignmentInstruction } from "@/lib/runtime";

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// Civil dates use UTC for arithmetic; instants are first projected into the Presence timezone.
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const civilDate = (key: string) => new Date(`${key}T12:00:00Z`);
function localKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function safeTimezone(timezone: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); return timezone; } catch { return "UTC"; }
}

export function TaskCalendar({ assignments, windows, publishingResponsibility, timezone: requestedTimezone, onAssignment }: {
  assignments: Assignment[];
  windows: PublishingPlan["windows"];
  publishingResponsibility?: Assignment;
  timezone: string;
  onAssignment: (assignment: Assignment) => void;
}) {
  const timezone = safeTimezone(requestedTimezone);
  const today = localKey(new Date(), timezone);
  const [selectedDate, setSelectedDate] = useState(today);
  const selected = civilDate(selectedDate);
  const monday = new Date(selected);
  monday.setUTCDate(selected.getUTCDate() - (selected.getUTCDay() + 6) % 7);
  const days = weekdays.map((weekday, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return { date, key: dateKey(date), weekday };
  });
  const clock = (instant: string) => new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instant));
  const shiftWeek = (direction: number) => {
    const next = new Date(selected);
    next.setUTCDate(next.getUTCDate() + direction * 7);
    setSelectedDate(dateKey(next));
  };
  const eventsFor = (key: string, weekday: string) => {
    const events: { id: string; time: string; title: string; kind?: string; assignment?: Assignment }[] = [];
    for (const assignment of assignments) {
      if (assignment.status === "cancelled") continue;
      const schedule = assignment.schedule;
      const instant = assignment.timeframe?.startsAt ?? assignment.timeframe?.deadline;
      let time: string | undefined;
      let kind: string | undefined;
      if (schedule) {
        const matches = schedule.date ? schedule.date === key
          : assignment.recurrence?.kind === "weekdays" ? !["Saturday", "Sunday"].includes(weekday)
          : assignment.recurrence?.kind === "daily" || schedule.day === "Daily" || schedule.day === weekday;
        if (matches) time = schedule.time;
        // Terminal recurring responsibilities do not invent future occurrences.
        if (!schedule.date && ["completed", "completed_with_adaptation", "failed", "expired_incomplete"].includes(assignment.status)) continue;
      } else if (instant && Number.isFinite(Date.parse(instant)) && localKey(new Date(instant), timezone) === key) {
        time = clock(instant);
        if (!assignment.timeframe?.startsAt) kind = "Due";
      }
      if (time) events.push({ id: assignment.id, time, title: cleanUserFacingAssignmentInstruction(assignment.title || assignment.instruction), kind, assignment });
    }
    for (const window of windows) {
      if (localKey(new Date(window.startAt), timezone) === key) events.push({ id: window.id, time: clock(window.startAt), title: window.summary, kind: "Opportunity", assignment: publishingResponsibility });
    }
    return events.sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  };
  const dateLabel = (date: Date, options: Intl.DateTimeFormatOptions) => date.toLocaleDateString(undefined, { ...options, timeZone: "UTC" });
  return <section className="task-calendar" aria-label="Weekly calendar">
    <div className="task-calendar-toolbar">
      <h2>{dateLabel(days[0].date, { month: "short", day: "numeric" })} – {dateLabel(days[6].date, { month: "short", day: "numeric", year: "numeric" })}</h2>
      <div>
        <button type="button" aria-label="Previous week" onClick={() => shiftWeek(-1)}><ChevronLeft size={17} /></button>
        <button type="button" onClick={() => setSelectedDate(today)}>Today</button>
        <button type="button" aria-label="Next week" onClick={() => shiftWeek(1)}><ChevronRight size={17} /></button>
      </div>
    </div>
    <div className="task-calendar-dates">
      {days.map(day => <button type="button" key={day.key} aria-label={dateLabel(day.date, { weekday: "long", month: "long", day: "numeric" })} aria-pressed={selectedDate === day.key} aria-current={today === day.key ? "date" : undefined} className={today === day.key ? "is-today" : ""} onClick={() => setSelectedDate(day.key)}><span>{day.weekday.slice(0, 3)}</span><strong>{day.date.getUTCDate()}</strong></button>)}
    </div>
    <div className="task-calendar-grid">
      {days.map(day => <section key={day.key} className={`task-calendar-day${selectedDate === day.key ? " is-selected" : ""}`} aria-label={`${day.weekday} events`}>
        {eventsFor(day.key, day.weekday).length === 0 ? <p className="task-calendar-empty">Nothing scheduled</p> : eventsFor(day.key, day.weekday).map(event => <button type="button" key={event.id} className="task-calendar-event" disabled={!event.assignment} onClick={() => event.assignment && onAssignment(event.assignment)} aria-label={`Open ${event.kind === "Opportunity" ? "opportunity" : "task"}: ${event.title}, ${day.weekday} at ${event.time}`}>
          <span>{event.kind === "Due" ? "Due " : ""}{event.time}</span>
          <strong>{event.title}</strong>
          {event.kind === "Opportunity" && <small>Opportunity</small>}
        </button>)}
      </section>)}
    </div>
    <p className="task-calendar-timezone">{timezone.replaceAll("_", " ")}</p>
  </section>;
}
