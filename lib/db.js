import { supabase } from './supabase';

// ─── Jobs ────────────────────────────────────────────────────────────────────
export const dbSaveJob = async (job, userId) => {
  console.log('[DB:dbSaveJob] called', { jobId: job?.id, company: job?.company, userId, hasSupabase: !!supabase });
  if (!supabase) { console.log('[DB:dbSaveJob] skipped - no supabase client'); return; }
  if (!userId) { console.log('[DB:dbSaveJob] skipped - no userId'); return; }
  const payload = {
    user_id: userId,
    local_id: String(job.id),
    company: job.company || '',
    role: job.role || '',
    status: job.status || 'Saved',
    date_added: job.dateAdded || new Date().toISOString(),
    jd_text: job.jd || null,
    analysis: job.aiAnalysis || null,
    notes: job.notes || '',
    fit_score: job.fitScore ?? null,
    match_score: job.matchScore ?? null,
    role_dna: job.roleDNA || null,
    interview_prep: job.interviewPrep || null,
    estimated_comp_range: job.estimatedCompRange || null,
  };
  console.log('[DB:dbSaveJob] payload', { local_id: payload.local_id, company: payload.company, status: payload.status });
  const { data, error } = await supabase.from('jobs').upsert(payload, { onConflict: 'user_id,local_id' });
  if (error) console.error('[DB:dbSaveJob] ERROR', error);
  else console.log('[DB:dbSaveJob] SUCCESS');
};

export const dbSaveAllJobs = async (jobs, userId) => {
  console.log('[DB:dbSaveAllJobs] called', { jobCount: jobs?.length, userId, hasSupabase: !!supabase });
  if (!supabase || !userId || !jobs.length) { console.log('[DB:dbSaveAllJobs] skipped'); return; }
  const rows = jobs.map(job => ({
    user_id: userId,
    local_id: job.id,
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
    estimated_comp_range: job.estimatedCompRange || null,
  }));
  const { data, error } = await supabase.from('jobs').upsert(rows, { onConflict: 'user_id,local_id' });
  if (error) console.error('[DB:dbSaveAllJobs] ERROR', error);
  else console.log('[DB:dbSaveAllJobs] SUCCESS', { count: rows.length });
};

export const dbLoadJobs = async (userId) => {
  console.log('[DB:dbLoadJobs] called', { userId, hasSupabase: !!supabase });
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from('jobs').select('*').eq('user_id', userId).order('date_added', { ascending: false });
  if (error) { console.error('[DB:dbLoadJobs] ERROR', error); return null; }
  console.log('[DB:dbLoadJobs] result', { count: data?.length || 0 });
  if (!data || data.length === 0) return null;
  return data.map(row => ({
    id: row.local_id || row.id,
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
    estimatedCompRange: row.estimated_comp_range || row.analysis?.estimatedCompRange || null,
  }));
};

export const dbDeleteJob = async (jobId, userId) => {
  if (!supabase || !userId) return;
  const { error } = await supabase.from('jobs').delete().eq('local_id', jobId).eq('user_id', userId);
  if (error) console.error('Supabase deleteJob error:', error);
};

// ─── Resume ──────────────────────────────────────────────────────────────────
export const dbSaveResume = async (resumeText, fileName, userId) => {
  if (!supabase || !userId) return;
  const { error } = await supabase.from('resumes').upsert({
    user_id: userId,
    resume_text: resumeText,
    file_name: fileName,
  }, { onConflict: 'user_id' });
  if (error) console.error('Supabase saveResume error:', error);
};

export const dbLoadResume = async (userId) => {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from('resumes').select('resume_text, file_name').eq('user_id', userId).single();
  if (!error && data) return { text: data.resume_text, name: data.file_name };
  return null;
};

// ─── Preferences ─────────────────────────────────────────────────────────────
export const dbSavePrefs = async (prefs, userId) => {
  if (!supabase || !userId) return;
  const { error } = await supabase.from('preferences').upsert({
    user_id: userId,
    prefs,
  }, { onConflict: 'user_id' });
  if (error) console.error('Supabase savePrefs error:', error);
};

export const dbLoadPrefs = async (userId) => {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from('preferences').select('prefs').eq('user_id', userId).single();
  if (!error && data) return data.prefs;
  return null;
};

// ─── Contacts ────────────────────────────────────────────────────────────────
export const dbSaveContact = async (contact, userId) => {
  if (!supabase || !userId) return;
  const { error } = await supabase.from('contacts').upsert({
    id: contact.id,
    user_id: userId,
    job_id: contact.jobId || null,
    name: contact.name,
    title: contact.title,
    company: contact.company,
    linkedin_url: contact.linkedinUrl,
    status: contact.status,
    messages: contact.messages || [],
  }, { onConflict: 'id' });
  if (error) console.error('Supabase saveContact error:', error);
};

export const dbLoadContacts = async (userId) => {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from('contacts').select('*').eq('user_id', userId);
  if (error || !data || data.length === 0) return null;
  return data.map(row => ({
    id: row.id,
    jobId: row.job_id,
    name: row.name,
    title: row.title,
    company: row.company,
    linkedinUrl: row.linkedin_url,
    status: row.status,
    messages: row.messages || [],
    followUpDate: row.follow_up_date,
  }));
};

// ─── User record ─────────────────────────────────────────────────────────────
export const dbEnsureUser = async (user) => {
  if (!supabase || !user) return;
  await supabase.from('users').upsert({
    id: user.id,
    email: user.email,
  }, { onConflict: 'id' });
};
