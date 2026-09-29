"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  onChange: (next: Operation) => void; onRemove: () => void; onDragStart: () => void; onDrop: () => void;
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

function FunctionBuilder({ draft, setDraft, ar, connections, onSave, onCancel, busy }: {
  draft: Draft; setDraft: (d: Draft) => void; ar: boolean; connections: Connection[]; onSave: () => void; onCancel: () => void; busy: boolean;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOperation, setDragOperation] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const definition = draft.definition;
  const updateDef = (patch: Partial<FunctionDefinition>) => setDraft({ ...draft, definition: { ...definition, ...patch } });
  const updatePort = (kind: "inputs" | "outputs", index: number, port: Port) => {
    const next = [...definition[kind]]; next[index] = port; updateDef({ [kind]: next });
  };
  const addPort = (kind: "inputs" | "outputs") => updateDef({ [kind]: [...definition[kind], { key: kind === "inputs" ? `input_${definition.inputs.length + 1}` : `output_${definition.outputs.length + 1}`, label: kind === "inputs" ? `Input ${definition.inputs.length + 1}` : `Output ${definition.outputs.length + 1}`, type: "text", required: false }] });
  const removePort = (kind: "inputs" | "outputs", index: number) => updateDef({ [kind]: definition[kind].filter((_, i) => i !== index) });
  const addOperation = (op: string) => updateDef({ operations: [...definition.operations, emptyOperation(op)] });
  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const next = [...definition.operations];
    const [item] = next.splice(from, 1); next.splice(to, 0, item); updateDef({ operations: next });
  };
  const valid = draft.name.trim() && draft.key.trim() && definition.operations.length > 0 && definition.operations.length <= 30 && definition.inputs.every(p => /^[A-Za-z_][A-Za-z0-9_]*$/.test(p.key)) && definition.outputs.every(p => /^[A-Za-z_][A-Za-z0-9_]*$/.test(p.key));
  return (
    <div className="fixed inset-0 z-[260] bg-slate-950/45 p-2 sm:p-5">
      <div className="mx-auto flex h-full max-h-[96vh] w-[min(1120px,100%)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" dir={ar ? "rtl" : "ltr"}>
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
          <div><div className="text-[9px] font-semibold uppercase tracking-[.15em] text-violet-600">{ar ? "مصمم الدالة الآمنة" : "Safe Function Builder"}</div><h2 className="mt-0.5 text-[16px] font-semibold">{ar ? "أنشئ الدالة بالسحب والإفلات" : "Build your function with drag & drop"}</h2><p className="text-[9px] text-slate-500">{ar ? "ابدأ بالمدخلات، اسحب العمليات إلى المسار، ثم عرّف المخرجات." : "Define inputs, drag operations into the flow, then map outputs."}</p></div>
          <button type="button" className="wd-icon-btn" onClick={onCancel}>×</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          <section className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-lg text-indigo-700">ƒ</span>
              <div className="min-w-0">
                <h3 className="text-[12px] font-semibold text-indigo-950">{ar ? "كيف تعمل هذه الدالة؟" : "How this function works"}</h3>
                <p className="mt-1 text-[10px] leading-5 text-indigo-900">{ar ? "الدالة تستقبل مدخلات من الـ Workflow، تنفذ العمليات بالترتيب من الأعلى إلى الأسفل، ثم تعيد المخرجات لتستخدمها الخطوات التالية. مثال: أدخل status، حوّله إلى أحرف صغيرة، وأعد normalized_status." : "A function receives inputs from a workflow, runs the steps from top to bottom, then returns outputs for later workflow actions. Example: receive status, lowercase it, and return normalized_status."}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1 text-[9px] font-semibold text-indigo-800"><span className="rounded-lg bg-white px-2 py-1">{ar ? "مدخلات" : "Inputs"}</span><span>→</span><span className="rounded-lg bg-white px-2 py-1">{ar ? "عمليات بالترتيب" : "Ordered steps"}</span><span>→</span><span className="rounded-lg bg-white px-2 py-1">{ar ? "مخرجات" : "Outputs"}</span><span>→</span><span className="rounded-lg bg-white px-2 py-1">{ar ? "ربطها في Workflow" : "Map in workflow"}</span></div>
              </div>
            </div>
          </section>
          <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="space-y-3">
              <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="mb-2 text-[10px] font-semibold">{ar ? "معلومات الدالة" : "Function details"}</div>
                <div className="space-y-2">
                  <input className="wf-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={ar ? "اسم الدالة" : "Function name"} />
                  <input className="wf-input" value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} placeholder="unique_key" />
                  <textarea className="wf-input min-h-16" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder={ar ? "وصف" : "Description"} />
                </div>
              </section>
              <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-3">
                <div className="mb-1 text-[10px] font-semibold text-sky-900">{ar ? "١ · المدخلات" : "1 · Inputs"}</div>
                <p className="mb-2 text-[8.5px] leading-4 text-sky-800">{ar ? "هذه بيانات تستقبلها الدالة. عند إضافتها إلى Workflow ستربط كل مدخل بحقل أو قيمة ديناميكية. المفتاح مثل status هو الاسم الذي تستخدمه العمليات بصيغة {{status}}." : "Values the function receives. When used in a workflow, map each input to a field or dynamic value. Use its key in steps as {{status}}."}</p>
                <div className="space-y-2">{definition.inputs.map((p, i) => <PortEditor key={`${p.key}-${i}`} port={p} ar={ar} onChange={(v) => updatePort("inputs", i, v)} onRemove={() => removePort("inputs", i)} />)}</div>
                <button type="button" className="mt-2 wd-pill wd-pill-record" onClick={() => addPort("inputs")}>＋ {ar ? "إضافة إدخال" : "Add input"}</button>
              </section>
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="mb-1 text-[10px] font-semibold text-emerald-900">{ar ? "٣ · المخرجات" : "3 · Outputs"}</div>
                <p className="mb-2 text-[8.5px] leading-4 text-emerald-800">{ar ? "هذه هي النتائج التي تريد إرجاعها. اجعل مفتاح المخرج مطابقاً لحقل الناتج في العملية (Output field)، ثم اربطه في إعدادات إجراء Custom Function داخل Workflow." : "Values returned to the workflow. Make each output key match an operation’s Output field, then map it in the Custom Function action."}</p>
                <div className="space-y-2">{definition.outputs.map((p, i) => <PortEditor key={`${p.key}-${i}`} port={p} ar={ar} onChange={(v) => updatePort("outputs", i, v)} onRemove={() => removePort("outputs", i)} />)}</div>
                <button type="button" className="mt-2 wd-pill wd-pill-record" onClick={() => addPort("outputs")}>＋ {ar ? "إضافة مخرج" : "Add output"}</button>
              </section>
            </aside>
            <section className="min-w-0">
              <div className="sticky top-0 z-10 rounded-2xl border border-violet-200 bg-violet-50/95 p-3 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><div className="text-[10px] font-semibold text-violet-900">{ar ? "٢ · مسار التنفيذ" : "2 · Execution flow"}</div><div className="text-[8.5px] text-violet-800">{ar ? "اسحب العملية إلى المسار أو أضفها بالضغط. يمكنك إعادة ترتيبها." : "Drag an operation into the flow or click Add. Reorder steps by dragging."}</div></div>
                  <span className="rounded-full bg-white px-2 py-1 text-[8px] font-semibold text-violet-700">{definition.operations.length}/30</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {OPERATION_ITEMS.map((x) => (
                    <button key={x[0]} type="button" draggable onDragStart={() => setDragOperation(x[0])} onDragEnd={() => setDragOperation(null)} onClick={() => addOperation(x[0])} onDragOver={(e) => e.preventDefault()} onDrop={() => addOperation(x[0])} className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-[8.5px] font-medium text-violet-800 hover:bg-violet-100">
                      ＋ {ar ? x[2] : x[1]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2 text-[8.5px] leading-4 text-slate-600">
                <b className="text-slate-800">{ar ? "تذكير بالربط" : "Output contract"}:</b> {ar ? "أي قيمة تريد إرجاعها يجب أن يكون لها حقل ناتج بنفس المفتاح في قسم المخرجات. مثال: العملية تكتب normalized_status ← أضف مخرجاً بالمفتاح normalized_status." : "Every returned value needs an output with the same key as the operation field. Example: step writes normalized_status → add an output named normalized_status."}
              </div>
              <div className="mt-3 min-h-24 space-y-2 rounded-2xl border-2 border-dashed border-transparent p-1 transition hover:border-violet-200" onDragOver={(e) => e.preventDefault()} onDrop={() => { if (dragOperation) addOperation(dragOperation); setDragOperation(null); }}>
                {definition.operations.map((op, i) => (
                  <OperationEditor key={`${i}-${op.op}`} operation={op} index={i} ar={ar} connections={connections}
                    onChange={(next) => { const operations = [...definition.operations]; operations[i] = next; updateDef({ operations }); }}
                    onRemove={() => updateDef({ operations: definition.operations.filter((_, idx) => idx !== i) })}
                    onDragStart={() => setDragIndex(i)} onDrop={() => { if (dragIndex !== null && dragIndex >= 0) reorder(dragIndex, i); setDragIndex(null); }} />
                ))}
                {definition.operations.length === 0 && <div className="rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/30 p-12 text-center text-[10px] text-slate-400">{ar ? "اسحب عملية هنا أو اختر عملية من الأعلى." : "Drop an operation here or choose one above."}</div>}
              </div>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <button type="button" className="text-[9px] font-semibold text-slate-700" onClick={() => setAdvanced(v => !v)}>▸ {ar ? "التعريف المتقدم JSON" : "Advanced JSON definition"}</button>
                {advanced && <textarea className="wf-input mt-2 min-h-56 font-mono text-[9px]" value={JSON.stringify(definition, null, 2)} onChange={(e) => { try { updateDef(cloneDefinition(JSON.parse(e.target.value))); } catch { /* keep last valid JSON */ } }} />}
              </div>
            </section>
          </div>
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
          <div className="text-[8.5px] leading-4 text-slate-500">{ar ? "تذكير: احفظ كمسودة أولاً، اختبر الإصدار، ثم انشره ليظهر داخل Workflow. القيم الديناميكية تُكتب مثل {{status}}." : "Next: save as draft, test the version, then publish it to make it available in workflows. Dynamic values use syntax like {{status}}."}</div>
          <div className="flex gap-2"><button type="button" className="wd-pill wd-pill-record" onClick={onCancel}>{ar ? "إلغاء" : "Cancel"}</button><button type="button" className="wd-pill wd-pill-new disabled:opacity-40" disabled={!valid || busy} onClick={onSave}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ كمسودة" : "Save as draft")}</button></div>
        </footer>
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

  const create = async () => {
    setBusy(true); setError("");
    try {
      if (editingFunctionId) {
        const created = await createWorkflowFunctionVersion(editingFunctionId, { definition: draft.definition });
        setOpen(false); setEditingFunctionId(null); load();
        const target = rows.find((f) => f.id === editingFunctionId);
        if (target) await showVersions(target);
        else setSelected(null);
        setVersions((prev) => [created, ...prev]);
      } else {
        const created = await createWorkflowFunction(draft);
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
        <div className="mt-4"><WorkflowConceptGuide ar={ar} /></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="wd-card p-3"><div className="text-[9px] uppercase tracking-[.14em] text-slate-400">{ar ? "Runtime" : "Runtime"}</div><div className="mt-1 text-[12px] font-semibold">SAFE</div></div>
          <div className="wd-card p-3"><div className="text-[9px] uppercase tracking-[.14em] text-slate-400">{ar ? "Builder" : "Builder"}</div><div className="mt-1 text-[12px] font-semibold">{ar ? "سحب وإفلات" : "Drag & drop"}</div></div>
          <div className="wd-card p-3"><div className="text-[9px] uppercase tracking-[.14em] text-slate-400">{ar ? "Contracts" : "Contracts"}</div><div className="mt-1 text-[12px] font-semibold">{ar ? "Inputs → Operations → Outputs" : "Inputs → Operations → Outputs"}</div></div>
        </div>
        {filteredRows.length === 0
          ? <div className="wd-card mt-4 border-dashed p-10 text-center"><h2 className="text-[13px] font-semibold">{rows.length === 0 ? (ar ? "لا توجد دوال مخصصة بعد" : "No custom functions yet") : (ar ? "لا توجد نتائج مطابقة" : "No matching functions")}</h2><p className="mt-1 text-[10px] text-slate-500">{rows.length === 0 ? (ar ? "ابدأ بإنشاء دالة، أضف مدخلاتها وعملياتها ومخرجاتها، ثم اختبرها وانشرها." : "Create a function, define its inputs, steps and outputs, then test and publish it.") : (ar ? "جرّب كلمة بحث أخرى." : "Try another search term.")}</p></div>
          : <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filteredRows.map(f =>
            <article key={f.id} className="wd-card flex min-h-[210px] flex-col p-4">
              <div className="flex items-start justify-between"><div className="wf-icon">ƒ</div><span className="rounded-full bg-slate-100 px-2 py-1 text-[8px]">v{f.activeVersion?.version ?? 1}</span></div>
              <h3 className="mt-3 text-[12.5px] font-semibold">{f.name}</h3><p className="mt-1 text-[10px] leading-5 text-slate-500">{f.description || f.key}</p>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-4"><button className="wd-pill wd-pill-record" onClick={() => void test(f)}>{ar ? "اختبار" : "Test"}</button><button className="wd-pill wd-pill-record" onClick={() => void showVersions(f)}>{ar ? "الإصدارات" : "Versions"}</button></div>
            </article>
          )}</div>}
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

    {open && <FunctionBuilder draft={draft} setDraft={setDraft} ar={ar} connections={connections} busy={busy} onCancel={() => setOpen(false)} onSave={() => void create()} />}

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
