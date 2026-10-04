import { normalizeAvatarUrl } from "./avatar-url-logic";

describe("normalizeAvatarUrl", () => {
  it("clears an empty photo", () => {
    expect(normalizeAvatarUrl(null)).toBeNull();
    expect(normalizeAvatarUrl("  ")).toBeNull();
  });

  it("keeps a short https portrait", () => {
    expect(normalizeAvatarUrl("https://cdn.example/a.jpg")).toBe("https://cdn.example/a.jpg");
  });

  it("keeps a compact jpeg data url", () => {
    const value = "data:image/jpeg;base64," + "A".repeat(40);
    expect(normalizeAvatarUrl(value)).toBe(value);
  });

  it("rejects a non-image payload", () => {
    expect(() => normalizeAvatarUrl("data:text/plain;base64,QQ==")).toThrow(/Profile photo/);
  });
});