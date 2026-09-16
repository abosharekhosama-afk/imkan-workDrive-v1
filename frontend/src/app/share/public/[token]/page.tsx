import { redirect } from "next/navigation";

export default async function LegacyPublicShareTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/share/public?token=${encodeURIComponent(token)}`);
}
