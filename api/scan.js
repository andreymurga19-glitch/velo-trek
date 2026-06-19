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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
          { text: `This is a Sportsline exercise bike display. Extract these values and return ONLY a JSON object:
- time_min: the ZEIT/TIME value (top left, format MM:SS like 30:01) - return ONLY the minutes as integer (e.g. 30:01 → 30, 11:01 → 11)
- km: the DISTANZ/DISTANCE value as float (e.g. 15.03)
- speed: the KM/H value as float (e.g. 26.1)
- kcal: the KILOJOULE value divided by 4.184, rounded to integer (e.g. 1369 kJ → 327 kcal)

Return ONLY this JSON, nothing else, no markdown:
{"time_min": 30, "km": 15.03, "speed": 26.1, "kcal": 327}` }
        ]}],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 100,
          responseMimeType: 'application/json'
        }
      })
    });

    const data = await response.json();
    console.log('Raw:', JSON.stringify(data).slice(0, 500));

    if (!response.ok) return res.status(500).json({ error: data.error?.message, raw: data });

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Text:', text);

    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return res.status(500).json({ error: 'No JSON', text });

    const raw = JSON.parse(match[0]);

    // Fix time_min if it came as "30:01" string
    let time_min = raw.time_min;
    if (typeof time_min === 'string' && time_min.includes(':')) {
      time_min = parseInt(time_min.split(':')[0]);
    } else {
      time_min = parseInt(time_min) || null;
    }

    // Fix kcal if it came as raw kJ (>500 means it's kJ not kcal)
    let kcal = raw.kcal;
    if (kcal && kcal > 500) kcal = Math.round(kcal / 4.184);

    res.status(200).json({
      time_min,
      km: raw.km || null,
      speed: raw.speed || null,
      kcal: kcal || null
    });

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
