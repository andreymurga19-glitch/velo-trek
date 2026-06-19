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

    const prompt = `Це фото з велотренажера sportsline. На дисплеї є показники: ZEIT (час), DISTANZ (км), KM/H (швидкість), KILOJOULE (енергія). Поверни ТІЛЬКИ JSON без пояснень та без markdown backticks:
{"time_min": <хвилини int або null>, "km": <кілометри float або null>, "kcal": <kilojoule * 0.239 rounded int або null>, "speed": <km/h float або null>}
Час у форматі мм:сс — бери тільки хвилини. Наприклад 30:01 = 30, 11:01 = 11.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
            { text: prompt }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 256 }
      })
    });

    const data = await response.json();
    console.log('Gemini response status:', response.status);
    console.log('Gemini data:', JSON.stringify(data).slice(0, 500));

    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || 'Gemini API error', details: data });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Gemini text:', text);

    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.status(200).json(parsed);

  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
