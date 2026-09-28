"use client";
import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../../../components/locale-provider';
import { createCollection, deleteCollection, listCollections, listCollectionSubmissions, updateCollection, type CollectionSubmission, type FileCollection } from '../../../lib/api/collections';
import { listFolderTree, type FolderTreeItem } from '../../../lib/api/folders';

export default function CollectionsPage() {
  const { label } = useLocale();
  const [rows, setRows] = useState<FileCollection[]>([]);
  const [folders, setFolders] = useState<FolderTreeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [folderId, setFolderId] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'INTERNAL'|'EXTERNAL'>('EXTERNAL');
  const [collectEmail, setCollectEmail] = useState(false);
  const [token, setToken] = useState('');
  const [selected, setSelected] = useState<FileCollection | null>(null);
  const [submissions, setSubmissions] = useState<CollectionSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const refresh = useCallback(async () => {
    try { setError(''); setRows(await listCollections()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load collections'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); void listFolderTree().then(setFolders).catch(() => setFolders([])); }, [refresh]);
  async function create() {
    try {
      const r = await createCollection({ name, folderId, description, type, collectName: true, collectEmail });
      setToken(r.token); setShow(false); setName(''); setFolderId(''); setDescription(''); setCollectEmail(false); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create collection'); }
  }
  async function openSubmissions(row: FileCollection) {
    setSelected(row); setSubmissions([]); setSubmissionsLoading(true);
    try { setSubmissions(await listCollectionSubmissions(row.id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load submissions'); }
    finally { setSubmissionsLoading(false); }
  }
  return <main className="wd-page">
    <header className="wd-page-head"><div className="wd-page-head-titles"><h1>{label('nav.collectFiles')}</h1><p>Collect files from team members and external people into a selected WorkDrive folder.</p></div><button className="wd-primary-button" onClick={() => setShow(true)}>＋ Create Collection</button></header>
    {error && <div className="wd-alert" role="alert">{error}</div>}
    {token && <div className="wd-alert" role="status">Collection created. Copy and save this one-time link: <strong className="break-all">{typeof window !== 'undefined' ? `${window.location.origin}/collect/${token}` : `/collect/${token}`}</strong> <button onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/collect/${token}`)}>Copy link</button> <button onClick={() => setToken('')}>Dismiss</button></div>}
    {loading ? <div className="wd-card p-6">Loading collections…</div> : rows.length === 0 ? <section className="wd-card"><div className="wd-empty"><div className="wd-empty-icon">⇧</div><h2>No collections yet</h2><p>Create a collection to receive files from employees, clients, or suppliers.</p><button className="wd-primary-button" onClick={() => setShow(true)}>Create Collection</button></div></section> :
      <div className="wd-card overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-start"><th className="p-4 text-start">Collection</th><th className="p-4 text-start">Type</th><th className="p-4 text-start">Destination</th><th className="p-4 text-start">Submissions</th><th className="p-4 text-start">Files</th><th className="p-4 text-start">Status</th><th className="p-4 text-start">Actions</th></tr></thead><tbody>{rows.map(r => <tr key={r.id} className="border-b last:border-0"><td className="p-4"><strong>{r.name}</strong><div className="text-xs text-slate-500">{r.description}</div></td><td className="p-4">{r.type}</td><td className="p-4">{r.folder.name}</td><td className="p-4"><button className="underline" onClick={() => void openSubmissions(r)}>{r.submissionsCount} · View</button></td><td className="p-4">{r.filesCount}</td><td className="p-4"><span className="wd-badge wd-badge-green">{r.status}</span></td><td className="p-4"><div className="flex gap-2"><button onClick={() => void updateCollection(r.id, { status: r.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }).then(refresh)}>{r.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button><button className="text-red-600" onClick={() => { if (confirm('Delete this collection?')) void deleteCollection(r.id).then(refresh).catch(e => setError(e.message)); }}>Delete</button></div></td></tr>)}</tbody></table></div>}
    {show && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><section className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl"><h2 className="mb-4 text-xl font-semibold">Create Collection</h2><div className="grid gap-3"><label className="grid gap-1 text-sm">Collection name<input className="wd-input" value={name} onChange={e => setName(e.target.value)} /></label><label className="grid gap-1 text-sm">Destination folder<select className="wd-input" value={folderId} onChange={e => setFolderId(e.target.value)}><option value="">Select a folder</option>{folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label className="grid gap-1 text-sm">Description<textarea className="wd-input" value={description} onChange={e => setDescription(e.target.value)} /></label><label className="grid gap-1 text-sm">Collection type<select className="wd-input" value={type} onChange={e => setType(e.target.value as 'INTERNAL'|'EXTERNAL')}><option value="EXTERNAL">External — anyone with link</option><option value="INTERNAL">Internal — team members</option></select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={collectEmail} onChange={e => setCollectEmail(e.target.checked)} /> Require submitter email</label></div><div className="mt-6 flex justify-end gap-2"><button className="wd-secondary-button" onClick={() => setShow(false)}>Cancel</button><button className="wd-primary-button" disabled={!name.trim() || !folderId} onClick={() => void create()}>Create</button></div></section></div>}
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><section className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-semibold">{selected.name} — Submissions</h2><p className="text-sm text-slate-500">Received file submissions for this collection</p></div><button onClick={() => setSelected(null)} aria-label="Close">✕</button></div>{submissionsLoading ? <p>Loading submissions…</p> : submissions.length === 0 ? <div className="py-8 text-center text-sm text-slate-500">No submissions yet.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b"><th className="p-3 text-start">Submitter</th><th className="p-3 text-start">Email</th><th className="p-3 text-start">Files</th><th className="p-3 text-start">Status</th><th className="p-3 text-start">Submitted</th></tr></thead><tbody>{submissions.map(s => <tr className="border-b" key={s.id}><td className="p-3">{s.submitterName || '—'}</td><td className="p-3">{s.submitterEmail || '—'}</td><td className="p-3">{s.fileCount}</td><td className="p-3">{s.status}</td><td className="p-3">{s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}</td></tr>)}</tbody></table></div>}</section></div>}
  </main>;
}
