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

const OP_GROUPS = [
  {
    label: "Data",
    arLabel: "البيانات",
    items: [
      ["SET_FIELD", "Set field", "تعيين حقل", "Set a workflow value."],
      ["COPY_VALUE", "Copy value", "نسخ قيمة", "Copy a dynamic value into a field."],
      ["CONCAT", "Join text", "دمج نص", "Join two values."],
      ["LOWERCASE", "Lowercase", "أحرف صغيرة", "Convert text to lowercase."],
      ["UPPERCASE", "Uppercase", "أحرف كبيرة", "Convert text to uppercase."],
      ["NUMBER", "To number", "تحويل إلى رقم", "Convert a value to a number."],
    ],
  },
  {
    label: "Math",
    arLabel: "الحساب",
    items: [
      ["ADD", "Add", "جمع", "Add two values."],
      ["SUBTRACT", "Subtract", "طرح", "Subtract the second value."],
      ["MULTIPLY", "Multiply", "ضرب", "Multiply two values."],
      ["DIVIDE", "Divide", "قسمة", "Divide the first value by the second."],
    ],
  },
  {
    label: "Logic",
    arLabel: "المنطق",
    items: [["IF", "If / Else", "شرط If / Else", "Set a value based on a condition."]],
  },
  {
    label: "Integration",
    arLabel: "التكامل",
    items: [
      ["HTTP_REQUEST", "Invoke API", "استدعاء API", "Call an external service through a Connection."],
      ["CONNECTION_READ", "Read from Connection", "قراءة من اتصال", "Read a resource through a Connection."],
    ],
  },
  {
    label: "Actions",
    arLabel: "الإجراءات",
    items: [
      ["NOTIFY_OWNER", "Notify owner", "إشعار المالك", "Send a system notification."],
      ["ADD_TAG", "Add tag", "إضافة وسم", "Add a tag to the workflow result."],
    ],
  },
] as const;

const OPERATION_ITEMS: Array<readonly [string, string, string, string]> = OP_GROUPS.reduce<Array<readonly [string, string, string, string]>>(
  (acc, group) => { group.items.forEach((item) => acc.push(item as readonly [string, string, string, string])); return acc; }, []
);

const STARTER: Draft = {
  name: "Normalize file status",
  key: "normalize_file_status",
  description: "Normalize file metadata and return a reusable status value.",
  definition: {
    inputs: [
      { key: "status", label: "Current status", type: "text", required: false, description: "Optional workflow status." },
    ],
    operations: [{ op: "LOWERCASE", left: "{{status}}", field: "normalized_status" }],
    outputs: [
      { key: "normalized_status", label: "Normalized status", type: "text", description: "Lowercase status." },
    ],
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
  const operations: Operation[] = Array.isArray(d.operations) ? d.operations.map((x) => ({ ...(x as Record<string, unknown>), op: String((x as Record<string, unknown>)?.op ?? "SET_FIELD") })) : [];
  return { inputs: ports(d.inputs), operations, outputs: ports(d.outputs) };
}
function emptyOperation(op: string): Operation {
  switch (op) {
    case "SET_FIELD": return { op, field: "result", value: "{{file.name}}" };
    case "COPY_VALUE": return { op, field: "result", left: "{{file.name}}" };
    case "CONCAT": return { op, field: "result", left: "{{file.name}}", right: "{{file.extension}}", separator: " " };
    case "LOWERCASE": case "UPPERCASE": case "NUMBER": return { op, field: "result", left: "{{file.name}}" };
    case "ADD": case "SUBTRACT": case "MULTIPLY": case "DIVIDE": return { op, field: "result", left: "0", right: "0" };
    case "IF": return { op, condition: "{{workflow.status}}", then: { op: "SET_FIELD", field: "result", value: "yes" }, else: { op: "SET_FIELD", field: "result", value: "no" } };
    case "HTTP_REQUEST": return { op, connectionId: "", method: "GET", path: "/", responseMode: "JSON", outputField: "http_response", headers: {}, body: "" };
    case "CONNECTION_READ": return { op, connectionId: "", resourceId: "{{file.id}}", outputField: "connection_resource" };
    case "NOTIFY_OWNER": return { op, title: "Workflow update", body: "{{file.name}} was processed." };
    case "ADD_TAG": return { op, tag: "processed" };
    default: return { op };
  }
}

function PortEditor({ port, ar, onChange, onRemove }: { port: Port; ar: boolean; onChange: (p: Port) => void; onRemove: () => void }) {
  return (
    <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_120px_auto]">
      <input className="wf-input" value={port.key} onChange={(e) => onChange({ ...port, key: e.target.value })} placeholder={ar ? "المفتاح" : "key"} />
      <input className="wf-input" value={port.label} onChange={(e) => onChange({ ...port, label: e.target.value })} placeholder={ar ? "الاسم الظاهر" : "Display name"} />
      <ImkanOptionPicker value={port.type} onChange={(v) => onChange({ ...port, type: v || "text" })} options={toImkanPickerOptions(["text", "number", "boolean", "date", "datetime", "object"])} ariaLabel={ar ? "نوع البيانات" : "Data type"} fullWidth />
      <button type="button" className="wd-icon-btn" onClick={onRemove} aria-label={ar ? "حذف" : "Remove"}>×</button>
      <input className="wf-input sm:col-span-3" value={port.description ?? ""} onChange={(e) => onChange({ ...port, description: e.target.value })} placeholder={ar ? "وصف اختياري" : "Optional description"} />
      {port.required !== undefined && (
        <label className="flex items-center gap-2 text-[9px] text-slate-600">
          <input type="checkbox" checked={port.required === true} onChange={(e) => onChange({ ...port, required: e.target.checked })} />
          {ar ? "إلزامي" : "Required"}
        </label>
      )}
    </div>
  );
}

