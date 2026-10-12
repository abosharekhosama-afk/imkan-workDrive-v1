"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { WorkflowShell } from "@/components/workflow-shell";
import { WorkflowHelp } from "@/components/workflow-help";
import { WorkflowConceptGuide } from "@/components/workflow-concept-guide";
import { useLocale } from "@/components/locale-provider";
import {
  createWorkflowFunction,
  updateWorkflowFunction,
  deleteWorkflowFunction,
  createWorkflowFunctionVersion,
  listWorkflowFunctionExecutions,
  listWorkflowFunctionVersions,
  listWorkflowFunctions,
  listConnections,
  publishWorkflowFunctionVersion,
  testWorkflowFunction,
  type WorkflowFunction,
  type WorkflowFunctionVersion,
  type Connection,
} from "@/lib/api/workflows";
import { ImkanOptionPicker, toImkanPickerOptions } from "@/components/imkan-option-picker";

type Port = { key: string; label: string; type: string; required?: boolean; description?: string };
type Operation = Record<string, unknown> & { op: string };
type FunctionDefinition = { inputs: Port[]; operations: Operation[]; outputs: Port[] };

function functionKeyFromName(name: string) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[a-z_][a-z0-9_]*$/.test(slug) ? slug.slice(0, 64) : "";
}

type Draft = {
  name: string;
  key: string;
  description: string;
  definition: FunctionDefinition;
  runtime: "SAFE";
  permissions: string[];
  timeoutMs: number;
  memoryLimitMb: number;
};

/** Zoho-style palette groups mapped onto SAFE backend operations */
const ZOHO_PALETTE = [
  {
    id: "basic",
    label: "BASIC",
    arLabel: "أساسي",
    items: [
      { op: "SET_FIELD", en: "set variable", ar: "تعيين متغير", desc: "Sets the content of the specified field with the value of an expression" },
      { op: "COPY_VALUE", en: "add comment", ar: "تعليق", desc: "Copy / annotate a value into a field (comment-style assignment)" },
      { op: "LOWERCASE", en: "info", ar: "معلومات", desc: "Normalize text (info-style transform)" },
    ],
  },
  {
    id: "condition",
    label: "CONDITION",
    arLabel: "شرط",
    items: [
      { op: "IF", en: "if", ar: "if", desc: "Performs a set of tasks conditionally based on evaluating a boolean expression." },
      { op: "IF", en: "else if", ar: "else if", desc: "Executes statements when the if condition fails and the else if condition is true.", variant: "elseif" },
      { op: "IF", en: "else", ar: "else", desc: "Executes when prior conditions fail.", variant: "else" },
    ],
  },
  {
    id: "notifications",
    label: "NOTIFICATIONS",
    arLabel: "إشعارات",
    items: [
      { op: "NOTIFY_OWNER", en: "send mail", ar: "إرسال بريد", desc: "Sends a notification / mail-style message to the resource owner." },
      { op: "ADD_TAG", en: "post to chat", ar: "نشر في المحادثة", desc: "Post a tag-style marker (chat-style signal in SAFE runtime)." },
    ],
  },
  {
    id: "integrations",
    label: "INTEGRATIONS",
    arLabel: "تكاملات",
    items: [
      { op: "HTTP_REQUEST", en: "invoke API", ar: "استدعاء API", desc: "Runs actions via API calls using a Connection (Zoho invoke API style)." },
      { op: "CONNECTION_READ", en: "webhook", ar: "Webhook", desc: "Read a resource through a Connection." },
      { op: "HTTP_REQUEST", en: "zoho integration", ar: "تكامل Zoho", desc: "Integration call through a preconfigured Connection." },
      { op: "HTTP_REQUEST", en: "FTP/SFTP", ar: "FTP/SFTP", desc: "File transfer style call via Connection HTTP bridge." },
    ],
  },
  {
    id: "collection",
    label: "COLLECTION",
    arLabel: "مجموعة",
    items: [
      { op: "SET_FIELD", en: "create collection", ar: "إنشاء مجموعة", desc: "Create a collection field value." },
      { op: "CONCAT", en: "insert", ar: "إدراج", desc: "Insert / join values into a field." },
      { op: "COPY_VALUE", en: "get", ar: "جلب", desc: "Get / copy a value." },
      { op: "SET_FIELD", en: "update", ar: "تحديث", desc: "Update a field value." },
      { op: "SET_FIELD", en: "delete", ar: "حذف", desc: "Clear a field value." },
      { op: "IF", en: "for each element", ar: "لكل عنصر", desc: "Conditional loop-style branch (SAFE maps to IF)." },
    ],
  },
  {
    id: "math",
    label: "MATH",
    arLabel: "حساب",
    items: [
      { op: "ADD", en: "add", ar: "جمع", desc: "Add two values." },
      { op: "SUBTRACT", en: "subtract", ar: "طرح", desc: "Subtract values." },
      { op: "MULTIPLY", en: "multiply", ar: "ضرب", desc: "Multiply values." },
      { op: "DIVIDE", en: "divide", ar: "قسمة", desc: "Divide values." },
      { op: "NUMBER", en: "to number", ar: "إلى رقم", desc: "Convert to number." },
      { op: "UPPERCASE", en: "uppercase", ar: "أحرف كبيرة", desc: "Uppercase text." },
    ],
  },
] as const;

const STARTER: Draft = {
  name: "Normalize file status",
  key: "normalize_file_status",
  description: "Normalize file metadata and return a reusable status value.",
  definition: {
    inputs: [{ key: "status", label: "Current status", type: "text", required: false, description: "Optional workflow status." }],
    operations: [{ op: "LOWERCASE", left: "{{status}}", field: "normalized_status" }],
    outputs: [{ key: "normalized_status", label: "Normalized status", type: "text", description: "Lowercase status." }],
  },
  runtime: "SAFE",
  permissions: ["read_file_metadata", "write_workflow_fields"],
  timeoutMs: 1000,
  memoryLimitMb: 64,
};

function txt(ar: boolean, en: string, arText: string) { return ar ? arText : en; }

function cloneDefinition(definition: unknown): FunctionDefinition {
  const d = definition && typeof definition === "object" ? definition as Record<string, unknown> : {};
  const ports = (value: unknown): Port[] => Array.isArray(value) ? value.map((p) => {
    const x = p && typeof p === "object" ? p as Record<string, unknown> : {};
    return { key: String(x.key ?? ""), label: String(x.label ?? x.key ?? ""), type: String(x.type ?? "text"), required: x.required === true, description: String(x.description ?? "") };
  }) : [];
  const operations: Operation[] = Array.isArray(d.operations) ? d.operations.map((x) => ({ ...(x as Record<string, unknown>), op: String((x as Record<string, unknown>).op ?? "SET_FIELD") })) as Operation[] : [];
  return { inputs: ports(d.inputs), operations, outputs: ports(d.outputs) };
}

