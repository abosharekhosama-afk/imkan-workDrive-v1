"use client";

import { useLocale } from "@/components/locale-provider";
import { Icons } from "@/components/layout/icons";

export default function AdminClientUsersPage() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  return (
    <main className="h-full overflow-y-auto bg-white" dir={ar ? "rtl" : "ltr"}>
      <section className="min-h-[340px] bg-[#f0eaff] px-7 py-10 lg:px-12">
        <div className="mx-auto grid max-w-[1180px] items-center gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <div className="text-[12px] font-semibold text-[#315da8]">{ar ? "الوصول الخارجي" : "External collaboration"}</div>
            <h1 className="mt-3 text-[38px] font-semibold tracking-[-.03em] text-slate-950">{ar ? "مستخدمو العملاء" : "Client Users"}</h1>
            <p className="mt-4 max-w-[610px] text-[14px] leading-7 text-slate-700">
              {ar ? "واجهة إدارة المستخدمين الخارجيين الذين يمكن منحهم وصولاً محدوداً إلى مجلدات الفريق. لا يتم إنشاء تراخيص أو حسابات وهمية من هذه الواجهة." : "A dedicated administration surface for external users who may receive limited access to Team Folders. This screen does not create fake licenses or accounts."}
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[12px] font-semibold text-slate-600 shadow-sm">
              <Icons.info size={15} /> {ar ? "لا توجد طبقة تراخيص Client User مهيأة حالياً" : "No Client User licensing layer is configured for this tenant"}
            </div>
          </div>
          <div className="rounded-[22px] border border-[#e2d9ff] bg-white p-7 shadow-sm">
            <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#fff4df] text-[#e89a00]"><Icons.users size={21} /></span><div><div className="text-[15px] font-semibold">{ar ? "إضافة مستخدمي العملاء" : "Invite Client Users"}</div><div className="text-[11px] text-slate-500">{ar ? "يتطلب ذلك تهيئة التراخيص والسياسة أولاً." : "Licensing and policy configuration is required first."}</div></div></div>
            <div className="mt-6 rounded-xl border border-dashed border-slate-200 p-5 text-center text-[12px] text-slate-500">{ar ? "ستظهر هنا عملية الدعوة، انتهاء الصلاحية، والمجلدات المسموح بها عند تفعيل هذا النوع من الحسابات." : "The invite flow, expiry controls, and Team Folder permissions will appear here when this account type is enabled."}</div>
            <button type="button" disabled className="mt-5 w-full rounded-xl bg-slate-100 px-4 py-2.5 text-[12px] font-semibold text-slate-400">{ar ? "التراخيص غير مهيأة" : "Licenses not configured"}</button>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-[1180px] px-7 py-10 lg:px-12">
        <h2 className="text-[24px] font-semibold text-slate-950">{ar ? "مراحل الإدارة" : "Management areas"}</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            [ar ? "الدعوات" : "Invitations", ar ? "إرسال ومتابعة دعوات المستخدمين الخارجيين." : "Invite and track external collaborators."],
            [ar ? "صلاحيات المجلدات" : "Team Folder permissions", ar ? "تحديد Viewer / Editor / Organizer عند دعم Client Users." : "Assign Viewer / Editor / Organizer roles when Client Users are enabled."],
            [ar ? "إدارة الحساب" : "Account management", ar ? "الحالة، الانتهاء، التعليق والحذف." : "Status, expiry, suspension, and removal."],
          ].map(([title, body]) => <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="text-[13px] font-semibold text-slate-900">{title}</div><p className="mt-2 text-[11px] leading-5 text-slate-500">{body}</p></article>)}
        </div>
      </section>
    </main>
  );
}
