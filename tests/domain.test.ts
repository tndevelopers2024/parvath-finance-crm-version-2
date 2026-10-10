import { describe, it, expect } from "vitest";
import { clientSchema } from "../packages/contracts/src/index.js";
import {
  dateOnly,
  day,
  eventTiming,
  nextEventDate,
  rangeBounds,
  recurrenceAnchor,
  timing,
} from "../apps/api/src/domain.js";
describe("Domain boundaries", () => {
  it("normalizes Indian phones and email without guessing personal values", () => {
    const c = clientSchema.parse({
      name: "Test Person",
      phone: "90000 00001",
      email: "PERSON@EXAMPLE.TEST",
    });
    expect(c.phone).toBe("+919000000001");
    expect(c.email).toBe("person@example.test");
    expect(c.gender).toBeUndefined();
    expect(c.dob).toBeUndefined();
  });
  it("uses India midnight independently of UTC dates", () => {
    expect(day(new Date("2026-09-03T18:30:00Z"))).toBe("2026-09-04");
    expect(day(new Date("2026-09-03T18:29:59Z"))).toBe("2026-09-03");
  });
  it("separates task state, due date and exact overdue time", () => {
    expect(
      timing({ state: "pending", dueAt: new Date("2026-09-04T06:29:59Z") }),
    ).toBe("Overdue");
    expect(
      timing({ state: "pending", dueAt: new Date("2026-09-04T06:30:00Z") }),
    ).toBe("Due Today");
    expect(
      timing({ state: "completed", dueAt: new Date("2026-09-01T00:00:00Z") }),
    ).toBe("Completed");
  });
  it("uses inclusive start and exclusive end for overlapping ranges", () => {
    const r = rangeBounds("Next 7 Days")!;
    expect(r.gte?.toISOString()).toBe("2026-09-04T00:00:00.000Z");
    expect(r.lt.toISOString()).toBe("2026-09-11T00:00:00.000Z");
  });
  it("clamps month-end recurrence without losing historical date", () => {
    expect(
      nextEventDate(dateOnly("2026-01-31"), 1).toISOString().slice(0, 10),
    ).toBe("2026-02-28");
    expect(
      eventTiming({ status: "Confirmed", dueDate: dateOnly("2026-01-01") }),
    ).toBe("Renewed");
  });
  // Confirming each event in turn: the anchor is found among the earlier
  // events of the series, as the confirm route does.
  const chain = (first: string, months: number, length: number) => {
    const dates = [dateOnly(first)];
    while (dates.length < length) {
      const last = dates.at(-1)!;
      const next = nextEventDate(
        recurrenceAnchor(dates.slice(0, -1), last, months),
        months,
        last,
      );
      // Date-only values stay at UTC midnight whatever the process timezone.
      expect(next.toISOString().slice(10)).toBe("T00:00:00.000Z");
      dates.push(next);
    }
    return dates.map((d) => d.toISOString().slice(0, 10));
  };
  it("returns a month-end monthly series to the 31st after short months", () => {
    expect(chain("2026-01-31", 1, 13)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
      "2026-07-31",
      "2026-08-31",
      "2026-09-30",
      "2026-10-31",
      "2026-11-30",
      "2026-12-31",
      "2027-01-31",
    ]);
  });
  it("returns a 29 February annual series to the 29th in the next leap year", () => {
    expect(chain("2028-02-29", 12, 5)).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
      "2031-02-28",
      "2032-02-29",
    ]);
  });
  it("keeps a quarterly series from 30 November on the 30th", () => {
    expect(chain("2026-11-30", 3, 6)).toEqual([
      "2026-11-30",
      "2027-02-28",
      "2027-05-30",
      "2027-08-30",
      "2027-11-30",
      "2028-02-29",
    ]);
  });
  it("leaves days 1 to 28 exactly one period on, across DST changes", () => {
    expect(chain("2026-03-08", 1, 3)).toEqual([
      "2026-03-08",
      "2026-04-08",
      "2026-05-08",
    ]);
    expect(chain("2026-10-25", 1, 3)).toEqual([
      "2026-10-25",
      "2026-11-25",
      "2026-12-25",
    ]);
    expect(nextEventDate(dateOnly("2026-09-04"), 12).toISOString()).toBe(
      "2027-09-04T00:00:00.000Z",
    );
    expect(nextEventDate(dateOnly("2026-12-15"), 3).toISOString()).toBe(
      "2027-03-15T00:00:00.000Z",
    );
  });
  it("anchors only on events whose steps land on the confirmed date", () => {
    // A second series and a hand-moved date are not pulled onto another grid.
    const earlier = [dateOnly("2026-03-15"), dateOnly("2026-01-31")];
    expect(recurrenceAnchor(earlier, dateOnly("2026-09-15"), 12)).toEqual(
      dateOnly("2026-09-15"),
    );
    expect(recurrenceAnchor(earlier, dateOnly("2026-04-03"), 1)).toEqual(
      dateOnly("2026-04-03"),
    );
    expect(recurrenceAnchor(earlier, dateOnly("2026-02-28"), 1)).toEqual(
      dateOnly("2026-01-31"),
    );
    // Skips periods already passed instead of returning a date not after it.
    expect(
      nextEventDate(dateOnly("2026-01-31"), 1, dateOnly("2026-06-30"))
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-07-31");
  });
});
