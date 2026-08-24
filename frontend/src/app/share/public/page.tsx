"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "../../../components/locale-provider";
import { verifyPublicShare, type PublicShareResult } from "../../../lib/api/public-share";

function PublicShareForm() {
  const { label } = useLocale();
  const params = useSearchParams();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<PublicShareResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      setResult(await verifyPublicShare(token, password || undefined));
    } catch {
      setError(label("error.generic"));
    }
  }

  return (
    <section>
      <h1 className="mb-3 text-[length:var(--imkan-font-size-ui)] font-semibold">
        {label("share.title")}
      </h1>
      <form onSubmit={(event) => void onSubmit(event)} className="flex max-w-md flex-col gap-3">
        <label className="flex flex-col gap-1 text-[length:var(--imkan-font-size-secondary)]">
          {label("share.token")}
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className="border border-[color:var(--imkan-color-muted)] bg-background px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-[length:var(--imkan-font-size-secondary)]">
          {label("share.password")}
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="border border-[color:var(--imkan-color-muted)] bg-background px-2 py-1"
          />
        </label>
        <button type="submit">{label("share.verify")}</button>
      </form>
      {error ? <p className="mt-3">{error}</p> : null}
      {result ? (
        <div className="mt-3 text-[length:var(--imkan-font-size-secondary)]">
          <p>
            {result.resource_type} {result.resource_id}
          </p>
          {result.download_url ? (
            <a href={result.download_url} className="underline">
              {label("files.download")}
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function PublicSharePage() {
  return (
    <Suspense>
      <PublicShareForm />
    </Suspense>
  );
}
