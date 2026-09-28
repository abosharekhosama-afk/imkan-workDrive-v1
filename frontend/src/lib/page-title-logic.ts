type TitleInput = {
  pathname: string;
  scopeFolderName: string | null;
  adminMode: boolean;
  locale: "en" | "ar";
  label: (key: string) => string;
};

export function resolveTopHeaderTitle({ pathname, scopeFolderName, adminMode, locale, label }: TitleInput): string {
  const ar = locale === "ar";
  if (adminMode) return ar ? "وحدة الإدارة" : "Admin Console";
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
  if (pathname === "/files") return ar ? "ملفاتي" : "My Files";
  if (pathname.startsWith("/files/")) return scopeFolderName ?? label("files.breadcrumb.root");
  return scopeFolderName ?? label("files.breadcrumb.root");
}
