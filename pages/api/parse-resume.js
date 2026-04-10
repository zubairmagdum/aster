export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { base64, mediaType, fileName } = req.body || {};
  if (!base64 || typeof base64 !== 'string') {
    return res.status(400).json({ error: 'Missing file data' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // Claude supports PDF natively via document type.
  // For DOCX, we send the full base64 and ask Claude to extract text.
  const isDocx = fileName && /\.docx?$/i.test(fileName);

  const content = isDocx ? [
    { type: "text", text: `The following is the full base64-encoded content of a DOCX resume file named "${fileName}". Decode it and extract the resume as clean structured text. Include name, title, all companies, roles, dates, and key achievements. Return plain text only.\n\nBase64:\n${base64}` },
  ] : [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
    { type: "text", text: "Extract this resume as clean structured text. Include name, title, all companies, roles, dates, and key achievements. Return plain text only." },
  ];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return res.status(502).json({ error: errData.error?.message || `AI service error (${response.status})` });
    }

    const data = await response.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    if (!text) return res.status(500).json({ error: 'No text extracted' });
    res.json({ text });
  } catch (e) {
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'Resume parsing timed out. Try a smaller file.' });
    }
    res.status(500).json({ error: 'Resume parsing failed' });
  }
}
