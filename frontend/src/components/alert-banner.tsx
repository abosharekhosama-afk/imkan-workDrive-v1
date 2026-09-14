"use client";

import type { ReactNode } from "react";

export function AlertBanner({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="imkan-alert mb-3" role="alert">
      <span className="flex-1">{message}</span>
      {action}
    </div>
  );
}
