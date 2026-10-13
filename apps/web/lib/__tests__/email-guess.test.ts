import { describe, expect, it } from "vitest";
import { suggestEmailFix } from "../email-guess";

describe("suggestEmailFix", () => {
  it("catches transposed gmail", () => {
    expect(suggestEmailFix("user@gmial.com")).toBe("user@gmail.com");
  });
  it("catches short gmail", () => {
    expect(suggestEmailFix("user@gamil.com")).toBe("user@gmail.com");
  });
  it("catches short yahoo", () => {
    expect(suggestEmailFix("user@yaho.com")).toBe("user@yahoo.com");
  });
  it("catches doubled-letter outlook", () => {
    expect(suggestEmailFix("user@outloook.com")).toBe("user@outlook.com");
  });
  it("leaves correct addresses alone", () => {
    expect(suggestEmailFix("user@gmail.com")).toBeNull();
  });
  it("leaves company domains alone", () => {
    expect(suggestEmailFix("navaira@boasis.ae")).toBeNull();
  });
  it("leaves malformed input alone", () => {
    expect(suggestEmailFix("not-an-email")).toBeNull();
    expect(suggestEmailFix("user@nodot")).toBeNull();
  });
});
