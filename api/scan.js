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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
          { text: `This is a Sportsline exercise bike display. Extract values and return ONLY raw JSON, no markdown, no backticks, no explanation:
{"time_min": <ZEIT minutes as integer, e.g. 30>, "km": <DISTANZ float, e.g. 15.03>, "speed": <KM/H float, e.g. 26.1>, "kcal": <KILOJOULE divided by 4.184 as integer, e.g. 327>}
If value not visible use null. time_min must be integer (30:01 → 30). kcal must be kJ/4.184 rounded.` }
        ]}],
        generationConfig: { temperature: 0, maxOutputTokens: 100 }
      })
    });

    const data = await response.json();
    console.log('Gemini status:', response.status);

    if (!response.ok) {
      console.error('Gemini error:', JSON.stringify(data));
      return res.status(500).json({ error: data.error?.message || 'Gemini API error' });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Gemini text:', text);

    // Parse JSON safely
    try {
      // Clean markdown if present
      const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return res.status(500).json({ error: 'No JSON in response', text });

      const raw = JSON.parse(match[0]);
      console.log('Parsed raw:', JSON.stringify(raw));

      // Normalize time_min
      let time_min = raw.time_min;
      if (typeof time_min === 'string' && time_min.includes(':')) {
        time_min = parseInt(time_min.split(':')[0]);
      } else {
        time_min = time_min != null ? parseInt(time_min) : null;
      }

      // Normalize kcal (if raw kJ > 500, convert)
      let kcal = raw.kcal;
      if (kcal != null && kcal > 500) kcal = Math.round(kcal / 4.184);

      const result = {
        time_min: time_min || null,
        km: raw.km || null,
        speed: raw.speed || null,
        kcal: kcal || null
      };
      console.log('Result:', JSON.stringify(result));
      return res.status(200).json(result);

    } catch (parseErr) {
      console.error('Parse error:', parseErr.message, 'text was:', text);
      return res.status(500).json({ error: 'JSON parse failed', text, parseError: parseErr.message });
    }

  } catch (err) {
    console.error('Handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