function OperationEditor({
  operation, index, ar, connections, onChange, onRemove, onDragStart, onDrop,
}: {
  operation: Operation; index: number; ar: boolean; connections: Connection[];
  onChange: (next: Operation) => void; onRemove: () => void; onDragStart: () => void; onDrop: (event: DragEvent<HTMLDivElement>) => void;
}) {
  const op = operation.op;
  const set = (key: string, value: unknown) => onChange({ ...operation, [key]: value });
  const dynamicInput = (key: string, placeholder: string) => (
    <input className="wf-input" value={String(operation[key] ?? "")} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} />
  );
  const fieldInput = (label: string, key: string, placeholder = "result") => (
    <label className="workflow-action-field">
      <span>{label}</span>{dynamicInput(key, placeholder)}
    </label>
  );
  return (
    <div draggable onDragStart={onDragStart} onDragOver={(e) => e.preventDefault()} onDrop={onDrop} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
        <span className="cursor-grab text-slate-400" title={ar ? "اسحب لإعادة الترتيب" : "Drag to reorder"}>⠿</span>
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-50 text-[11px] font-bold text-violet-700">{index + 1}</span>
        <ImkanOptionPicker value={op} onChange={(v) => v && onChange(emptyOperation(v))} options={OP_GROUPS.flatMap(g => g.items.map(x => ({ value: x[0], label: `${ar ? g.arLabel : g.label} · ${ar ? x[2] : x[1]}` })))} ariaLabel={ar ? "نوع العملية" : "Operation type"} className="min-w-[190px]" />
        <span className="ml-auto text-[8px] uppercase tracking-wider text-slate-400">SAFE</span>
        <button type="button" className="wd-icon-btn" onClick={onRemove}>×</button>
      </div>
      <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[9px] leading-4 text-slate-600">{OPERATION_ITEMS.find((x) => x[0] === op)?.[3] ?? (ar ? "اضبط حقول العملية ثم استخدم الناتج في المخرجات." : "Configure this step, then expose its result through Outputs.")}</div>
      <div className="grid gap-3 p-3 sm:grid-cols-2">
        {(op === "SET_FIELD" || op === "COPY_VALUE" || ["CONCAT","LOWERCASE","UPPERCASE","NUMBER","ADD","SUBTRACT","MULTIPLY","DIVIDE"].includes(op)) && fieldInput(ar ? "الحقل الناتج" : "Output field", "field")}
        {["COPY_VALUE","CONCAT","LOWERCASE","UPPERCASE","NUMBER","ADD","SUBTRACT","MULTIPLY","DIVIDE"].includes(op) && <label className="workflow-action-field"><span>{ar ? "القيمة الأولى" : "Left value"}</span>{dynamicInput("left", "{{file.name}} or {{workflow.field}}")}</label>}
        {op === "SET_FIELD" && <label className="workflow-action-field"><span>{ar ? "القيمة" : "Value"}</span>{dynamicInput("value", "{{file.name}}")}</label>}
        {["CONCAT","ADD","SUBTRACT","MULTIPLY","DIVIDE"].includes(op) && <label className="workflow-action-field"><span>{ar ? "القيمة الثانية" : "Right value"}</span>{dynamicInput("right", "{{workflow.amount}}")}</label>}
        {op === "CONCAT" && <label className="workflow-action-field"><span>{ar ? "الفاصل" : "Separator"}</span>{dynamicInput("separator", " ")}</label>}
        {op === "IF" && <>
          <div className="sm:col-span-2 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-[9px] leading-4 text-indigo-900">
            {ar ? "الشرط يُقيّم كقيمة صحيحة/خاطئة. كل فرع يعيّن حقلاً واحداً فقط؛ استخدم {{inputKey}} أو {{fields.fieldName}} للوصول إلى البيانات." : "The condition is evaluated as true/false. Each branch sets one field. Use {{inputKey}} or {{fields.fieldName}} to read data."}
          </div>
          <label className="workflow-action-field sm:col-span-2"><span>{ar ? "القيمة التي يتم اختبارها" : "Condition value"}</span>{dynamicInput("condition", "{{fields.approved}}")}</label>
          {(["then", "else"] as const).map((branch) => {
            const raw = operation[branch] && typeof operation[branch] === "object" ? operation[branch] as Record<string, unknown> : {};
            const updateBranch = (key: "field" | "value", value: string) => set(branch, { op: "SET_FIELD", field: String(raw.field ?? "result"), value: raw.value ?? "", [key]: value });
            return <div key={branch} className={`rounded-xl border p-3 ${branch === "then" ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"}`}>
              <div className={`mb-2 text-[10px] font-semibold ${branch === "then" ? "text-emerald-800" : "text-amber-800"}`}>{branch === "then" ? (ar ? "إذا تحقق الشرط (Then)" : "If true (Then)") : (ar ? "إذا لم يتحقق (Else)" : "If false (Else)")}</div>
              <label className="workflow-action-field"><span>{ar ? "اكتب النتيجة في الحقل" : "Write result to field"}</span><input className="wf-input" value={String(raw.field ?? "result")} onChange={(e) => updateBranch("field", e.target.value)} /></label>
              <label className="workflow-action-field mt-2"><span>{ar ? "القيمة التي سيتم تعيينها" : "Value to set"}</span><input className="wf-input" value={String(raw.value ?? "")} onChange={(e) => updateBranch("value", e.target.value)} placeholder={ar ? "مثال: approved" : "Example: approved"} /></label>
            </div>;
          })}
        </>}
        {op === "HTTP_REQUEST" && <>
          <label className="workflow-action-field sm:col-span-2"><span>{ar ? "Connection" : "Connection"}</span><ImkanOptionPicker value={String(operation.connectionId ?? "")} onChange={(v) => set("connectionId", v)} options={connections.map(c => ({ value: c.id, label: c.name }))} ariaLabel={ar ? "الاتصال" : "Connection"} fullWidth allowEmpty emptyLabel={ar ? "اختر اتصالاً" : "Select connection"} placeholder={ar ? "اختر اتصالاً" : "Select connection"} /></label>
          {fieldInput(ar ? "المسار" : "Path", "path", "/v1/resource")}
          <label className="workflow-action-field"><span>{ar ? "الطريقة" : "Method"}</span><ImkanOptionPicker value={String(operation.method ?? "GET")} onChange={(v) => set("method", v)} options={toImkanPickerOptions(["GET","POST","PUT","PATCH","DELETE","HEAD"])} ariaLabel={ar ? "الطريقة" : "Method"} fullWidth /></label>
          {fieldInput(ar ? "حقل الإخراج" : "Output field", "outputField", "http_response")}
          <label className="workflow-action-field sm:col-span-2"><span>{ar ? "Headers JSON" : "Headers JSON"}</span>{dynamicInput("headers", '{"Content-Type":"application/json"}')}</label>
          <label className="workflow-action-field sm:col-span-2"><span>{ar ? "Body JSON" : "Body JSON"}</span><textarea className="wf-input min-h-20" value={String(operation.body ?? "")} onChange={(e) => set("body", e.target.value)} placeholder='{"fileId":"{{file.id}}"}' /></label>
        </>}
        {op === "CONNECTION_READ" && <>
          <label className="workflow-action-field sm:col-span-2"><span>{ar ? "Connection" : "Connection"}</span><ImkanOptionPicker value={String(operation.connectionId ?? "")} onChange={(v) => set("connectionId", v)} options={connections.map(c => ({ value: c.id, label: c.name }))} ariaLabel={ar ? "الاتصال" : "Connection"} fullWidth /></label>
          {fieldInput(ar ? "معرّف المورد" : "Resource ID", "resourceId", "{{file.id}}")}
          {fieldInput(ar ? "حقل الإخراج" : "Output field", "outputField", "connection_resource")}
        </>}
        {op === "NOTIFY_OWNER" && <>
          {fieldInput(ar ? "العنوان" : "Title", "title", "Workflow update")}
          <label className="workflow-action-field sm:col-span-2"><span>{ar ? "الرسالة" : "Message"}</span><textarea className="wf-input min-h-20" value={String(operation.body ?? "")} onChange={(e) => set("body", e.target.value)} placeholder="{{file.name}} was processed." /></label>
        </>}
        {op === "ADD_TAG" && fieldInput(ar ? "الوسم" : "Tag", "tag", "processed")}
      </div>
    </div>
  );
}

