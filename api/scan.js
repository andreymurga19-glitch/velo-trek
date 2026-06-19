export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'No image provided' });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
          { text: 'Read this exercise bike display. Return ONLY this JSON with no other text: {"time_min":30,"km":15.03,"speed":26.1,"kcal":327}' }
        ]}],
        generationConfig: { temperature: 0, maxOutputTokens: 200 }
      })
    });

    const data = await response.json();
    console.log('status:', response.status);
    console.log('parts count:', data.candidates?.[0]?.content?.parts?.length);
    
    // Log ALL parts
    const parts = data.candidates?.[0]?.content?.parts || [];
    parts.forEach((p, i) => {
      console.log(`part[${i}] type:`, p.thought ? 'thought' : 'text', 'len:', (p.text||'').length, 'val:', (p.text||'').slice(0,100));
    });

    // Find text part (skip thought parts)
    const textPart = parts.find(p => !p.thought && p.text);
    const text = (textPart?.text || '').trim();
    console.log('final text:', text.slice(0, 200));

    if (!text) return res.status(500).json({ error: 'Empty text from Gemini', parts: parts.map(p => ({thought: p.thought, len: (p.text||'').length})) });

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return res.status(500).json({ error: 'No JSON', text });

    const raw = JSON.parse(text.slice(start, end + 1));

    let time_min = raw.time_min;
    if (typeof time_min === 'string' && time_min.includes(':')) {
      time_min = parseInt(time_min.split(':')[0]);
    } else {
      time_min = time_min != null ? parseInt(time_min) : null;
    }

    let kcal = raw.kcal;
    if (kcal != null && kcal > 500) kcal = Math.round(kcal / 4.184);

    return res.status(200).json({ time_min, km: raw.km || null, speed: raw.speed || null, kcal: kcal || null });

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
