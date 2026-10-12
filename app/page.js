'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/AppShell';
import { api } from '@/lib/client';

function Msg({ m }) {
  if (!m) return null;
  return (
    <div className={`mt-4 notice ${m.error
      ? 'notice-bad'
      : 'notice-ok'}`}>{m.text}</div>
  );
}

export default function SetupPage() {
  const { profile, setProfile, llmOk, setLlmOk } = useApp();
  const [profiles, setProfiles] = useState([]);
  const [newName, setNewName] = useState('');
  const [pdf, setPdf] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);

  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState(null);

  const [extra, setExtra] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [prefsText, setPrefsText] = useState('');
  const [prefsFile, setPrefsFile] = useState('');
  const [prefsMsg, setPrefsMsg] = useState(null);
  const [prefFiles, setPrefFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [loadedText, setLoadedText] = useState('');   // what the selected file contained when opened (to detect unsaved edits)
  const [notes, setNotes] = useState('');
  const [refining, setRefining] = useState(false);
  const [template, setTemplate] = useState('');

  const loadProfiles = useCallback(async () => {
    const data = await api('/api/profiles');
    setProfiles(data.profiles);
    return data.profiles;
  }, []);

  // Opens one preference file of the profile (default: the current preferences.md) in the editor.
  const loadPrefs = useCallback(async (name, file) => {
    setPrefsMsg(null);
    if (!name) { setPrefsText(''); setPrefsFile(''); setPrefFiles([]); setSelectedFile(''); setLoadedText(''); return; }
    try {
      const q = new URLSearchParams({ profile: name, ...(file ? { file } : {}) });
      const data = await api(`/api/profiles/preferences?${q}`);
      const text = data.content || '';
      setTemplate(data.template || '');
      setPrefFiles(data.files);
      setSelectedFile(data.selected);
      setPrefsFile(data.file);
      setPrefsText(text);
      setLoadedText(text);
    } catch (err) {
      setProfile(''); // folder was deleted by hand
    }
  }, [setProfile]);

  useEffect(() => { loadProfiles().catch(() => {}); }, [loadProfiles]);
  useEffect(() => { loadPrefs(profile); }, [profile, loadPrefs]);

  const upload = async () => {
    setUploadMsg(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('name', newName.trim());
      form.append('resume', pdf);
      const data = await api('/api/profiles', { method: 'POST', body: form });
      setProfiles(data.profiles);
      setProfile(data.profile);
      setUploadMsg({ text: `Profile "${data.profile}" created (${data.resumeChars} characters of resume text read).` });
      setNewName('');
      setPdf(null);
    } catch (err) {
      setUploadMsg({ error: true, text: err.message });
    } finally {
      setUploading(false);
    }
  };

  const testLLM = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch('/api/llm/test', { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setLlmOk(true);
      setTestMsg({ text: `Connected to ${data.model}. Model said: "${data.reply}"` });
    } catch (err) {
      setLlmOk(false);
      setTestMsg({ error: true, text: err.message });
    } finally {
      setTesting(false);
    }
  };

  const extract = async () => {
    setExtracting(true);
    setPrefsMsg(null);
    try {
      const data = await api('/api/profiles/preferences', { json: { profile, additionalPreferences: extra } });
      setPrefsMsg({ text: 'Preferences extracted and saved. Review them below - you can edit them and finalise with the AI.' });
      await loadPrefs(profile);
      loadProfiles();
    } catch (err) {
      setPrefsMsg({ error: true, text: err.message });
    } finally {
      setExtracting(false);
    }
  };

  const savePrefs = async () => {
    setPrefsMsg(null);
    try {
      const data = await api('/api/profiles/preferences', { method: 'PUT', json: { profile, content: prefsText } });
      setPrefsText(data.content);
      setLoadedText(data.content);
      setPrefsMsg({ text: 'Saved to preferences.md exactly as written (no AI involved).' });
    } catch (err) {
      setPrefsMsg({ error: true, text: err.message });
    }
  };

  // Sends the edited text (+ optional notes) to the AI, which returns the final version saved as preferences.md.
  const refine = async () => {
    setPrefsMsg(null);
    setRefining(true);
    try {
      await api('/api/profiles/preferences', { json: { profile, refine: true, content: prefsText, notes } });
      setNotes('');
      await loadPrefs(profile);
      setPrefsMsg({ text: 'Final preferences saved. The version you started from was kept as a backup in the list.' });
      loadProfiles();
    } catch (err) {
      setPrefsMsg({ error: true, text: err.message });
    } finally {
      setRefining(false);
    }
  };

  // Lets people write the file themselves instead of generating it from the resume.
  const startBlank = async () => {
    setPrefsMsg(null);
    try {
      await api('/api/profiles/preferences', { method: 'PUT', json: { profile, content: template } });
      await loadPrefs(profile);
      loadProfiles();
    } catch (err) {
      setPrefsMsg({ error: true, text: err.message });
    }
  };

  const fileLabel = (f) =>
    f.current ? 'preferences.md - current (final)' : `Earlier version - ${new Date(f.modified).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
  const dirty = prefsText !== loadedText;
  const isCurrentFile = selectedFile === 'preferences.md';

  const current = profiles.find((p) => p.name === profile);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="page-title">Profile setup</h1>
        <p className="page-desc">Everything for one person lives in its own folder under <code>user-data/</code>. Several profiles can exist side by side.</p>
      </div>

      <section className="card">
        <h2 className="section-title mb-4"><span className="step-num">1</span>Resume &amp; profile</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="label">Use an existing profile</label>
            <select className="input" value={profile} onChange={(e) => setProfile(e.target.value)}>
              <option value="">- choose -</option>
              {profiles.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
            {current && (
              <p className="mt-2">
                <span className={`chip ${current.hasResume ? 'chip-ok' : 'chip-bad'} mr-1.5`}>Resume {current.hasResume ? 'ready' : 'missing'}</span><span className={`chip ${current.hasPreferences ? 'chip-ok' : ''}`}>{current.hasPreferences ? 'Preferences ready' : 'No preferences yet'}</span>
              </p>
            )}
          </div>
          <div>
            <label className="label">…or create a new one</label>
            <input className="input mb-2" placeholder="Profile name, e.g. prabhat-fullstack" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input className="input" type="file" accept="application/pdf,.pdf" onChange={(e) => setPdf(e.target.files?.[0] || null)} />
            <p className="page-desc">PDF only, and its text must be selectable on screen (scanned/image PDFs can&apos;t be read).</p>
            <button className="btn btn-primary mt-3" disabled={uploading || !newName.trim() || !pdf} onClick={upload}>
              {uploading ? 'Reading PDF…' : 'Upload resume'}
            </button>
          </div>
        </div>
        <Msg m={uploadMsg} />
      </section>

      <section className="card">
        <h2 className="section-title mb-1"><span className="step-num">2</span>Test the AI connection</h2>
        <p className="hint mb-4">Sends “Hi are you listening” to the OpenRouter model set in <code>.env.local</code>. Pages 2-4 unlock once it answers.</p>
        <button className="btn btn-primary" disabled={testing} onClick={testLLM}>{testing ? 'Waiting for the model…' : 'Test connection'}</button>
        {llmOk && !testMsg && <span className="ml-3 text-sm text-ok">Connected earlier in this session.</span>}
        <Msg m={testMsg} />
      </section>

      <section className="card">
        <h2 className="section-title mb-1"><span className="step-num">3</span>Job preferences</h2>
        <p className="hint mb-4">
          Your preferences live in a plain-text file, <code>preferences.md</code>, written in your own words: what you want, what you never want to apply to, and how emails should read. The AI reads it for every post and every email.
          Let the AI draft it from your resume (add anything extra below, it takes priority), or write it yourself.
        </p>
        <label className="label">Additional preferences (optional)</label>
        <textarea
          className="input h-28"
          placeholder={'e.g. Only remote or Pune/Bangalore roles. Minimum 8 LPA. Not interested in service-based companies, PHP or Java roles, or unpaid internships.'}
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
        />
        <button className="btn btn-primary mt-3" disabled={!profile || !llmOk || extracting} onClick={extract}>
          {extracting ? 'Reading resume…' : 'Get preferences from resume'}
        </button>
        {(!profile || !llmOk) && <span className="hint ml-3">Needs a profile and a successful connection test.</span>}
        <Msg m={prefsMsg} />

        {profile && prefFiles.length === 0 && (
          <p className="hint mt-4">No preferences file yet. Generate it with the button above, or <button className="underline text-link" onClick={startBlank}>start from a blank template and write it yourself</button>.</p>
        )}

        {prefFiles.length > 0 && (
          <div className="mt-8 pt-6 border-t border-line">
            <h3 className="text-[16px] font-medium text-ink mb-1">Preference files</h3>
            <p className="hint mb-4">Pick a file to read it. Edit anything, add notes in plain words, then <b>Update with AI</b>. The AI merges everything into the final <code>preferences.md</code> that screening and emails use.</p>

            <label className="label">File</label>
            <select className="input mb-1" value={selectedFile} onChange={(e) => loadPrefs(profile, e.target.value)}>
              {prefFiles.map((f) => <option key={f.name} value={f.name}>{fileLabel(f)}</option>)}
            </select>
            <p className="hint mb-4"><code>{isCurrentFile ? prefsFile : prefsFile.replace(/preferences\.json$/, selectedFile)}</code>{dirty && <span className="ml-2 chip chip-warn">Unsaved edits</span>}</p>

            <label className="label">Content</label>
            <textarea className="input h-[28rem] text-[13.5px] leading-relaxed" spellCheck={false} value={prefsText} onChange={(e) => setPrefsText(e.target.value)} />

            <label className="label mt-4">Anything to add or change? (plain words, optional)</label>
            <textarea className="input h-24" placeholder="e.g. Also open to DevOps roles. Salary at least 10 LPA. Remove Redis from my skills. Never apply to staffing agencies." value={notes} onChange={(e) => setNotes(e.target.value)} />

            <div className="flex flex-wrap gap-2 mt-4">
              <button className="btn btn-primary" disabled={!llmOk || refining || !prefsText.trim()} onClick={refine}>
                {refining ? 'Updating with AI…' : 'Update with AI'}
              </button>
              <button className="btn" disabled={!isCurrentFile || !dirty} title={isCurrentFile ? '' : 'Open preferences.md to save without the AI'} onClick={savePrefs}>Save as written</button>
              <button className="btn btn-ghost" disabled={!dirty} onClick={() => setPrefsText(loadedText)}>Discard edits</button>
            </div>
            {!llmOk && <p className="hint mt-2">Test the AI connection (step 2) to enable Update with AI.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
