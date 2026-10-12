'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const NAV = [
  { href: '/', step: 1, label: 'Profile setup', hint: 'Resume, AI check, preferences' },
  { href: '/intake', step: 2, label: 'Upload posts', hint: 'Skip posts you already saw' },
  { href: '/screening', step: 3, label: 'AI screening', hint: 'Find posts that fit you' },
  { href: '/outreach', step: 4, label: 'Outreach', hint: 'Email, forms, links' },
];

const read = (store, key) => { try { return window[store].getItem(key) || ''; } catch { return ''; } };
const write = (store, key, val) => { try { val ? window[store].setItem(key, val) : window[store].removeItem(key); } catch {} };

const Icon = ({ d, className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const CHECK = 'M3.5 8.5l3 3 6-7';
const LOCK = 'M4.5 7V5.5a3.5 3.5 0 017 0V7M3.5 7h9v6.5h-9z';
const SUN = 'M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1M8 5.2a2.8 2.8 0 100 5.6 2.8 2.8 0 000-5.6z';
const MOON = 'M13.2 9.6A5.5 5.5 0 116.4 2.8a4.4 4.4 0 006.8 6.8z';

export default function AppShell({ children }) {
  const pathname = usePathname();
  const [profile, setProfileState] = useState('');
  const [llmOk, setLlmOkState] = useState(false);
  const [ready, setReady] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setProfileState(read('localStorage', 'v2.profile'));
    setLlmOkState(read('sessionStorage', 'v2.llmOk') === '1');
    setIsDark(document.documentElement.classList.contains('dark'));
    setReady(true);
  }, []);

  const setProfile = (name) => { setProfileState(name); write('localStorage', 'v2.profile', name); };
  const setLlmOk = (ok) => { setLlmOkState(ok); write('sessionStorage', 'v2.llmOk', ok ? '1' : ''); };
  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch {}
  };

  const unlocked = Boolean(profile && llmOk);

  return (
    <AppContext.Provider value={{ profile, setProfile, llmOk, setLlmOk, unlocked, ready }}>
      <div className="min-h-screen md:flex">
        <aside className="md:w-60 shrink-0 md:sticky md:top-0 md:h-screen flex flex-col border-b md:border-b-0 md:border-r border-line bg-panel">
          <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
            <div className="w-8 h-8 rounded-lg bg-primary text-onprimary grid place-items-center text-[14px] font-medium">J</div>
            <div className="leading-tight">
              <div className="text-[16px] font-medium text-ink">Job Outreach</div>
              <div className="hint">Posts → recruiters</div>
            </div>
          </div>

          <div className="px-5 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-mute hidden md:block">Workflow</div>
          <nav className="flex md:flex-col gap-0.5 px-3 pb-3 overflow-x-auto">
            {NAV.map((item) => {
              const active = pathname === item.href;
              const locked = item.step > 1 && !unlocked;
              const done = item.step === 1 && unlocked;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center gap-3 rounded-lg px-2.5 py-2.5 shrink-0 ${
                    active ? 'bg-sunken text-ink' : 'text-body'
                  } ${locked && !active ? 'opacity-55' : ''}`}
                >
                  <span className={`w-6 h-6 rounded-full grid place-items-center text-[12px] font-medium shrink-0 ${
                    active ? 'bg-primary text-onprimary' : done ? 'bg-okbg text-ok' : 'bg-sunken text-mute'
                  }`}>
                    {locked ? <Icon d={LOCK} className="w-3 h-3" /> : done && !active ? <Icon d={CHECK} className="w-3 h-3" /> : item.step}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium leading-tight">{item.label}</span>
                    <span className="hidden md:block text-[11px] text-mute leading-tight mt-0.5 truncate">{item.hint}</span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto hidden md:block p-3">
            <div className="rounded-md border border-line bg-sunken p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-mute">Profile</span>
                <span className="font-medium truncate max-w-[110px]" title={profile}>{profile || '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-mute">AI model</span>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <span className={`w-1.5 h-1.5 rounded-full ${llmOk ? 'bg-ok' : 'bg-warn'}`} />
                  {llmOk ? 'Connected' : 'Not tested'}
                </span>
              </div>
              <button className="btn w-full !py-1" onClick={toggleTheme}>
                <Icon d={isDark ? SUN : MOON} /> {isDark ? 'Light mode' : 'Dark mode'}
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 px-5 py-8 md:px-12 md:py-14">
          <div className="max-w-[1000px] mx-auto">{ready ? children : null}</div>
        </main>
      </div>
    </AppContext.Provider>
  );
}

/** Wraps pages 2-4: they need a chosen profile and a successful AI connection test. */
export function RequireSetup({ children }) {
  const { profile, llmOk, unlocked } = useApp();
  if (unlocked) return children;
  const Row = ({ ok, children: text }) => (
    <li className="flex items-center gap-2.5">
      <span className={`w-5 h-5 rounded-full grid place-items-center ${ok ? 'bg-[#0a2e0e] text-white' : 'bg-[#181d26]/10 text-[#41454d]'}`}>
        {ok ? <Icon d={CHECK} className="w-3 h-3" /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      </span>
      {text}
    </li>
  );
  return (
    <div className="sig-cream max-w-md !p-8">
      <h2 className="text-[24px] leading-[1.35] text-[#181d26]">Finish profile setup first</h2>
      <p className="text-[13px] text-[#41454d] mt-1">These unlock the rest of the workflow.</p>
      <ul className="text-[14px] space-y-3 my-5 text-[#181d26]">
        <Row ok={Boolean(profile)}>Upload a resume or choose a profile</Row>
        <Row ok={llmOk}>Test the AI connection</Row>
      </ul>
      <Link href="/" className="btn bg-[#181d26] border-[#181d26] text-white">Go to profile setup</Link>
    </div>
  );
}
