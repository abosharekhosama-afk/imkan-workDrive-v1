import type { ReactNode } from "react";
import { WorkflowAccessGate } from "@/components/workflow-access";

export default function AdminWorkflowsLayout({ children }: { children: ReactNode }) {
  return <WorkflowAccessGate>{children}</WorkflowAccessGate>;
}
