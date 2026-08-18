import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/auth/guard";
import { assertValidImageUpload } from "@/lib/services/image.service";

describe("assertValidImageUpload", () => {
  it("accepts jpeg, png, and webp under 5MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(() => assertValidImageUpload({ type, size: 1024 })).not.toThrow();
    }
  });

  it("rejects unsupported file types", () => {
    expect(() => assertValidImageUpload({ type: "application/pdf", size: 1024 })).toThrow(ValidationError);
    expect(() => assertValidImageUpload({ type: "image/gif", size: 1024 })).toThrow(ValidationError);
  });

  it("rejects files over 5MB", () => {
    expect(() =>
      assertValidImageUpload({ type: "image/png", size: 5 * 1024 * 1024 + 1 }),
    ).toThrow(ValidationError);
  });

  it("accepts a file exactly at the 5MB limit", () => {
    expect(() => assertValidImageUpload({ type: "image/png", size: 5 * 1024 * 1024 })).not.toThrow();
  });
});
