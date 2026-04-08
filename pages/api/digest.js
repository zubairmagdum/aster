import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('user_id, fit_score, analysis')
      .gte('date_added', thirtyDaysAgo);

    if (error) return res.status(500).json({ error: error.message });

    // Group by user
    const byUser = {};
    (jobs || []).forEach(job => {
      if (!job.user_id) return;
      if (!byUser[job.user_id]) byUser[job.user_id] = { total: 0, verdicts: {}, scores: [] };
      const u = byUser[job.user_id];
      u.total++;
      const verdict = job.analysis?.verdict || 'Unknown';
      u.verdicts[verdict] = (u.verdicts[verdict] || 0) + 1;
      if (typeof job.fit_score === 'number') u.scores.push(job.fit_score);
    });

    const digest = Object.entries(byUser).map(([userId, data]) => ({
      userId,
      totalJobs: data.total,
      verdicts: data.verdicts,
      avgFitScore: data.scores.length > 0 ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length) : null,
    }));

    res.json({ users: digest.length, digest });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
