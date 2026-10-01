import { describe, expect, it } from "vitest";
import {
  REMINDER_SCHEDULE,
  daysUntilDubaiDay,
  displayDubaiDate,
  dubaiDayKey,
} from "@/lib/domain";

describe("renewal day math (Asia/Dubai)", () => {
  it("maps instants to the correct Dubai calendar day", () => {
    // 2026-09-30 19:59:59Z = 23:59:59 in Dubai (UTC+4) → still Sep 30
    expect(dubaiDayKey(new Date("2026-09-30T19:59:59Z"))).toBe("2026-09-30");
    // one second later → Oct 1 in Dubai
    expect(dubaiDayKey(new Date("2026-09-30T20:00:00Z"))).toBe("2026-10-01");
  });

  it("counts whole calendar days until the period end", () => {
    const now = new Date("2026-10-01T06:00:00Z"); // 10:00 Dubai, Oct 1
    expect(daysUntilDubaiDay("2026-10-01T18:00:00Z", now)).toBe(0);
    expect(daysUntilDubaiDay("2026-10-02T01:00:00Z", now)).toBe(1);
    expect(daysUntilDubaiDay("2026-10-31T19:59:59Z", now)).toBe(30);
    expect(daysUntilDubaiDay("2026-09-30T19:00:00Z", now)).toBe(-1);
  });

  it("formats the Dubai display date", () => {
    expect(displayDubaiDate("2026-10-12T20:00:00Z")).toBe("13 Oct 2026");
  });

  it("reminds on the agreed schedule only", () => {
    expect([...REMINDER_SCHEDULE]).toEqual([30, 14, 7, 1]);
  });
});