function emptyOperation(op: string): Operation {
  switch (op) {
    case "SET_FIELD": return { op, field: "result", value: "{{file.name}}" };
    case "COPY_VALUE": return { op, field: "result", left: "{{file.name}}" };
    case "CONCAT": return { op, field: "result", left: "{{file.name}}", right: "", separator: " " };
    case "LOWERCASE": return { op, field: "result", left: "{{file.name}}" };
    case "UPPERCASE": return { op, field: "result", left: "{{file.name}}" };
    case "NUMBER": return { op, field: "result", left: "0" };
    case "ADD": return { op, field: "result", left: "1", right: "1" };
    case "SUBTRACT": return { op, field: "result", left: "1", right: "1" };
    case "MULTIPLY": return { op, field: "result", left: "1", right: "1" };
    case "DIVIDE": return { op, field: "result", left: "1", right: "1" };
    case "NOTIFY_OWNER": return { op, title: "Workflow update", body: "File {{file.name}} was updated" };
    case "ADD_TAG": return { op, tag: "{{file.extension}}" };
    case "IF": return { op, condition: "{{status}} == active", then: { op: "SET_FIELD", field: "result", value: "yes" }, else: { op: "SET_FIELD", field: "result", value: "no" } };
    case "HTTP_REQUEST": return { op, connectionId: "", method: "GET", path: "/", outputField: "http_result", responseMode: "TEXT", retries: 0 };
    case "CONNECTION_READ": return { op, connectionId: "", resourceId: "{{file.id}}", outputField: "resource" };
    default: return { op: "SET_FIELD", field: "result", value: "" };
  }
}

/** Generate Zoho Deluge-style script lines from SAFE operations */
function operationToScriptLines(op: Operation, index: number): { lines: string[]; lineErrors: Record<number, string> } {
  const errors: Record<number, string> = {};
  const lines: string[] = [];
  const field = String(op.field ?? op.outputField ?? `step_${index + 1}`);
  const mark = (rel: number, msg: string) => { errors[rel] = msg; };

  switch (op.op) {
    case "SET_FIELD": {
      const v = String(op.value ?? "");
      if (!field.trim()) mark(0, "Variable name is required");
      if (!v.trim()) mark(0, "Expression is required");
      lines.push(`    ${field || "<variable>"} = ${v || "<expression>"};`);
      break;
    }
    case "COPY_VALUE": {
      const left = String(op.left ?? "");
      if (!field.trim()) mark(0, "Variable name is required");
      if (!left.trim()) mark(0, "Expression is required");
      lines.push(`    ${field || "<variable>"} = ${left || "<expression>"};`);
      break;
    }
    case "CONCAT": {
      const left = String(op.left ?? "");
      const right = String(op.right ?? "");
      const sep = String(op.separator ?? "");
      if (!field.trim()) mark(0, "Variable name is required");
      lines.push(`    ${field || "<variable>"} = ${left || "<expression>"} + "${sep}" + ${right || "<expression>"};`);
      break;
    }
    case "LOWERCASE":
    case "UPPERCASE":
    case "NUMBER": {
      const left = String(op.left ?? "");
      if (!field.trim()) mark(0, "Variable name is required");
      if (!left.trim()) mark(0, "Expression is required");
      const fn = op.op === "LOWERCASE" ? "lower" : op.op === "UPPERCASE" ? "upper" : "tonumber";
      lines.push(`    ${field || "<variable>"} = ${fn}(${left || "<expression>"});`);
      break;
    }
    case "ADD":
    case "SUBTRACT":
    case "MULTIPLY":
    case "DIVIDE": {
      const left = String(op.left ?? "");
      const right = String(op.right ?? "");
      const sym = op.op === "ADD" ? "+" : op.op === "SUBTRACT" ? "-" : op.op === "MULTIPLY" ? "*" : "/";
      if (!field.trim()) mark(0, "Variable name is required");
      if (!left.trim() || !right.trim()) mark(0, "Both operands are required");
      if (op.op === "DIVIDE" && right.trim() === "0") mark(0, "Division by zero is not allowed");
      lines.push(`    ${field || "<variable>"} = ${left || "<expression>"} ${sym} ${right || "<expression>"};`);
      break;
    }
    case "NOTIFY_OWNER": {
      const title = String(op.title ?? "");
      const body = String(op.body ?? "");
      if (!title.trim()) mark(1, "Subject / title is required");
      if (!body.trim()) mark(2, "Message is required");
      lines.push(`    sendmail`);
      lines.push(`    [`);
      lines.push(`        from: <expression>`);
      lines.push(`        to: owner`);
      lines.push(`        subject: ${title || "<expression>"}`);
      lines.push(`        message: ${body || "<expression>"}`);
      lines.push(`    ]`);
      break;
    }
    case "ADD_TAG": {
      const tag = String(op.tag ?? "");
      if (!tag.trim()) mark(0, "Message / tag is required");
      lines.push(`    zoho.cliq.postToChat(<chatid>, ${tag || "<message>"});`);
      break;
    }
    case "IF": {
      const cond = String(op.condition ?? "");
      const thenOp = op.then && typeof op.then === "object" ? op.then as Record<string, unknown> : {};
      const elseOp = op.else && typeof op.else === "object" ? op.else as Record<string, unknown> : {};
      if (!cond.trim()) mark(0, "Condition is required");
      lines.push(`    if ( ${cond || "<variable> <opr> <expression>"} )`);
      lines.push(`    {`);
      lines.push(`        ${String(thenOp.field ?? "result")} = ${JSON.stringify(thenOp.value ?? "")};`);
      lines.push(`    }`);
      lines.push(`    else`);
      lines.push(`    {`);
      lines.push(`        ${String(elseOp.field ?? "result")} = ${JSON.stringify(elseOp.value ?? "")};`);
      lines.push(`    }`);
      break;
    }
    case "HTTP_REQUEST": {
      const path = String(op.path ?? "");
      const method = String(op.method ?? "GET");
      const conn = String(op.connectionId ?? "");
      const out = String(op.outputField ?? "http_result");
      if (!conn.trim()) mark(0, "Connection is required");
      if (!path.trim()) mark(1, "Relative path is required");
      lines.push(`    ${out} = invokeapi`);
      lines.push(`    [`);
      lines.push(`        service: <service>`);
      lines.push(`        path: ${path || "<path>"}`);
      lines.push(`        type: ${method}`);
      lines.push(`        parameters: <expression>`);
      lines.push(`        headers: <expression>`);
      lines.push(`        connection: ${conn || "<connection>"}`);
      lines.push(`    ];`);
      break;
    }
    case "CONNECTION_READ": {
      const conn = String(op.connectionId ?? "");
      const rid = String(op.resourceId ?? "");
      const out = String(op.outputField ?? "resource");
      if (!conn.trim()) mark(0, "Connection is required");
      if (!rid.trim()) mark(0, "Resource id is required");
      lines.push(`    ${out} = invokeurl`);
      lines.push(`    [`);
      lines.push(`        url: ${rid || "<expression>"}`);
      lines.push(`        type: GET`);
      lines.push(`        connection: ${conn || "<connection>"}`);
      lines.push(`    ];`);
      break;
    }
    default:
      lines.push(`    // unsupported: ${op.op}`);
      mark(0, `Unsupported operation: ${op.op}`);
  }
  return { lines, lineErrors: errors };
}

