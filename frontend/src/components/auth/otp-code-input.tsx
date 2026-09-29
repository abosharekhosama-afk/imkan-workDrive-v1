"use client";

import { useEffect, useRef } from "react";
import { applyOtpInput, clearOtpDigit, emptyOtpDigits, OTP_LENGTH, otpValue } from "../../lib/auth-otp-logic";

export function OtpCodeInput({
  digits,
  onChange,
  disabled,
}: {
  digits: string[];
  onChange: (digits: string[]) => void;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const boxes = digits.length === OTP_LENGTH ? digits : emptyOtpDigits();

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  function focusAt(index: number) {
    refs.current[index]?.focus();
    refs.current[index]?.select();
  }

  return (
    <div className="wd-auth-otp" role="group" aria-label="Verification code">
      {boxes.map((digit, index) => (
        <input
          key={index}
          ref={(node) => { refs.current[index] = node; }}
          className="wd-auth-otp-box"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1}`}
          maxLength={OTP_LENGTH}
          value={digit}
          disabled={disabled}
          onChange={(event) => {
            const result = applyOtpInput(boxes, index, event.target.value);
            onChange(result.digits);
            focusAt(result.focus);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Backspace") return;
            event.preventDefault();
            const result = clearOtpDigit(boxes, index);
            onChange(result.digits);
            focusAt(result.focus);
          }}
          onPaste={(event) => {
            event.preventDefault();
            const result = applyOtpInput(boxes, index, event.clipboardData.getData("text"));
            onChange(result.digits);
            focusAt(result.focus);
          }}
        />
      ))}
      <span className="sr-only">{otpValue(boxes)}</span>
    </div>
  );
}
