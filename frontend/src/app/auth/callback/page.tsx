"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function AuthCallback(){const router=useRouter();useEffect(()=>{const token=new URLSearchParams(window.location.search).get('token');if(token){localStorage.setItem('workdrive_access_token',token);router.replace('/files')}else router.replace('/auth/login')},[router]);return <main className="auth-page"><section className="auth-card auth-loading"><div className="auth-logo">I</div><p>Completing sign-in…</p></section></main>}
