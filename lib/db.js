import { supabase } from './supabase';

const safeDate = (val) => {
  if (!val) return new Date().toISOString();
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

// ─── Jobs ────────────────────────────────────────────────────────────────────
export const dbSaveJob = async (job, userId) => {
  if (!supabase || !userId) return;
  const payload = {
    user_id: userId,
    local_id: String(job.id),
    company: job.company || '',
    role: job.role || '',
    status: job.status || 'Saved',
    date_added: safeDate(job.dateAdded),
    jd_text: job.jd || '',
    analysis: job.aiAnalysis || null,
    notes: job.notes || '',
    fit_score: typeof job.fitScore === 'number' ? job.fitScore : null,
    match_score: typeof job.matchScore === 'number' ? job.matchScore : null,
    role_dna: job.roleDNA || null,
    interview_prep: job.interviewPrep || null,
    estimated_comp_range: job.estimatedCompRange || null,
    comp_warning: job.compWarning || null,
  };
  await supabase.from('jobs').upsert(payload, { onConflict: 'user_id,local_id' });
};

export const dbSaveAllJobs = async (jobs, userId) => {
  if (!supabase || !userId || !jobs.length) return;
  const rows = jobs.map(job => ({
    user_id: userId,
    local_id: String(job.id),
    company: job.company || '',
    role: job.role || '',
    status: job.status || 'Saved',
    date_added: safeDate(job.dateAdded),
    jd_text: job.jd || '',
    analysis: job.aiAnalysis || null,
    notes: job.notes || '',
    fit_score: typeof job.fitScore === 'number' ? job.fitScore : null,
    match_score: typeof job.matchScore === 'number' ? job.matchScore : null,
    role_dna: job.roleDNA || null,
    interview_prep: job.interviewPrep || null,
    estimated_comp_range: job.estimatedCompRange || null,
    comp_warning: job.compWarning || null,
  }));
  await supabase.from('jobs').upsert(rows, { onConflict: 'user_id,local_id' });
};

export const dbLoadJobs = async (userId) => {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from('jobs').select('*').eq('user_id', userId).order('date_added', { ascending: false });
  if (error || !data || data.length === 0) return null;
  return data.map(row => ({
    id: row.local_id || row.id,
    company: row.company,
    role: row.role,
    status: row.status,
    dateAdded: row.date_added,
    jd: row.jd_text,
    aiAnalysis: row.analysis,
    notes: row.notes,
    fitScore: row.fit_score,
    matchScore: row.match_score,
    roleDNA: row.role_dna,
    interviewPrep: row.interview_prep,
    estimatedCompRange: row.estimated_comp_range,
    compWarning: row.comp_warning,
  }));
};

export const dbDeleteJob = async (jobId, userId) => {
  if (!supabase || !userId) return;
  await supabase.from('jobs').delete().eq('local_id', String(jobId)).eq('user_id', userId);
};

// ─── Resume ──────────────────────────────────────────────────────────────────
export const dbSaveResume = async (resumeText, fileName, userId) => {
  if (!supabase || !userId) return;
  await supabase.from('resumes').upsert({ user_id: userId, resume_text: resumeText, file_name: fileName }, { onConflict: 'user_id' });
};

export const dbLoadResume = async (userId) => {
  if (!supabase || !userId) return null;
  const { data } = await supabase.from('resumes').select('resume_text, file_name').eq('user_id', userId).maybeSingle();
  if (data) return { text: data.resume_text, name: data.file_name };
  return null;
};

// ─── Preferences ─────────────────────────────────────────────────────────────
export const dbSavePrefs = async (prefs, userId) => {
  if (!supabase || !userId) return;
  await supabase.from('preferences').upsert({ user_id: userId, prefs }, { onConflict: 'user_id' });
};

export const dbLoadPrefs = async (userId) => {
  if (!supabase || !userId) return null;
  const { data } = await supabase.from('preferences').select('prefs').eq('user_id', userId).maybeSingle();
  if (data) return data.prefs;
  return null;
};

// ─── Contacts ────────────────────────────────────────────────────────────────
export const dbSaveContact = async (contact, userId) => {
  if (!supabase || !userId) return;
  await supabase.from('contacts').upsert({
    id: contact.id, user_id: userId, job_id: contact.jobId || null,
    name: contact.name, title: contact.title, company: contact.company,
    linkedin_url: contact.linkedinUrl, status: contact.status, messages: contact.messages || [],
  }, { onConflict: 'id' });
};

export const dbLoadContacts = async (userId) => {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.from('contacts').select('*').eq('user_id', userId);
  if (error || !data || data.length === 0) return null;
  return data.map(row => ({
    id: row.id, jobId: row.job_id, name: row.name, title: row.title,
    company: row.company, linkedinUrl: row.linkedin_url, status: row.status,
    messages: row.messages || [], followUpDate: row.follow_up_date,
  }));
};

// ─── User record ─────────────────────────────────────────────────────────────
export const dbEnsureUser = async (user) => {
  if (!supabase || !user) return;
  await supabase.from('users').upsert({ id: user.id, email: user.email }, { onConflict: 'id' });
};

// ─── Strategy ────────────────────────────────────────────────────────────────
export const dbSaveStrategy = async (strategy, userId) => {
  if (!supabase || !userId) return;
  await supabase.from('strategy').upsert({
    user_id: userId,
    target_role: strategy.targetRole || '',
    whats_working: strategy.whatsWorking || '',
    whats_not: strategy.whatsNot || '',
    weekly_brief: strategy.weeklyBrief || null,
  }, { onConflict: 'user_id' });
};

export const dbLoadStrategy = async (userId) => {
  if (!supabase || !userId) return null;
  const { data } = await supabase.from('strategy').select('*').eq('user_id', userId).maybeSingle();
  if (!data) return null;
  return {
    targetRole: data.target_role,
    whatsWorking: data.whats_working,
    whatsNot: data.whats_not,
    weeklyBrief: data.weekly_brief,
  };
};

// ─── Email Subscribers ───────────────────────────────────────────────────────
export const dbSubscribeEmail = async (email, source = 'website', digestOptIn = false) => {
  if (!supabase) return;
  await supabase.from('email_subscribers').insert({ email, source, digest_opt_in: digestOptIn });
};

// ─── Feedback & Ratings ──────────────────────────────────────────────────────
export const dbSubmitRating = async (payload) => {
  if (!supabase) return;
  await supabase.from('analysis_ratings').insert(payload);
};

export const dbSubmitFeedback = async (payload) => {
  if (!supabase) return;
  await supabase.from('feedback').insert(payload);
};
