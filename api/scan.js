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
          { text: 'Read this exercise bike display. Return ONLY this JSON with no other text: {"time_min":30,"km":15.03,"speed":26.1,"kcal":327} - time_min is ZEIT minutes only (integer), km is DISTANZ (float), speed is KM/H (float), kcal is KILOJOULE/4.184 rounded (integer). Use null if not visible.' }
        ]}],
        generationConfig: { temperature: 0, maxOutputTokens: 60 }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || 'Gemini error' });
    }

    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    console.log('text length:', text.length, 'first100:', text.slice(0, 100));

    // Extract JSON object
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) {
      return res.status(500).json({ error: 'No JSON braces found', text: text.slice(0, 200) });
    }

    const jsonStr = text.slice(start, end + 1);
    console.log('jsonStr:', jsonStr);

    const raw = JSON.parse(jsonStr);

    // Fix time if string like "30:01"
    let time_min = raw.time_min;
    if (typeof time_min === 'string' && time_min.includes(':')) {
      time_min = parseInt(time_min.split(':')[0]);
    } else {
      time_min = time_min != null ? parseInt(time_min) : null;
    }

    // Fix kcal if raw kJ
    let kcal = raw.kcal;
    if (kcal != null && kcal > 500) kcal = Math.round(kcal / 4.184);

    return res.status(200).json({ time_min, km: raw.km || null, speed: raw.speed || null, kcal: kcal || null });

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
