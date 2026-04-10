export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { resumeText } = req.body || {};
  if (!resumeText || typeof resumeText !== 'string' || resumeText.trim().length < 50) {
    return res.status(400).json({ error: 'Resume text required (minimum 50 characters)' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are analyzing a resume to infer job search preferences for ANY profession — not just tech or product management. This could be a chef, lawyer, nurse, finance analyst, teacher, engineer, or anyone.

Resume:
${resumeText.slice(0, 3000)}

Based ONLY on what is in this resume, infer:

1. What industries/domains has this person worked in? These are their strengths.
2. What industries/domains are completely absent from their background and would require credentials they do not have? These are natural exclusions.
3. What is their likely compensation range based on their seniority, titles, and companies?
4. Which of these role requirements can this person NOT meet based on their resume? Choose from: "Managing direct reports", "Security clearance required", "Travel required", "On-site only", "Specific certification required". Only include requirements the candidate clearly cannot meet.
5. What seniority level are they? (Junior/Mid/Senior/Principal/Director/Executive)
6. What work mode is most common in their background? (Remote/Hybrid/Onsite)

Return ONLY valid JSON:
{
  "inferredTargetIndustries": ["<industry 1>", "<industry 2>"],
  "inferredExcludedIndustries": ["<domain with no background>", "<domain with no background>"],
  "inferredMinSalary": <number in dollars e.g. 150000, or null if unclear>,
  "inferredMaxSalary": <number or null>,
  "cannotMeetRequirements": ["<requirement name>"],
  "seniorityLevel": "<Junior|Mid|Senior|Principal|Director|Executive>",
  "workMode": "<Remote|Hybrid|Onsite|Any>",
  "confidence": "<high|medium|low>",
  "summary": "<one sentence describing this person's professional background>"
}`,
        }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(502).json({ error: `AI service error (${response.status})` });
    }

    const data = await response.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    // Robust JSON extraction: strip markdown fences, find JSON object
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    let prefs;
    try { prefs = JSON.parse(cleaned); } catch {
      // Attempt to extract JSON from surrounding text
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start !== -1 && end > start) {
        try { prefs = JSON.parse(cleaned.slice(start, end + 1)); } catch {
          return res.status(500).json({ error: 'Could not parse preferences' });
        }
      } else {
        return res.status(500).json({ error: 'Could not parse preferences' });
      }
    }
    res.json(prefs);
  } catch (e) {
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'Preference inference timed out' });
    }
    res.status(500).json({ error: 'Could not parse preferences' });
  }
}
