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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
            { text: 'Read this exercise bike display. Return ONLY JSON: {"time_min":40,"km":22.02,"speed":33.0,"kj":2001} - time_min=ZEIT minutes only as integer (40:14→40), km=DISTANZ float, speed=KM/H float, kj=KILOJOULE raw integer value (do NOT divide, return as-is). null if not visible.' }
          ]}],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 100,
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }
    );

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data.error?.message || 'Gemini error' });

    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    console.log('text:', text);

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return res.status(500).json({ error: 'No JSON', text });

    const raw = JSON.parse(text.slice(start, end + 1));
    console.log('raw:', JSON.stringify(raw));

    let time_min = raw.time_min;
    if (typeof time_min === 'string' && time_min.includes(':')) {
      time_min = parseInt(time_min.split(':')[0]);
    } else {
      time_min = time_min != null ? parseInt(time_min) : null;
    }

    // kj field → divide by 4.184 to get kcal
    const kj = raw.kj != null ? raw.kj : raw.kcal;
    const kcal = kj != null ? Math.round(kj / 4.184) : null;

    return res.status(200).json({ time_min, km: raw.km || null, speed: raw.speed || null, kcal });

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
