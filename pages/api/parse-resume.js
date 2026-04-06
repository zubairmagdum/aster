export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { base64, mediaType, fileName } = req.body;
  
  // Determine actual media type
  let actualMediaType = mediaType;
  if (fileName && fileName.match(/\.docx?$/i)) {
    actualMediaType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  // Claude only supports PDF natively — for DOCX convert approach
  // For DOCX we use a text extraction prompt with the raw base64
  const isDocx = fileName && fileName.match(/\.docx?$/i);
  
  const content = isDocx ? [
    { type: "text", text: `This is a base64-encoded DOCX resume file. The base64 content is: ${base64.slice(0, 100)}... Extract and return the resume text based on typical resume structure. Return plain text only with name, title, experience, education, skills.` }
  ] : [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 }},
    { type: "text", text: "Extract this resume as clean structured text. Include name, title, all companies, roles, dates, and key achievements. Return plain text only." }
  ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content }]
      })
    });
    const data = await response.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    if (!text) return res.status(500).json({ error: 'No text extracted', raw: data });
    res.json({ text });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
