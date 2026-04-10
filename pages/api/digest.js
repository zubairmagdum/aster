import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Auth: require shared secret
  const apiKey = process.env.DIGEST_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Digest API key not configured' });

  const authHeader = req.headers.authorization || '';
  const providedKey = authHeader.replace(/^Bearer\s+/i, '');
  if (!providedKey || providedKey !== apiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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

    // Aggregate stats only — never expose user_id
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

    // Return only aggregate, no per-user breakdown
    const userCount = Object.keys(byUser).length;
    const totalJobs = Object.values(byUser).reduce((sum, u) => sum + u.total, 0);
    const allScores = Object.values(byUser).flatMap(u => u.scores);
    const avgFitScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null;
    const verdictTotals = {};
    Object.values(byUser).forEach(u => {
      Object.entries(u.verdicts).forEach(([v, c]) => { verdictTotals[v] = (verdictTotals[v] || 0) + c; });
    });

    res.json({
      users: userCount,
      totalJobs,
      avgFitScore,
      verdictBreakdown: verdictTotals,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
