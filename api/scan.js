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
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
            { text: 'Look at this exercise bike display. Find these values: ZEIT or TIME (minutes), DISTANZ or DISTANCE (km), KILOJOULE or KCAL (energy), KM/H (speed). Return ONLY a JSON object like this example: {"time_min":30,"km":15.03,"kcal":33,"speed":26.1} - use null for any value you cannot find. No explanation, no markdown, just the JSON.' }
          ]
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 150 }
      })
    });

    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data).slice(0, 800));

    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || 'Gemini error', raw: data });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Text:', text);

    // Extract JSON from text
    const match = text.match(/\{[^}]+\}/);
    if (!match) return res.status(500).json({ error: 'No JSON in response', text });
    
    const parsed = JSON.parse(match[0]);
    
    // Convert kilojoules to kcal if needed
    if (parsed.kcal && parsed.kcal > 500) {
      parsed.kcal = Math.round(parsed.kcal * 0.239);
    }
    
    res.status(200).json(parsed);
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
