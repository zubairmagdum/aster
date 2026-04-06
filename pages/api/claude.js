export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Request body validation
  if (!req.body || !req.body.messages) {
    return res.status(400).json({ error: 'Missing required field: messages' });
  }

  // Origin validation — only allow requests from the app itself
  const origin = req.headers.origin || req.headers.referer || '';
  const allowedOrigins = ['astercopilot.com', 'localhost', '127.0.0.1'];
  const isAllowed = !origin || allowedOrigins.some(o => origin.includes(o));
  if (!isAllowed) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