function FunctionBuilder({ draft, setDraft, ar, connections, onSave, onSaveAndTest, onCancel, busy }: {
  draft: Draft; setDraft: (d: Draft) => void; ar: boolean; connections: Connection[]; onSave: () => void; onSaveAndTest: () => void; onCancel: () => void; busy: boolean;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOperation, setDragOperation] = useState<string | null>(null);
  // Keep the dragged operation outside React state as well: browsers may clear
  // DataTransfer before drop (notably in touch/mobile webviews).
  const dragOperationRef = useRef<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [panel, setPanel] = useState<"blocks" | "inputs" | "outputs" | "details">("blocks");
  const [advanced, setAdvanced] = useState(false);
  const definition = draft.definition;
  const updateDef = (patch: Partial<FunctionDefinition>) => setDraft({ ...draft, definition: { ...definition, ...patch } });
  const updatePort = (kind: "inputs" | "outputs", index: number, port: Port) => {
    const next = [...definition[kind]]; next[index] = port; updateDef({ [kind]: next });
  };
  const addPort = (kind: "inputs" | "outputs") => updateDef({ [kind]: [...definition[kind], { key: kind === "inputs" ? `input_${definition.inputs.length + 1}` : `output_${definition.outputs.length + 1}`, label: kind === "inputs" ? `Input ${definition.inputs.length + 1}` : `Output ${definition.outputs.length + 1}`, type: "text", required: false }] });
  const removePort = (kind: "inputs" | "outputs", index: number) => updateDef({ [kind]: definition[kind].filter((_, i) => i !== index) });
  const addOperation = (op: string) => {
    const next = [...definition.operations, emptyOperation(op)];
    const nextIndex = next.length - 1;
    updateDef({ operations: next });
    // Open the configuration form immediately after either click or drop.
    setSelectedIndex(nextIndex);
    setPanel("blocks");
  };
  const beginOperationDrag = (op: string, event: DragEvent<HTMLButtonElement>) => {
    dragOperationRef.current = op;
    setDragOperation(op);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", op);
  };
  const finishOperationDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const op = event.dataTransfer.getData("text/plain") || dragOperationRef.current || dragOperation;
    if (op && OPERATION_ITEMS.some((item) => item[0] === op)) addOperation(op);
    dragOperationRef.current = null;
    setDragOperation(null);
  };
  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const next = [...definition.operations];
    const [item] = next.splice(from, 1); next.splice(to, 0, item); updateDef({ operations: next });
    setSelectedIndex(to);
  };
  const codeFor = (op: Operation, index: number) => {
    const name = OPERATION_ITEMS.find(x => x[0] === op.op)?.[1] ?? op.op;
    const field = String(op.field ?? op.outputField ?? `step_${index + 1}`);
    if (op.op === "IF") return [`if (${String(op.condition ?? "condition")}) {`, `    ${String((op.then as Record<string, unknown> | undefined)?.field ?? "result")} = ${JSON.stringify((op.then as Record<string, unknown> | undefined)?.value ?? "")};`, `} else {`, `    ${String((op.else as Record<string, unknown> | undefined)?.field ?? "result")} = ${JSON.stringify((op.else as Record<string, unknown> | undefined)?.value ?? "")};`, `}`];
    if (op.op === "HTTP_REQUEST") return [`${field} = invokeAPI(${JSON.stringify(op.connectionId || "<connection>")}, ${JSON.stringify(op.method ?? "GET")}, ${JSON.stringify(op.path ?? "/")});`];
    if (op.op === "CONNECTION_READ") return [`${field} = connection.get(${JSON.stringify(op.resourceId ?? "")});`];
    if (op.op === "SET_FIELD") return [`${field} = ${JSON.stringify(op.value ?? "")};`];
    if (["ADD", "SUBTRACT", "MULTIPLY", "DIVIDE"].includes(op.op)) {
      const symbols: Record<string,string> = { ADD: "+", SUBTRACT: "-", MULTIPLY: "*", DIVIDE: "/" };
      return [`${field} = ${String(op.left ?? "0")} ${symbols[op.op]} ${String(op.right ?? "0")};`];
    }
    if (op.op === "CONCAT") return [`${field} = ${String(op.left ?? "")}.toString() + ${JSON.stringify(op.separator ?? " ")} + ${String(op.right ?? "")}.toString();`];
    if (op.op === "LOWERCASE") return [`${field} = ${String(op.left ?? "value")}.toLowerCase();`];
    if (op.op === "UPPERCASE") return [`${field} = ${String(op.left ?? "value")}.toUpperCase();`];
    if (op.op === "NUMBER") return [`${field} = toNumber(${String(op.left ?? "value")});`];
    if (op.op === "NOTIFY_OWNER") return [`notifyOwner(${JSON.stringify(op.title ?? "")}, ${JSON.stringify(op.body ?? "")});`];
    if (op.op === "ADD_TAG") return [`addTag(${JSON.stringify(op.tag ?? "")});`];
    return [`// ${name}`];
  };
  const codeRows: Array<{ line: string; operationIndex: number | null }> = [
    { line: `void ${draft.key || "automation.Data"}()`, operationIndex: null },
    { line: "{", operationIndex: null },
    ...definition.operations.flatMap((op, i) => codeFor(op, i).map(line => ({ line: `    ${line}`, operationIndex: i }))),
    { line: "}", operationIndex: null },
  ];
  const keyOk = !draft.key.trim() || /^[A-Za-z_][A-Za-z0-9_]*$/.test(draft.key.trim());
  const portsOk = definition.inputs.every(p => /^[A-Za-z_][A-Za-z0-9_]*$/.test(p.key)) && definition.outputs.every(p => /^[A-Za-z_][A-Za-z0-9_]*$/.test(p.key));
  const valid = Boolean(draft.name.trim()) && keyOk && portsOk && definition.operations.length > 0 && definition.operations.length <= 30;
  const saveHint = !draft.name.trim() ? (ar ? "أدخل اسم الدالة أولاً" : "Enter a function name first") : definition.operations.length < 1 ? (ar ? "أضف إجراءً واحداً على الأقل" : "Add at least one action") : !keyOk || !portsOk ? (ar ? "معرّفات المدخلات والمخرجات يجب أن تكون أحرفاً إنجليزية" : "Input and output keys must be English identifiers") : "";
  const selected = selectedIndex !== null ? definition.operations[selectedIndex] : null;
  const nav = [
    ["blocks", "▣", ar ? "الإجراءات" : "Blocks"], ["inputs", "⇥", ar ? "المدخلات" : "Inputs"],
    ["outputs", "⇤", ar ? "المخرجات" : "Outputs"], ["details", "⚙", ar ? "التفاصيل" : "Details"],
  ] as const;
  return (
    <div className="fixed inset-0 z-[260] bg-white">
      <div className="flex h-full min-h-0 flex-col text-[#333]" dir={ar ? "rtl" : "ltr"}>
        <header className="flex h-[54px] shrink-0 items-center gap-3 border-b border-[#dedede] bg-white px-3">
          <span className="text-[18px] font-semibold">ƒx</span><span className="h-5 w-px bg-slate-200" />
          <input aria-label={ar ? "اسم الدالة" : "Function name"} className="h-8 w-48 border-0 bg-transparent text-[13px] font-medium outline-none" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder={ar ? "اسم الدالة" : "Function name"} />
          <span className="hidden min-w-0 flex-1 truncate text-[11px] text-slate-400 sm:block">{draft.key || functionKeyFromName(draft.name) || (ar ? "يُولَّد المعرّف عند الحفظ" : "Identifier is created on save")}</span>
          <div className="ml-auto flex shrink-0 items-center gap-2">{saveHint ? <span className="max-w-[220px] truncate text-[11px] text-slate-500">{saveHint}</span> : null}
            <button type="button" className="rounded-full border border-slate-300 px-3 py-1.5 text-[11px]" onClick={onCancel}>{ar ? "إلغاء" : "Cancel"}</button>
            <button type="button" className="rounded-full border border-blue-300 px-3 py-1.5 text-[11px] text-blue-700" disabled={!valid || busy} onClick={onSaveAndTest}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ واختبار" : "Save and test")}</button>
            <button type="button" className="rounded-full bg-[#2875d7] px-4 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40" disabled={!valid || busy} onClick={onSave}>{ar ? "حفظ" : "Save"}</button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <nav className="flex w-[48px] shrink-0 flex-col items-center gap-2 border-e border-[#dedede] bg-[#f7f7f7] py-3">
            {nav.map(([key, glyph, label]) => <button key={key} type="button" title={label} onClick={() => { setPanel(key); if (key !== "blocks") setSelectedIndex(null); }} className={`grid h-9 w-9 place-items-center rounded-md text-[17px] ${panel === key ? "bg-[#e7e7e7] text-[#333]" : "text-slate-500 hover:bg-slate-100"}`}>{glyph}</button>)}
          </nav>
          <aside className="flex w-[min(42%,390px)] min-w-[250px] shrink-0 flex-col border-e border-[#dedede] bg-white">
            <div className="flex h-[50px] shrink-0 items-center justify-between border-b border-[#e6e6e6] px-4">
              <div className="min-w-0"><div className="truncate text-[14px] font-medium">{selected && panel === "blocks" ? (OPERATION_ITEMS.find(x => x[0] === selected.op)?.[1] ?? selected.op) : nav.find(x => x[0] === panel)?.[2]}</div><div className="text-[10px] text-slate-500">{selected && panel === "blocks" ? (OPERATION_ITEMS.find(x => x[0] === selected.op)?.[3] ?? "") : ""}</div></div>
              {selected && panel === "blocks" && <button type="button" className="text-xl text-slate-400" title={ar ? "إغلاق" : "Close"} onClick={() => setSelectedIndex(null)}>×</button>}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {panel === "blocks" && selected && selectedIndex !== null ? <OperationEditor operation={selected} index={selectedIndex} ar={ar} connections={connections}
                onChange={next => { const operations = [...definition.operations]; operations[selectedIndex ?? 0] = next; updateDef({ operations }); }}
                onRemove={() => { updateDef({ operations: definition.operations.filter((_, i) => i !== (selectedIndex ?? 0)) }); setSelectedIndex(null); }}
                onDragStart={() => setDragIndex(selectedIndex)} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (dragIndex !== null) reorder(dragIndex, selectedIndex ?? 0); setDragIndex(null); }} /> : null}
              {panel === "blocks" && !selected && <>
                <p className="mb-3 text-[11px] leading-5 text-slate-500">{ar ? "اسحب الإجراء إلى محرر الكود لإضافته، أو اضغط عليه في الأجهزة اللمسية. ستظهر حقول إدخاله هنا مباشرة." : "Drag an action into the code editor (or tap it on touch devices). Its input fields will open here."}</p>
                {OP_GROUPS.map(group => <section key={group.label} className="mb-4">
                  <div className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-slate-500">{ar ? group.arLabel : group.label}</div>
                  <div className="grid grid-cols-1 gap-1.5">{group.items.map(item => <button key={item[0]} type="button" draggable onDragStart={e => beginOperationDrag(item[0], e)} onDragEnd={() => { /* clear after drop has had a chance to read the payload */ window.setTimeout(() => { dragOperationRef.current = null; setDragOperation(null); }, 300); }} onClick={() => addOperation(item[0])} className="flex items-center gap-2 border border-[#e2e2e2] bg-[#fafafa] px-3 py-2 text-start text-[11px] hover:border-[#b6c9e8] hover:bg-[#f3f7fc]"><span className="text-slate-400">⠿</span><span>{ar ? item[2] : item[1]}</span><span className="ms-auto text-[10px] text-slate-400">＋</span></button>)}</div>
                </section>)}
              </>}
              {panel === "inputs" && <><p className="mb-3 text-[11px] text-slate-500">{ar ? "القيم التي تستقبلها الدالة من الـ Workflow." : "Values passed into this function by a workflow."}</p><div className="space-y-2">{definition.inputs.map((p, i) => <PortEditor key={`${p.key}-${i}`} port={p} ar={ar} onChange={v => updatePort("inputs", i, v)} onRemove={() => removePort("inputs", i)} />)}</div><button type="button" className="mt-3 rounded border border-slate-300 px-3 py-2 text-[11px]" onClick={() => addPort("inputs")}>＋ {ar ? "إضافة مدخل" : "Add input"}</button></>}
              {panel === "outputs" && <><p className="mb-3 text-[11px] text-slate-500">{ar ? "القيم التي ستعيدها الدالة إلى الـ Workflow." : "Values returned from this function to the workflow."}</p><div className="space-y-2">{definition.outputs.map((p, i) => <PortEditor key={`${p.key}-${i}`} port={p} ar={ar} onChange={v => updatePort("outputs", i, v)} onRemove={() => removePort("outputs", i)} />)}</div><button type="button" className="mt-3 rounded border border-slate-300 px-3 py-2 text-[11px]" onClick={() => addPort("outputs")}>＋ {ar ? "إضافة مخرج" : "Add output"}</button></>}
              {panel === "details" && <div className="space-y-3"><label className="block text-[11px]">{ar ? "اسم العرض" : "Display name"}<input className="wf-input mt-1" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label className="block text-[11px]">{ar ? "معرّف الدالة" : "Function identifier"}<input className="wf-input mt-1" value={draft.key} onChange={e => setDraft({ ...draft, key: e.target.value })} /></label><label className="block text-[11px]">{ar ? "الوصف" : "Description"}<textarea className="wf-input mt-1 min-h-20" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label><button type="button" className="text-[11px] text-blue-700" onClick={() => setAdvanced(v => !v)}>{ar ? "التعريف المتقدم JSON" : "Advanced JSON definition"}</button>{advanced && <textarea className="wf-input min-h-56 font-mono text-[10px]" value={JSON.stringify(definition, null, 2)} onChange={e => { try { updateDef(cloneDefinition(JSON.parse(e.target.value))); } catch { /* retain last valid definition */ } }} />}</div>}
            </div>
          </aside>
          <main className="flex min-w-0 flex-1 flex-col bg-white">
            <div className="flex h-[50px] shrink-0 items-center justify-between border-b border-[#e6e6e6] px-4"><div className="text-[12px] font-medium">{ar ? "محرر البرنامج النصي" : "Script Editor"}</div><div className="text-[10px] text-slate-400">{ar ? "اسحب إجراءً إلى هنا" : "Drag an action here"}</div></div>
            <div className="min-h-0 flex-1 overflow-auto bg-white" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }} onDrop={finishOperationDrop}>
              <div className="min-h-full font-mono text-[12px] leading-[22px]">
                {codeRows.map((row, lineIndex) => {
                  const operationIndex = row.operationIndex;
                  const belongsToOperation = operationIndex !== null;
                  const isSelected = belongsToOperation && selectedIndex === operationIndex;
                  return <button key={`${lineIndex}-${row.line}`} type="button" onClick={() => { if (operationIndex !== null) { setSelectedIndex(operationIndex); setPanel("blocks"); } }} className={`flex w-full min-h-[22px] items-start text-start ${isSelected ? "bg-[#e8f1ff]" : belongsToOperation ? "hover:bg-slate-50" : ""}`}><span className="sticky left-0 w-10 shrink-0 select-none pe-3 text-right text-[10px] text-slate-400">{lineIndex + 1}</span><span className="min-w-0 whitespace-pre-wrap break-words px-2 text-[#77649a]">{row.line}</span></button>;
                })}
                {definition.operations.length === 0 && <div className="mx-12 mt-5 border border-dashed border-[#c9c9c9] p-5 text-[11px] text-slate-400">{ar ? "اسحب إجراءً من اللوحة اليسرى وأفلته هنا. ستظهر حقول إدخال البيانات في اللوحة اليسرى." : "Drag an action from the left panel and drop it here. Its data-entry fields will open in the left panel."}</div>}
              </div>
            </div>
            <div className="flex h-8 shrink-0 items-center justify-between border-t border-[#e6e6e6] bg-[#fafafa] px-3 text-[10px] text-slate-500"><span>{ar ? `${definition.operations.length} إجراء` : `${definition.operations.length} actions`}</span><span>{ar ? "SAFE Runtime" : "SAFE Runtime"}</span></div>
          </main>
        </div>
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
    } catch (e) {
      if (e instanceof SyntaxError) setTestInputError(ar ? "صيغة JSON غير صحيحة. راجع الأقواس والفواصل." : "Invalid JSON. Check braces and commas.");
      else setError(e instanceof Error ? e.message : "Function test failed");
    } finally { setBusy(false); }
  };
  const filteredRows = rows.filter(f => `${f.name} ${f.key} ${f.description ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  const Shell = ({ children }: { children: ReactNode }) => standalone
    ? <>{children}</>
    : <WorkflowShell active="functions" title={ar ? "الدوال المخصصة" : "Custom Functions"} subtitle={ar ? "مصمم بصري بإصدارات ثابتة ومدخلات ومخرجات قابلة للربط داخل Workflow." : "Visual, versioned functions with reusable inputs and outputs for workflows."}>{children}</WorkflowShell>;

  return <Shell>
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

    {selected && <div className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-950/40 p-4">
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
        <div className="mt-5"><div className="text-[10px] font-semibold">{ar ? "آخر عمليات التنفيذ" : "Recent executions"}</div><div className="mt-2 max-h-40 space-y-1 overflow-auto">{executions.map(x => <div key={x.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-[9px]"><span>{x.status} · v{x.versionId.slice(0, 6)}</span><span>{x.durationMs ?? "-"} ms</span></div>)}</div></div>
      </div>
    </div>}
  </Shell>;
}
