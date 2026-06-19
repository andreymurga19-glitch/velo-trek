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

    const prompt = `You are an OCR expert. This is a Sportsline exercise bike display. Extract these values:
1. Time (top left corner, format MM:SS like 30:01) - convert to minutes only (e.g. 30:01 = 30)
2. Distance (right side, labeled DISTANZ, e.g. 15.03) - in km
3. Speed (right side, labeled KM/H, e.g. 26.1)
4. Energy (bottom right, labeled KILOJOULE, e.g. 1369) - convert kJ to kcal by dividing by 4.184

Return ONLY valid JSON, no markdown, no explanation:
{"time_min": <integer>, "km": <float>, "speed": <float>, "kcal": <integer>}
Use null for any value not found.`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
          { text: prompt }
        ]}],
        generationConfig: { temperature: 0, maxOutputTokens: 200 }
      })
    });

    const data = await response.json();
    console.log('Gemini raw:', JSON.stringify(data).slice(0, 600));

    if (!response.ok) return res.status(500).json({ error: data.error?.message, raw: data });

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Text:', text);

    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return res.status(500).json({ error: 'No JSON found', text });

    const parsed = JSON.parse(match[0]);
    console.log('Parsed:', parsed);
    res.status(200).json(parsed);

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
