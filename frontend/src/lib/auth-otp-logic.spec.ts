import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyOtpInput, clearOtpDigit, emptyOtpDigits, otpValue } from "./auth-otp-logic.ts";

describe("auth otp input", () => {
  it("fills following boxes when a code is pasted", () => {
    const result = applyOtpInput(emptyOtpDigits(), 0, "12a3456");
    assert.equal(otpValue(result.digits), "123456");
    assert.equal(result.focus, 5);
  });

  it("moves back and clears the previous box on backspace", () => {
    const result = clearOtpDigit(["1", "2", "", "", "", ""], 2);
    assert.deepEqual(result.digits, ["1", "", "", "", "", ""]);
    assert.equal(result.focus, 1);
  });
});
