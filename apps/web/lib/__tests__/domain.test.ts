import { describe, expect, it } from "vitest";
import {
  canAddCompany,
  canTransitionStatus,
  formatAED,
  isPortalAccessible,
  stripePriceLookupKey,
} from "@/lib/domain";

describe("stripePriceLookupKey", () => {
  it("maps plans to stable lookup keys", () => {
    expect(stripePriceLookupKey("solo")).toBe("solo_monthly");
    expect(stripePriceLookupKey("trio")).toBe("trio_monthly");
  });
});

describe("formatAED", () => {
  it("formats fils without float math", () => {
    expect(formatAED(3000)).toBe("AED 30.00");
    expect(formatAED(9000)).toBe("AED 90.00");
  });
  it("rejects non-integer or negative amounts", () => {
    expect(() => formatAED(30.5)).toThrow();
    expect(() => formatAED(-1)).toThrow();
  });
});

describe("isPortalAccessible", () => {
  it("only active opens the gate", () => {
    expect(isPortalAccessible("active")).toBe(true);
    for (const s of ["pending", "incomplete", "past_due", "canceled"] as const) {
      expect(isPortalAccessible(s)).toBe(false);
    }
  });
});

describe("canAddCompany", () => {
  it("allows below the plan max", () => {
    expect(canAddCompany("active", 0, 1)).toBe(true);
    expect(canAddCompany("active", 2, 3)).toBe(true);
  });
  it("refuses at or above the max", () => {
    expect(canAddCompany("active", 1, 1)).toBe(false);
    expect(canAddCompany("active", 3, 3)).toBe(false);
  });
  it("refuses when subscription is not active", () => {
    for (const s of ["pending", "incomplete", "past_due", "canceled"] as const) {
      expect(canAddCompany(s, 0, 3)).toBe(false);
    }
  });
  it("allows unlimited companies when max is null (enterprise)", () => {
    expect(canAddCompany("active", 25, null)).toBe(true);
    expect(canAddCompany("pending", 0, null)).toBe(false);
  });
});

describe("canTransitionStatus", () => {
  it("allows the legal billing lifecycle", () => {
    expect(canTransitionStatus("pending", "active")).toBe(true);
    expect(canTransitionStatus("active", "past_due")).toBe(true);
    expect(canTransitionStatus("past_due", "active")).toBe(true);
    expect(canTransitionStatus("active", "canceled")).toBe(true);
    expect(canTransitionStatus("canceled", "pending")).toBe(true);
  });
  it("forbids teleporting states", () => {
    expect(canTransitionStatus("pending", "past_due")).toBe(false);
    expect(canTransitionStatus("canceled", "active")).toBe(false);
    expect(canTransitionStatus("pending", "pending")).toBe(false);
  });
});
