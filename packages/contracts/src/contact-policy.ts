export type ContactPreferences = {
  whatsappOnly?: boolean;
  noCallsDuringHours?: boolean;
  preferredTime?: string;
  bestDay?: string;
};

// Contact windows use the workspace timezone and an exclusive end time.
export function contactRestriction(
  profile: ContactPreferences,
  channel: string,
  at: Date,
  timezone = "Asia/Kolkata",
): string | null {
  if (profile.whatsappOnly && channel !== "WhatsApp")
    return "This client accepts WhatsApp contact only.";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const value = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";
  const weekday = value("weekday");
  const minutes = Number(value("hour")) * 60 + Number(value("minute"));
  const weekend = weekday === "Saturday" || weekday === "Sunday";
  if (
    channel === "Call" &&
    profile.noCallsDuringHours &&
    !weekend &&
    minutes >= 540 &&
    minutes < 1080
  )
    return "This client does not accept calls during working hours (Monday–Friday, 9 AM–6 PM).";
  const day = profile.bestDay;
  const namedDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  if (
    day &&
    day !== "Any Day" &&
    ((day === "Weekdays" && weekend) ||
      (day === "Weekends" && !weekend) ||
      (namedDays.includes(day) && day !== weekday))
  )
    return `Contact this client on ${day.toLowerCase()} in the workspace timezone.`;
  const windows: Record<string, [number, number]> = {
    "Morning (9 AM – 12 PM)": [540, 720],
    "Afternoon (12 PM – 5 PM)": [720, 1020],
    "Evening (6 PM – 9 PM)": [1080, 1260],
  };
  const window = windows[profile.preferredTime || ""];
  if (window && (minutes < window[0] || minutes >= window[1]))
    return `Contact this client in the ${profile.preferredTime!.toLowerCase()} window (workspace timezone).`;
  return null;
}
