type TitleInput = {
  pathname: string;
  scopeFolderName: string | null;
  adminMode: boolean;
  locale: "en" | "ar";
  label: (key: string) => string;
};

const ADMIN_TITLES: Array<[prefix: string, en: string, ar: string, exact?: boolean]> = [
  ["/admin/team-folders", "Team Folders", "مجلدات الفريق"],
  ["/admin/members", "Members", "الأعضاء"],
  ["/admin/groups", "Groups", "المجموعات"],
  ["/admin/client-users", "Client Users", "مستخدمو العملاء"],
  ["/admin/custom-functions", "Custom Functions", "الدوال المخصصة"],
  ["/admin/connections", "Connections", "الاتصالات"],
  ["/admin/workflows", "Workflows", "سير العمل"],
  ["/admin/data-templates", "Data Templates", "قوالب البيانات"],
  ["/admin/dlp", "Data Loss Prevention", "منع فقدان البيانات"],
  ["/admin/settings", "Settings", "الإعدادات"],
  ["/admin/audit", "Audit Logs & Reports", "سجلات التدقيق والتقارير"],
  ["/admin/data-administration", "Data Administration", "إدارة البيانات"],
  ["/admin/devices", "Manage Devices", "إدارة الأجهزة"],
  ["/admin", "Dashboard", "لوحة التحكم", true],
];

export function resolveTopHeaderTitle({ pathname, scopeFolderName, adminMode, locale, label }: TitleInput): string {
  const ar = locale === "ar";
  const admin = ADMIN_TITLES.find(([prefix, , , exact]) => exact ? pathname === prefix : pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (admin) return ar ? admin[2] : admin[1];
  if (adminMode && pathname.startsWith("/admin")) return ar ? "وحدة الإدارة" : "Admin Console";
  if (pathname.startsWith("/members")) return ar ? "الأعضاء" : "Members";
  if (pathname.startsWith("/organization")) return ar ? "المنظمة" : "Organization";
  if (pathname.startsWith("/settings")) return ar ? "الإعدادات" : "Settings";
  if (pathname.startsWith("/notifications")) return ar ? "الإشعارات" : "Notifications";
  if (pathname.startsWith("/files/workflows")) return ar ? "سير العمل" : "Workflows";
  if (pathname.startsWith("/collaboration")) return ar ? "التعاون" : "Collaboration";
  if (pathname.startsWith("/help")) return ar ? "المساعدة" : "Help";
  if (pathname.startsWith("/office/writer")) return ar ? "محرر المستندات" : "Document Editor";
  if (pathname.startsWith("/office/sheet")) return ar ? "جدول البيانات" : "Spreadsheet Editor";
  if (pathname.startsWith("/office/show")) return ar ? "عرض تقديمي" : "Presentation Editor";
  if (pathname.startsWith("/office/admin")) return ar ? "إدارة المكتب" : "Office Admin";
  if (pathname.startsWith("/files/editor")) return ar ? "المحرر" : "Editor";
  if (pathname.startsWith("/files/templates")) return ar ? "القوالب" : "Templates";
  if (pathname === "/files/team-folders" || pathname.startsWith("/files/team-folders/")) return ar ? "مجلدات الفريق" : "Team Folders";
  if (pathname.startsWith("/files/shared-with-me")) return label("nav.sharedWithMe");
  if (pathname.startsWith("/files/shared-by-me")) return label("nav.sharedByMe");
  if (pathname.startsWith("/files/shared-links")) return ar ? "روابط المشاركة" : "Shared Links";
  if (pathname.startsWith("/files/favorites")) return label("nav.favorites");
  if (pathname.startsWith("/files/recent")) return label("nav.recent");
  if (pathname.startsWith("/files/trash")) return label("files.trash");
  if (pathname.startsWith("/files/activity")) return label("audit.heading");
  if (pathname.startsWith("/files/external-storage")) return ar ? "التخزين الخارجي" : "External Storage";
  if (pathname.startsWith("/files/connections")) return ar ? "الاتصالات" : "Connections";
  if (pathname.startsWith("/files/collections")) return ar ? "جمع الملفات" : "Collect Files";
  if (pathname === "/files") return ar ? "ملفاتي" : "My Files";
  if (/^\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pathname)) {
    return scopeFolderName ?? label("files.breadcrumb.root");
  }
  if (pathname.startsWith("/files/")) return ar ? "الملفات" : "Files";
  return label("files.breadcrumb.root");
}