function buildScript(ops: Operation[]): { text: string; lineMeta: Array<{ opIndex: number; rel: number }>; errors: Map<number, string> } {
  const header = ["void automation.data()", "{"];
  const body: string[] = [];
  const lineMeta: Array<{ opIndex: number; rel: number }> = [];
  const errors = new Map<number, string>();
  let lineNo = header.length; // 1-based later
  ops.forEach((op, opIndex) => {
    const { lines, lineErrors } = operationToScriptLines(op, opIndex);
    lines.forEach((ln, rel) => {
      body.push(ln);
      lineMeta.push({ opIndex, rel });
      if (lineErrors[rel]) errors.set(lineNo + rel + 1, lineErrors[rel]); // 1-based absolute
    });
    lineNo += lines.length;
  });
  const footer = ["}"];
  const all = [...header, ...body, ...footer];
  // absolute line numbers: header is lines 1..header.length
  const absErrors = new Map<number, string>();
  errors.forEach((msg, abs) => absErrors.set(abs, msg));
  // recompute properly
  absErrors.clear();
  let abs = header.length;
  ops.forEach((op, opIndex) => {
    const { lines, lineErrors } = operationToScriptLines(op, opIndex);
    lines.forEach((_, rel) => {
      abs += 1;
      if (lineErrors[rel]) absErrors.set(abs, lineErrors[rel]);
    });
  });
  return { text: all.join("\n"), lineMeta, errors: absErrors };
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-medium text-[#333]">{label}{required ? <span className="text-red-500"> *</span> : null}</span>
      {children}
    </label>
  );
}

function ZohoInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded border border-[#cfcfcf] bg-white px-3 py-2 text-[13px] text-[#222] outline-none focus:border-[#4b8bf5] ${props.className ?? ""}`} />;
}
function ZohoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full rounded border border-[#cfcfcf] bg-white px-3 py-2 text-[13px] text-[#222] outline-none focus:border-[#4b8bf5] ${props.className ?? ""}`} />;
}

