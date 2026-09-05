import type { BusinessHours } from "@/lib/supabase/types";

const DAY_ORDER: { key: keyof BusinessHours; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

function to12Hour(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minuteStr} ${period}`;
}

export function formatBusinessHours(hours: BusinessHours): { day: string; label: string; text: string }[] {
  return DAY_ORDER.map(({ key, label }) => {
    const day = hours[key];
    if (!day || day.closed) {
      return { day: key, label, text: "Closed" };
    }
    return { day: key, label, text: `${to12Hour(day.open)} – ${to12Hour(day.close)}` };
  });
}
