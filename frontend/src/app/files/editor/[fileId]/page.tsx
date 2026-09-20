"use client";

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getFileDetails } from '@/lib/api/files';

export default function LegacyEditorRedirect() {
  const params = useParams<{ fileId: string }>(); const router = useRouter(); const searchParams = useSearchParams(); const templateId = searchParams.get('templateId');
  useEffect(() => {
    void getFileDetails(params.fileId).then((file) => {
      const ext = (file.extension || '').toLowerCase();
      const type = ['xls','xlsx','csv'].includes(ext) ? 'sheet' : ['ppt','pptx'].includes(ext) ? 'show' : 'writer';
      router.replace(`/office/${type}/${params.fileId}${templateId ? `?templateId=${encodeURIComponent(templateId)}` : ''}`);
    }).catch(() => router.replace('/files'));
  }, [params.fileId, router]);
  return <div className="flex h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">Opening IMKAN Office…</div>;
}