/** Configuration drawer form for a selected operation — Zoho style */
function OperationConfigForm({
  operation, onChange, ar, connections, title, description, onClose,
}: {
  operation: Operation;
  onChange: (next: Operation) => void;
  ar: boolean;
  connections: Connection[];
  title: string;
  description: string;
  onClose: () => void;
}) {
  const set = (patch: Record<string, unknown>) => onChange({ ...operation, ...patch });
  const connOpts = toImkanPickerOptions(connections.map((c) => ({ value: c.id, label: c.name || c.id })));

  return (
    <div className="flex h-full min-h-0 flex-col border-e border-[#e8e8e8] bg-white">
      <div className="flex items-start justify-between gap-2 border-b border-[#eee] px-4 py-3">
        <div>
          <h3 className="text-[15px] font-semibold text-[#222]">{title}</h3>
          <p className="mt-0.5 text-[11px] text-[#777]">{description}</p>
        </div>
        <button type="button" className="text-[#888] hover:text-[#333]" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {operation.op === "SET_FIELD" && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#5b8def]">
              <span className="rounded border border-dashed border-[#9bb8ef] px-2 py-1">variable</span>
              <span>=</span>
              <span className="rounded border border-dashed border-[#9bb8ef] px-2 py-1">expression</span>
              <span>;</span>
            </div>
            <Field label={ar ? "تعريف أو اختيار المتغير" : "Declare or select variable"} required>
              <ZohoInput value={String(operation.field ?? "")} onChange={(e) => set({ field: e.target.value })} placeholder="Eg: name" />
            </Field>
            <Field label={ar ? "التعبير" : "Specify Expression"} required>
              <ZohoInput value={String(operation.value ?? "")} onChange={(e) => set({ value: e.target.value })} placeholder="<expression>" />
            </Field>
          </>
        )}
        {operation.op === "COPY_VALUE" && (
          <>
            <Field label={ar ? "المتغير" : "Variable"} required>
              <ZohoInput value={String(operation.field ?? "")} onChange={(e) => set({ field: e.target.value })} />
            </Field>
            <Field label={ar ? "القيمة" : "Expression"} required>
              <ZohoInput value={String(operation.left ?? "")} onChange={(e) => set({ left: e.target.value })} />
            </Field>
          </>
        )}
        {(operation.op === "LOWERCASE" || operation.op === "UPPERCASE" || operation.op === "NUMBER") && (
          <>
            <Field label={ar ? "المتغير" : "Variable"} required>
              <ZohoInput value={String(operation.field ?? "")} onChange={(e) => set({ field: e.target.value })} />
            </Field>
            <Field label={ar ? "التعبير" : "Specify expression"} required>
              <ZohoInput value={String(operation.left ?? "")} onChange={(e) => set({ left: e.target.value })} placeholder="<expression>" />
            </Field>
          </>
        )}
        {(operation.op === "ADD" || operation.op === "SUBTRACT" || operation.op === "MULTIPLY" || operation.op === "DIVIDE" || operation.op === "CONCAT") && (
          <>
            <Field label={ar ? "المتغير الناتج" : "Result variable"} required>
              <ZohoInput value={String(operation.field ?? "")} onChange={(e) => set({ field: e.target.value })} />
            </Field>
            <Field label={ar ? "اليسار" : "Left"} required>
              <ZohoInput value={String(operation.left ?? "")} onChange={(e) => set({ left: e.target.value })} />
            </Field>
            {operation.op === "CONCAT" && (
              <Field label={ar ? "الفاصل" : "Separator"}>
                <ZohoInput value={String(operation.separator ?? "")} onChange={(e) => set({ separator: e.target.value })} />
              </Field>
            )}
            <Field label={ar ? "اليمين" : "Right"} required>
              <ZohoInput value={String(operation.right ?? "")} onChange={(e) => set({ right: e.target.value })} />
            </Field>
          </>
        )}
        {operation.op === "IF" && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#5b8def]">
              <span>if (</span>
              <span className="rounded border border-dashed border-[#9bb8ef] px-2 py-1">condition</span>
              <span>)</span>
            </div>
            <Field label={ar ? "تحديد الشرط" : "Specify Condition"} required>
              <ZohoInput value={String(operation.condition ?? "")} onChange={(e) => set({ condition: e.target.value })} placeholder="<variable> <opr> <expression>" />
            </Field>
            <Field label={ar ? "حقل عند التحقق" : "Then field"}>
              <ZohoInput
                value={String((operation.then as Record<string, unknown> | undefined)?.field ?? "result")}
                onChange={(e) => set({ then: { ...(operation.then as object), op: "SET_FIELD", field: e.target.value, value: (operation.then as Record<string, unknown> | undefined)?.value ?? "" } })}
              />
            </Field>
            <Field label={ar ? "قيمة عند التحقق" : "Then value"}>
              <ZohoInput
                value={String((operation.then as Record<string, unknown> | undefined)?.value ?? "")}
                onChange={(e) => set({ then: { ...(operation.then as object), op: "SET_FIELD", field: (operation.then as Record<string, unknown> | undefined)?.field ?? "result", value: e.target.value } })}
              />
            </Field>
            <Field label={ar ? "حقل وإلا" : "Else field"}>
              <ZohoInput
                value={String((operation.else as Record<string, unknown> | undefined)?.field ?? "result")}
                onChange={(e) => set({ else: { ...(operation.else as object), op: "SET_FIELD", field: e.target.value, value: (operation.else as Record<string, unknown> | undefined)?.value ?? "" } })}
              />
            </Field>
            <Field label={ar ? "قيمة وإلا" : "Else value"}>
              <ZohoInput
                value={String((operation.else as Record<string, unknown> | undefined)?.value ?? "")}
                onChange={(e) => set({ else: { ...(operation.else as object), op: "SET_FIELD", field: (operation.else as Record<string, unknown> | undefined)?.field ?? "result", value: e.target.value } })}
              />
            </Field>
          </>
        )}
        {operation.op === "NOTIFY_OWNER" && (
          <>
            <Field label="From *" required>
              <ZohoInput placeholder={ar ? "المرسل" : "From"} defaultValue="" disabled title={ar ? "يُرسل كمالك المورد في وقت التشغيل" : "Resolved to resource owner at runtime"} value="owner" readOnly />
            </Field>
            <Field label="To *" required>
              <ZohoInput value="owner" readOnly />
            </Field>
            <Field label="Subject *" required>
              <ZohoInput value={String(operation.title ?? "")} onChange={(e) => set({ title: e.target.value })} placeholder="Subject of the mail" />
            </Field>
            <Field label="Message *" required>
              <ZohoTextarea rows={5} value={String(operation.body ?? "")} onChange={(e) => set({ body: e.target.value })} />
            </Field>
          </>
        )}
        {operation.op === "ADD_TAG" && (
          <>
            <Field label="ChatID / Tag *" required>
              <ZohoInput value={String(operation.tag ?? "")} onChange={(e) => set({ tag: e.target.value })} placeholder="<chatid> / tag" />
            </Field>
            <Field label="Message">
              <ZohoInput value={String(operation.tag ?? "")} onChange={(e) => set({ tag: e.target.value })} placeholder="<message>" />
            </Field>
          </>
        )}
        {operation.op === "HTTP_REQUEST" && (
          <>
            <Field label={ar ? "تخزين الاستجابة في" : "Store Response in"}>
              <ZohoInput value={String(operation.outputField ?? "")} onChange={(e) => set({ outputField: e.target.value })} />
            </Field>
            <Field label={ar ? "الاتصال" : "Connection"} required>
              <ImkanOptionPicker value={String(operation.connectionId ?? "")} onChange={(v) => set({ connectionId: v })} options={connOpts} placeholder={ar ? "اختر اتصالاً" : "Select Connection"} />
            </Field>
            <Field label={ar ? "المسار النسبي" : "Relative Path URL String"} required>
              <ZohoInput value={String(operation.path ?? "")} onChange={(e) => set({ path: e.target.value })} placeholder="/v1/resource" />
            </Field>
            <Field label={ar ? "نوع الطلب" : "Request Type"} required>
              <div className="flex flex-wrap gap-3 text-[12px]">
                {["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"].map((m) => (
                  <label key={m} className="inline-flex items-center gap-1.5">
                    <input type="radio" name="http-method" checked={String(operation.method ?? "GET") === m} onChange={() => set({ method: m })} />
                    {m}
                  </label>
                ))}
              </div>
            </Field>
          </>
        )}
        {operation.op === "CONNECTION_READ" && (
          <>
            <Field label={ar ? "تخزين في" : "Store Response in"}>
              <ZohoInput value={String(operation.outputField ?? "")} onChange={(e) => set({ outputField: e.target.value })} />
            </Field>
            <Field label={ar ? "الاتصال" : "Connection"} required>
              <ImkanOptionPicker value={String(operation.connectionId ?? "")} onChange={(v) => set({ connectionId: v })} options={connOpts} placeholder={ar ? "اختر اتصالاً" : "Select Connection"} />
            </Field>
            <Field label={ar ? "معرف المورد" : "Resource ID"} required>
              <ZohoInput value={String(operation.resourceId ?? "")} onChange={(e) => set({ resourceId: e.target.value })} />
            </Field>
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-[#eee] px-4 py-3">
        <button type="button" className="rounded border border-[#ccc] bg-white px-4 py-1.5 text-[12px] text-[#444] hover:bg-[#f5f5f5]" onClick={onClose}>{ar ? "إلغاء" : "Cancel"}</button>
        <button type="button" className="rounded bg-[#3b4a5a] px-4 py-1.5 text-[12px] font-medium text-white hover:bg-[#2f3c4a]" onClick={onClose}>{ar ? "إدراج" : "Insert"}</button>
      </div>
    </div>
  );
}

function FunctionBuilder({ draft, setDraft, ar, connections, onSave, onSaveAndTest, onCancel, busy }: {
  draft: Draft;
  setDraft: (d: Draft | ((prev: Draft) => Draft)) => void;
  ar: boolean;
  connections: Connection[];
  onSave: () => void;
  onSaveAndTest: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const definition = draft.definition;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(definition.operations.length ? 0 : null);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);
  const [dragOp, setDragOp] = useState<string | null>(null);
  const dragOpRef = useRef<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const updateDef = (patch: Partial<FunctionDefinition>) => {
    setDraft((prev) => ({ ...prev, definition: { ...prev.definition, ...patch } }));
  };

  const addOperation = (op: string) => {
    const next = [...definition.operations, emptyOperation(op)];
    updateDef({ operations: next });
    setSelectedIndex(next.length - 1);
    setConfigOpen(true);
    setPaletteOpen(false);
  };

  const beginDrag = (op: string, e: DragEvent) => {
    dragOpRef.current = op;
    setDragOp(op);
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", op);
  };

  const onDropCanvas = (e: DragEvent) => {
    e.preventDefault();
    const op = e.dataTransfer.getData("text/plain") || dragOpRef.current || dragOp;
    if (op) addOperation(op);
    dragOpRef.current = null;
    setDragOp(null);
  };

  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const next = [...definition.operations];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    updateDef({ operations: next });
    setSelectedIndex(to);
  };

  const script = useMemo(() => buildScript(definition.operations), [definition.operations]);
  const selected = selectedIndex != null ? definition.operations[selectedIndex] : null;

  const selectedMeta = useMemo(() => {
    if (!selected) return { title: "", description: "" };
    for (const g of ZOHO_PALETTE) {
      for (const it of g.items) {
        if (it.op === selected.op) return { title: ar ? it.ar : it.en, description: it.desc };
      }
    }
    return { title: selected.op, description: "" };
  }, [selected, ar]);

  const scriptLines = script.text.split("\n");

  return (
    <div className="fixed inset-0 z-[260] flex flex-col bg-white" dir={ar ? "rtl" : "ltr"}>
      {/* Top bar — Zoho style */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#e6e6e6] bg-white px-3">
        <div className="flex items-center gap-2 text-[#666]">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-[#f0f0f0] text-[12px] font-bold text-[#556]">fx</span>
        </div>
        <input
          className="min-w-0 flex-1 border-0 bg-transparent text-[14px] font-medium text-[#333] outline-none"
          value={draft.name}
          onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value, key: functionKeyFromName(e.target.value) || p.key }))}
          placeholder={ar ? "اسم الدالة" : "Function name"}
        />
        <div className="flex items-center gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="rounded border border-[#d0d0d0] bg-white px-3 py-1.5 text-[12px] text-[#555] hover:bg-[#f7f7f7]">{ar ? "إلغاء" : "Cancel"}</button>
          <button type="button" disabled={busy || script.errors.size > 0} onClick={onSaveAndTest} className="rounded border border-[#d0d0d0] bg-white px-3 py-1.5 text-[12px] text-[#555] hover:bg-[#f7f7f7] disabled:opacity-50">{ar ? "حفظ وتجربة" : "Save and test"}</button>
          <button type="button" disabled={busy || script.errors.size > 0} onClick={onSave} className="rounded bg-[#2f6fed] px-4 py-1.5 text-[12px] font-medium text-white hover:bg-[#2558c7] disabled:opacity-50">{ar ? "حفظ" : "Save"}</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left rail icons */}
        <div className="flex w-11 shrink-0 flex-col items-center gap-2 border-e border-[#e8e8e8] bg-[#fafafa] py-3">
          <button type="button" title={ar ? "الكتل" : "Blocks"} onClick={() => { setPaletteOpen(true); setConfigOpen(false); }} className={`flex h-8 w-8 items-center justify-center rounded ${paletteOpen && !configOpen ? "bg-[#e8eefc] text-[#2f6fed]" : "text-[#777] hover:bg-[#eee]"}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6"/></svg>
          </button>
          <button type="button" title={ar ? "السكربت" : "Script"} onClick={() => { setPaletteOpen(false); setConfigOpen(false); }} className={`flex h-8 w-8 items-center justify-center rounded ${!paletteOpen && !configOpen ? "bg-[#e8eefc] text-[#2f6fed]" : "text-[#777] hover:bg-[#eee]"}`}>
            <span className="font-mono text-[11px] font-bold">{"</>"}</span>
          </button>
        </div>

        {/* Palette OR Config drawer */}
        {(paletteOpen || (configOpen && selected)) && (
          <div className="flex w-[min(360px,40vw)] shrink-0 flex-col bg-white">
            {configOpen && selected && selectedIndex != null ? (
              <OperationConfigForm
                operation={selected}
                ar={ar}
                connections={connections}
                title={selectedMeta.title}
                description={selectedMeta.description}
                onClose={() => setConfigOpen(false)}
                onChange={(next) => {
                  const ops = [...definition.operations];
                  ops[selectedIndex] = next;
                  updateDef({ operations: ops });
                }}
              />
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                {ZOHO_PALETTE.map((group) => (
                  <div key={group.id} className="mb-3">
                    <div className="px-2 py-1 text-[10px] font-bold tracking-wide text-[#888]">{ar ? group.arLabel : group.label}</div>
                    <div className="flex flex-col gap-0.5">
                      {group.items.map((item, idx) => (
                        <button
                          key={`${group.id}-${item.en}-${idx}`}
                          type="button"
                          draggable
                          onDragStart={(e) => beginDrag(item.op, e)}
                          onDragEnd={() => { window.setTimeout(() => { dragOpRef.current = null; setDragOp(null); }, 200); }}
                          onClick={() => addOperation(item.op)}
                          className="rounded px-3 py-2 text-start text-[12px] text-[#333] hover:bg-[#f0f4fa]"
                        >
                          {ar ? item.ar : item.en}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Script editor — Zoho style */}
        <main
          className="relative min-h-0 min-w-0 flex-1 bg-white"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropCanvas}
        >
          <div className="flex h-full min-h-0 font-mono text-[13px] leading-6">
            {/* gutter: errors + line numbers */}
            <div className="w-14 shrink-0 select-none border-e border-[#f0f0f0] bg-[#fafafa] py-4 text-end">
              {scriptLines.map((_, i) => {
                const n = i + 1;
                const err = script.errors.get(n);
                return (
                  <div key={n} className="flex h-6 items-center justify-end gap-1 px-1">
                    {err ? (
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white" title={err}>×</span>
                    ) : (
                      <span className="w-4" />
                    )}
                    <span className="w-6 text-[11px] text-[#aaa]">{n}</span>
                  </div>
                );
              })}
            </div>
            <div className="min-h-0 flex-1 overflow-auto py-4 pe-4 ps-3">
              {scriptLines.map((line, i) => {
                const n = i + 1;
                const err = script.errors.get(n);
                // highlight selected operation lines
                let opIndex = -1;
                let cursor = 2; // after header
                for (let oi = 0; oi < definition.operations.length; oi++) {
                  const { lines } = operationToScriptLines(definition.operations[oi], oi);
                  if (n > cursor && n <= cursor + lines.length) {
                    opIndex = oi;
                    break;
                  }
                  cursor += lines.length;
                }
                const isSelected = opIndex === selectedIndex;
                return (
                  <div
                    key={n}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (opIndex >= 0) {
                        setSelectedIndex(opIndex);
                        setConfigOpen(true);
                        setPaletteOpen(false);
                      }
                    }}
                    className={`h-6 whitespace-pre ${err ? "bg-red-50" : isSelected ? "bg-[#fff8e6]" : "hover:bg-[#f7f9fc]"} ${err ? "text-red-700" : "text-[#222]"}`}
                    title={err}
                  >
                    {line || " "}
                  </div>
                );
              })}
              {definition.operations.length === 0 && (
                <div className="mt-8 rounded-lg border border-dashed border-[#c5d4ef] bg-[#f7faff] p-6 text-center text-[12px] text-[#5a7ab0]">
                  {ar
                    ? "اسحب كتلة من اللوحة اليسرى وأفلتها هنا، أو انقر على كتلة لفتح نموذج الإدخال."
                    : "Drag a block from the left panel and drop it here, or click a block to open its data-entry form."}
                </div>
              )}
            </div>
          </div>

          {/* Bottom strip: operation chips for reorder */}
          {definition.operations.length > 0 && (
            <div className="absolute bottom-0 inset-x-0 flex flex-wrap gap-1 border-t border-[#eee] bg-[#fafafa] px-3 py-2">
              {definition.operations.map((op, index) => (
                <div
                  key={index}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); if (dragIndex != null) reorder(dragIndex, index); setDragIndex(null); }}
                  onClick={() => { setSelectedIndex(index); setConfigOpen(true); setPaletteOpen(false); }}
                  className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-[10px] ${selectedIndex === index ? "border-[#2f6fed] bg-[#e8eefc] text-[#2f6fed]" : "border-[#ddd] bg-white text-[#555]"}`}
                >
                  {index + 1}. {op.op}
                  <button
                    type="button"
                    className="ms-1 text-[#999] hover:text-red-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = definition.operations.filter((_, i) => i !== index);
                      updateDef({ operations: next });
                      setSelectedIndex(next.length ? Math.min(index, next.length - 1) : null);
                    }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function WorkflowFunctionsPage({ standalone = false }: { standalone?: boolean }) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [rows, setRows] = useState<WorkflowFunction[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(STARTER);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [versions, setVersions] = useState<WorkflowFunctionVersion[]>([]);
  const [selected, setSelected] = useState<WorkflowFunction | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);
  const [editName, setEditName] = useState("");
  const [editingFunctionId, setEditingFunctionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [testInputText, setTestInputText] = useState(JSON.stringify({ file: { id: "test-file", name: "contract.pdf", extension: ".pdf", fileType: "PDF", mimeType: "application/pdf" }, fields: { status: "Pending", amount: 2500 } }, null, 2));
  const [testInputError, setTestInputError] = useState("");

  useEffect(() => { void listConnections({ status: "ACTIVE" }).then(setConnections).catch(() => undefined); }, []);
  const load = () => void listWorkflowFunctions().then(r => setRows(r.custom || [])).catch(e => setError(e instanceof Error ? e.message : "Unable to load functions"));
  useEffect(load, []);

  const create = async (testAfterSave = false) => {
    setBusy(true); setError("");
    try {
      const testInput = testAfterSave ? JSON.parse(testInputText) as Record<string, unknown> : null;
      if (testAfterSave && (!testInput || typeof testInput !== "object" || Array.isArray(testInput))) throw new Error("Test input must be a JSON object");
      if (editingFunctionId) {
        const created = await createWorkflowFunctionVersion(editingFunctionId, { definition: draft.definition });
        if (testAfterSave && testInput) setResult(await testWorkflowFunction(editingFunctionId, testInput, created.id));
        setOpen(false); setEditingFunctionId(null); load();
        const target = rows.find((f) => f.id === editingFunctionId);
        if (target) await showVersions(target);
        else setSelected(null);
        setVersions((prev) => [created, ...prev]);
      } else {
        const key = draft.key.trim() || functionKeyFromName(draft.name) || `fn_${Date.now().toString(36)}`;
        const created = await createWorkflowFunction({ ...draft, key });
        if (testAfterSave && testInput) setResult(await testWorkflowFunction(created.id, testInput));
        setOpen(false); load();
        await showVersions(created);
      }
    } catch (e) { setError(e instanceof Error ? e.message : (ar ? "تعذر حفظ الدالة" : "Unable to save function")); }
    finally { setBusy(false); }
  };
  const showVersions = async (f: WorkflowFunction) => {
    setSelected(f); setEditName(f.name);
    try {
      const [vs, ex] = await Promise.all([listWorkflowFunctionVersions(f.id), listWorkflowFunctionExecutions(f.id)]);
      setVersions(vs); setExecutions(ex);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load versions"); }
  };
  const saveMeta = async () => {
    if (!selected) return;
    setBusy(true); try { const next = await updateWorkflowFunction(selected.id, { name: editName }); setSelected(next); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to update"); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!selected) return;
    setBusy(true); try { await deleteWorkflowFunction(selected.id); setSelected(null); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to delete; the function may be referenced by a workflow"); } finally { setBusy(false); }
  };
  const newDraftFromVersion = (v: WorkflowFunctionVersion) => {
    if (!selected) return;
    setEditingFunctionId(selected.id);
    setDraft({ ...STARTER, name: selected.name, key: selected.key, description: selected.description ?? "", definition: cloneDefinition(v.definition) });
    setSelected(null);
    setOpen(true);
  };
  const publish = async (v: WorkflowFunctionVersion) => {
    if (!selected) return;
    setBusy(true); try { await publishWorkflowFunctionVersion(selected.id, v.id); await showVersions(selected); load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to publish"); } finally { setBusy(false); }
  };
  const test = async (f: WorkflowFunction, versionId?: string) => {
    setBusy(true); setError(""); setTestInputError("");
    try {
      const input = JSON.parse(testInputText);
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Test input must be a JSON object");
      setResult(await testWorkflowFunction(f.id, input as Record<string, unknown>, versionId));
      try { setExecutions(await listWorkflowFunctionExecutions(f.id)); } catch { /* the result is already visible */ }
    } catch (e) {
      if (e instanceof SyntaxError) setTestInputError(ar ? "صيغة JSON غير صحيحة. راجع الأقواس والفواصل." : "Invalid JSON. Check braces and commas.");
      else setError(e instanceof Error ? e.message : "Function test failed");
    } finally { setBusy(false); }
  };
  const filteredRows = rows.filter(f => `${f.name} ${f.key} ${f.description ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  const frame = (<>
    <main className="h-full min-h-0 overflow-y-auto bg-white p-2 sm:p-3" dir={ar ? "rtl" : "ltr"}>
      <div className="flex min-h-full w-full flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <WorkflowHelp compact helpKey="workflow.functions" title={ar ? "ما هي الدوال المخصصة؟" : "What are Custom Functions?"} description={ar ? "منطق قابل لإعادة الاستخدام يُبنى بصرياً، ثم يُربط بمدخلات ومخرجات داخل Workflow." : "Reusable logic built visually, then connected to workflow inputs and outputs."} />
            <span className="text-[10px] text-slate-500">{rows.length} {ar ? "دوال" : "functions"}</span>
          </div>
          <button className="wd-pill wd-pill-new" onClick={() => { setEditingFunctionId(null); setDraft({ ...STARTER, name: "", key: "", description: "", definition: { inputs: [], operations: [], outputs: [] } }); setOpen(true); }}>＋ {ar ? "دالة جديدة" : "New function"}</button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="min-w-[220px] flex-1"><label className="mb-1 block text-[9px] font-semibold text-slate-500">{ar ? "البحث عن دالة" : "Search functions"}</label><input className="wf-input" value={search} onChange={e => setSearch(e.target.value)} placeholder={ar ? "ابحث بالاسم أو المفتاح أو الوصف…" : "Search by name, key, or description…"} /></div>
          <div className="text-[9px] text-slate-500">{ar ? `${filteredRows.length} من ${rows.length}` : `${filteredRows.length} of ${rows.length}`}</div>
        </div>
        <div className="mt-4 grid min-h-[520px] gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-slate-200 bg-[#fafbfc] p-3">
            <div className="mb-3 text-[10px] font-semibold text-slate-500">{ar ? "مساحات الأسماء" : "NAMESPACES"}</div>
            <button className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-[11px] font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200">
              <span>{ar ? "كل الدوال" : "All Functions"}</span><span className="text-[9px] text-slate-500">{rows.length}</span>
            </button>
            <div className="mt-5 border-t border-slate-200 pt-3">
              <div className="mb-2 text-[9px] font-semibold text-slate-400">{ar ? "إدارة" : "MANAGE"}</div>
              <div className="rounded-lg px-3 py-2 text-[10px] text-slate-600">{ar ? "الدوال المنشورة والمسودات" : "Published & drafts"}</div>
              <div className="rounded-lg px-3 py-2 text-[10px] text-slate-600">{ar ? "سجل التنفيذ" : "Execution history"}</div>
            </div>
            <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-3 text-[9px] leading-4 text-slate-500">
              {ar ? "تُجمع الدوال ذات الصلة ضمن مساحة اسم واحدة لتسهيل تنظيمها وإعادة استخدامها." : "Group related functions in a namespace to organize and reuse them."}
            </div>
          </aside>
          <section className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-[15px] font-semibold text-slate-900">{ar ? "كل الدوال" : "All Functions"}</h2><p className="mt-1 text-[10px] text-slate-500">{ar ? "إدارة الدوال القابلة لإعادة الاستخدام في سير العمل." : "Manage reusable functions across your workflows."}</p></div>
              <div className="flex items-center gap-2"><span className="text-[9px] text-slate-500">{filteredRows.length} {ar ? "نتيجة" : "results"}</span><button className="wd-pill wd-pill-new" onClick={() => { setEditingFunctionId(null); setDraft({ ...STARTER, name: "", key: "", description: "", definition: { inputs: [], operations: [], outputs: [] } }); setOpen(true); }}>＋ {ar ? "إنشاء دالة" : "Create Function"}</button></div>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input className="wf-input min-w-[220px] flex-1" value={search} onChange={e => setSearch(e.target.value)} placeholder={ar ? "ابحث بالاسم أو مساحة الاسم أو نوع الإرجاع..." : "Search by function name, namespace, or return type..."} />
              <button className="wd-pill wd-pill-record" onClick={() => setSearch("")}>{ar ? "مسح" : "Clear"}</button>
            </div>
            {filteredRows.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center"><h3 className="text-[13px] font-semibold">{rows.length === 0 ? (ar ? "لا توجد دوال بعد" : "No functions yet") : (ar ? "لا توجد نتائج" : "No results")}</h3><p className="mt-2 text-[10px] text-slate-500">{ar ? "أنشئ دالتك الأولى لتعريف المدخلات ومنطق التنفيذ والمخرجات." : "Create your first function to define inputs, logic, and outputs."}</p><button className="mt-4 wd-pill wd-pill-new" onClick={() => { setEditingFunctionId(null); setDraft({ ...STARTER, name: "", key: "", description: "", definition: { inputs: [], operations: [], outputs: [] } }); setOpen(true); }}>＋ {ar ? "دالة جديدة" : "New Function"}</button></div>
            : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="grid grid-cols-[minmax(180px,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_auto] gap-3 border-b border-slate-200 bg-[#f8f9fb] px-4 py-3 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                <span>{ar ? "اسم الدالة" : "Function Name"}</span><span>{ar ? "نوع الإرجاع" : "Return Type"}</span><span>{ar ? "الإصدار" : "Version"}</span><span>{ar ? "الإجراءات" : "Actions"}</span>
              </div>
              {filteredRows.map(f => <article key={f.id} className="group grid grid-cols-[minmax(180px,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-[#f7fbff]">
                <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-base text-indigo-600">ƒ</span><div className="min-w-0"><button className="block max-w-full truncate text-left text-[11px] font-semibold text-slate-800 hover:text-indigo-700" onClick={() => void showVersions(f)}>{f.name}</button><div className="truncate text-[9px] text-slate-500">{f.description || f.key}</div><div className="mt-0.5 text-[8px] text-slate-400">{f.key}</div></div></div>
                <span className="text-[10px] text-slate-600">{f.kind || "Custom"}</span><span className="text-[10px] text-slate-600">v{f.activeVersion?.version ?? 1} <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] text-emerald-700">{f.activeVersion ? (ar ? "نشطة" : "Active") : (ar ? "مسودة" : "Draft")}</span></span>
                <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-70 sm:group-hover:opacity-100"><button title={ar ? "اختبار" : "Test"} className="wd-icon-btn" onClick={() => void test(f)}>▶</button><button title={ar ? "الإصدارات" : "Versions"} className="wd-icon-btn" onClick={() => void showVersions(f)}>◷</button></div>
              </article>)}
            </div>}
          </section>
        </div>
        {error && <div className="mt-4 rounded-xl bg-red-50 p-3 text-[10px] text-red-700">{error}</div>}
        <section className="wd-card mt-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-[11px] font-semibold">{ar ? "بيانات الاختبار" : "Test input"}</div><p className="mt-1 text-[9px] text-slate-500">{ar ? "عدّل JSON لتجربة سيناريو خاص بك. هذه بيانات اختبار فقط ولا تغيّر ملفاتك." : "Edit this JSON to test your own scenario. Test data only; it does not change your files."}</p></div><button className="wd-pill wd-pill-record" onClick={() => setTestInputText(JSON.stringify({ file: { id: "test-file", name: "contract.pdf", extension: ".pdf", fileType: "PDF", mimeType: "application/pdf" }, fields: { status: "Pending", amount: 2500 } }, null, 2))}>{ar ? "استعادة المثال" : "Reset example"}</button></div>
          <textarea className="wf-input mt-3 min-h-36 font-mono text-[10px]" value={testInputText} onChange={e => setTestInputText(e.target.value)} spellCheck={false} />
          {testInputError && <p className="mt-2 text-[10px] text-red-600">{testInputError}</p>}
        </section>
        {result && <div className="wd-card mt-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-[10px] font-semibold">{ar ? "نتيجة الاختبار" : "Test result"}</div><span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700">{ar ? "اكتمل التنفيذ" : "Execution completed"}</span></div>
          {Array.isArray((result as Record<string, unknown>)?.trace) && <section className="mt-3"><div className="mb-2 text-[9px] font-semibold text-slate-600">{ar ? "تتبّع خطوات التنفيذ" : "Execution trace"}</div><div className="space-y-2">{((result as Record<string, unknown>).trace as Array<Record<string, unknown>>).map((step, index) => <div key={`${String(step.step)}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-lg bg-white text-[9px] font-semibold">{String(step.step ?? index + 1)}</span><div><div className="text-[9px] font-semibold">{String(step.operation ?? "Operation")}</div><div className="text-[8px] text-slate-500">{ar ? "الحقول المتغيرة" : "Changed fields"}: {Array.isArray(step.changedFields) ? step.changedFields.map(String).join(", ") || "—" : "—"}</div></div></div><div className="flex items-center gap-2"><span className="text-[8px] text-slate-500">{String(step.durationMs ?? 0)} ms</span><span className="rounded-full bg-emerald-100 px-2 py-1 text-[8px] font-semibold text-emerald-700">{String(step.status ?? "SUCCESS")}</span></div></div>)}</div></section>}
          <div className="mt-3 text-[9px] font-semibold text-slate-600">{ar ? "المخرجات" : "Output"}</div><pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-slate-50 p-3 text-[9px] whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre></div>}
      </div>
    </main>

    {open && <FunctionBuilder draft={draft} setDraft={setDraft} ar={ar} connections={connections} busy={busy} onCancel={() => { setOpen(false); setEditingFunctionId(null); }} onSave={() => void create(false)} onSaveAndTest={() => void create(true)} />}

    {selected && <div className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <div className="wf-modal w-[min(900px,96vw)] max-h-[90vh] overflow-y-auto p-5" dir={ar ? "rtl" : "ltr"}>
        <div className="flex items-center justify-between"><div><h2 className="text-[16px] font-semibold">{selected.name}</h2><p className="text-[10px] text-slate-500">{ar ? "الإصدارات وسجل التنفيذ" : "Versions and execution history"}</p></div><button className="wd-icon-btn" onClick={() => setSelected(null)}>×</button></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><input className="wf-input" value={editName} onChange={e => setEditName(e.target.value)} /><button className="wd-pill wd-pill-record" disabled={busy} onClick={() => void saveMeta()}>{ar ? "حفظ" : "Save"}</button><button className="wd-pill wd-pill-record" disabled={busy} onClick={() => void remove()}>{ar ? "حذف" : "Delete"}</button></div>
        <div className="mt-4 space-y-2">{versions.map(v =>
          <div key={v.id} className="wd-card p-3">
            <div className="flex items-center justify-between gap-2"><div><b className="text-[11px]">v{v.version}</b><div className="text-[8px] uppercase tracking-wider text-slate-400">{v.status}</div></div>
              <div className="flex flex-wrap gap-1"><button disabled={busy} className="wd-pill wd-pill-record" onClick={() => void test(selected, v.id)}>{ar ? "اختبار" : "Test"}</button><button disabled={busy || v.status === "ACTIVE"} className="wd-pill wd-pill-new" onClick={() => void publish(v)}>{v.status === "ACTIVE" ? (ar ? "نشطة" : "Active") : (ar ? "نشر" : "Publish")}</button><button disabled={busy} className="wd-pill wd-pill-record" onClick={() => void newDraftFromVersion(v)}>{ar ? "تعديل كمسودة" : "Edit as draft"}</button></div>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3 text-[8.5px] text-slate-500">
              <span>{ar ? "المدخلات" : "Inputs"}: {cloneDefinition(v.definition).inputs.length}</span><span>{ar ? "العمليات" : "Operations"}: {cloneDefinition(v.definition).operations.length}</span><span>{ar ? "المخرجات" : "Outputs"}: {cloneDefinition(v.definition).outputs.length}</span>
            </div>
          </div>
        )}</div>
        <div className="mt-5"><div className="text-[10px] font-semibold">{ar ? "آخر عمليات التنفيذ" : "Recent executions"}</div><div className="mt-2 max-h-40 space-y-1 overflow-auto">{executions.length === 0 ? <p className="text-[10px] text-slate-400">{ar ? "لا توجد عمليات تنفيذ بعد." : "No executions yet."}</p> : executions.map(x => <div key={x.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-[9px]"><span>{x.status} · v{x.versionId.slice(0, 6)}</span><span>{x.durationMs ?? "-"} ms</span></div>)}</div></div>
        {result ? <pre className="mt-4 max-h-48 overflow-auto rounded-xl bg-slate-50 p-3 text-[10px] whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre> : null}
      </div>
    </div>}
  </>);
  if (standalone) return frame;
  return <WorkflowShell active="functions" title={ar ? "الدوال المخصصة" : "Custom Functions"} subtitle={ar ? "مصمم بصري بإصدارات ثابتة ومدخلات ومخرجات قابلة للربط داخل Workflow." : "Visual, versioned functions with reusable inputs and outputs for workflows."}>{frame}</WorkflowShell>;
}
