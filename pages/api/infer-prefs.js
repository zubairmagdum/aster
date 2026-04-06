export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { resumeText } = req.body;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are analyzing a resume to infer job search preferences for ANY profession — not just tech or product management. This could be a chef, lawyer, nurse, finance analyst, teacher, engineer, or anyone.

Resume:
${resumeText}

Based ONLY on what is in this resume, infer:

1. What industries/domains has this person worked in? These are their strengths.
2. What industries/domains are completely absent from their background and would require credentials they do not have? These are natural exclusions.
3. What is their likely compensation range based on their seniority, titles, and companies?
4. Do they have people management experience? Look for managing teams, direct reports, leading people.
5. What seniority level are they? (Junior/Mid/Senior/Principal/Director/Executive)
6. What work mode is most common in their background? (Remote/Hybrid/Onsite)

Return ONLY valid JSON:
{
  "inferredTargetIndustries": ["<industry 1>", "<industry 2>"],
  "inferredExcludedIndustries": ["<domain with no background>", "<domain with no background>"],
  "inferredMinSalary": <number in dollars e.g. 150000, or null if unclear>,
  "inferredMaxSalary": <number or null>,
  "hasPeopleManagement": <true or false>,
  "seniorityLevel": "<Junior|Mid|Senior|Principal|Director|Executive>",
  "workMode": "<Remote|Hybrid|Onsite|Any>",
  "confidence": "<high|medium|low>",
  "summary": "<one sentence describing this person's professional background>"
}`
        }]
      })
    });

    const data = await response.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    const prefs = JSON.parse(text.replace(/```json|```/g, '').trim());
    res.json(prefs);
  } catch(e) {
    res.status(500).json({ error: 'Could not parse preferences' });
  }
}
