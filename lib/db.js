import { supabase } from './supabase';

// localStorage helpers (mirrors Store in pages/index.js)
const ls = {
  get: (k, fb = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ─── Jobs ────────────────────────────────────────────────────────────────────
export const dbSaveJob = async (job, userId) => {
  if (supabase && userId) {
    const { error } = await supabase.from('jobs').upsert({
      id: job.id,
      user_id: userId,
      company: job.company,
      role: job.role,
      status: job.status,
      date_added: job.dateAdded,
      jd_text: job.jd || null,
      analysis: job.aiAnalysis || null,
      notes: job.notes || '',
      fit_score: job.fitScore ?? null,
      match_score: job.matchScore ?? null,
      role_dna: job.roleDNA || null,
      interview_prep: job.interviewPrep || null,
    });
    if (error) console.error('Supabase saveJob error:', error);
  }
};

export const dbSaveAllJobs = async (jobs, userId) => {
  if (supabase && userId && jobs.length > 0) {
    const rows = jobs.map(job => ({
      id: job.id,
      user_id: userId,
      company: job.company,
      role: job.role,
      status: job.status,
      date_added: job.dateAdded,
      jd_text: job.jd || null,
      analysis: job.aiAnalysis || null,
      notes: job.notes || '',
      fit_score: job.fitScore ?? null,
      match_score: job.matchScore ?? null,
      role_dna: job.roleDNA || null,
      interview_prep: job.interviewPrep || null,
    }));
    const { error } = await supabase.from('jobs').upsert(rows);
    if (error) console.error('Supabase saveAllJobs error:', error);
  }
};

export const dbLoadJobs = async (userId) => {
  if (supabase && userId) {
    const { data, error } = await supabase.from('jobs').select('*').eq('user_id', userId).order('date_added', { ascending: false });
    if (!error && data && data.length > 0) {
      return data.map(row => ({
        id: row.id,
        company: row.company,
        role: row.role,
        status: row.status,
        dateAdded: row.date_added?.split('T')[0] || row.date_added,
        jd: row.jd_text,
        aiAnalysis: row.analysis,
        notes: row.notes,
        fitScore: row.fit_score,
        matchScore: row.match_score,
        roleDNA: row.role_dna,
        interviewPrep: row.interview_prep,
        estimatedCompRange: row.analysis?.estimatedCompRange || null,
      }));
    }
  }
  return null; // null = use localStorage fallback
};

export const dbDeleteJob = async (jobId, userId) => {
  if (supabase && userId) {
    const { error } = await supabase.from('jobs').delete().eq('id', jobId).eq('user_id', userId);
    if (error) console.error('Supabase deleteJob error:', error);
  }
};

// ─── Resume ──────────────────────────────────────────────────────────────────
export const dbSaveResume = async (resumeText, fileName, userId) => {
  if (supabase && userId) {
    const { error } = await supabase.from('resumes').upsert({
      user_id: userId,
      resume_text: resumeText,
      file_name: fileName,
    }, { onConflict: 'user_id' });
    if (error) console.error('Supabase saveResume error:', error);
  }
};

export const dbLoadResume = async (userId) => {
  if (supabase && userId) {
    const { data, error } = await supabase.from('resumes').select('resume_text, file_name').eq('user_id', userId).single();
    if (!error && data) return { text: data.resume_text, name: data.file_name };
  }
  return null;
};

// ─── Preferences ─────────────────────────────────────────────────────────────
export const dbSavePrefs = async (prefs, userId) => {
  if (supabase && userId) {
    const { error } = await supabase.from('preferences').upsert({
      user_id: userId,
      prefs,
    }, { onConflict: 'user_id' });
    if (error) console.error('Supabase savePrefs error:', error);
  }
};

export const dbLoadPrefs = async (userId) => {
  if (supabase && userId) {
    const { data, error } = await supabase.from('preferences').select('prefs').eq('user_id', userId).single();
    if (!error && data) return data.prefs;
  }
  return null;
};

// ─── User record ─────────────────────────────────────────────────────────────
export const dbEnsureUser = async (user) => {
  if (!supabase || !user) return;
  await supabase.from('users').upsert({
    id: user.id,
    email: user.email,
  }, { onConflict: 'id' });
};
