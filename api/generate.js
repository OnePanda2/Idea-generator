export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { niche, platform, contentType, audience, context } = req.body || {};

    if (!niche?.trim()) {
      return res.status(400).json({ error: "Niche is required." });
    }

    if (!platform?.trim()) {
      return res.status(400).json({ error: "Platform is required." });
    }

    const SYSTEM_PROMPT = `You are a viral content strategist who has grown multiple accounts to 100k+ followers.
You generate content ideas that get massive engagement.

Return a JSON object with this EXACT structure:
{
  "ideas": [
    {
      "id": 1,
      "hook": "The irresistible opening line or title (max 15 words)",
      "angle": "The unique perspective or approach (1 sentence)",
      "outline": ["Point 1", "Point 2", "Point 3"],
      "why_it_works": "Why this idea will get engagement (1 sentence)",
      "viral_score": 85
    }
  ],
  "niche_insight": "One sharp observation about the niche/topic that most people miss"
}

Generate exactly 9 ideas. viral_score is 0-100.
Return ONLY valid JSON. No markdown, no backticks, no extra text.`;

    const userPrompt = `Generate 9 content ideas for:
Niche/Topic: ${niche}
Platform: ${platform}
Content Type Preference: ${contentType || "Mixed"}
Target Audience: ${audience || "General audience in this niche"}
Extra context: ${context || "None"}

Make each idea genuinely different. Vary the angles. Make the hooks scroll-stopping.`;

    const model = "gemini-2.5-flash";
    const apiKey = process.env.GEMINI_API_KEY;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `${SYSTEM_PROMPT}\n\n${userPrompt}`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.3,
            topP: 0.8,
            maxOutputTokens: 2200,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "Provider request failed."
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";

    if (!text.trim()) {
      return res.status(502).json({ error: "Empty model response." });
    }

    const parsed = JSON.parse(text.replace(/```json|```/gi, "").trim());
    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Server error."
    });
  }
}
