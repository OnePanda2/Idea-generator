function extractBalancedJson(text) {
  const start = text.indexOf("{");
  if (start === -1) return "";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return "";
}

function cleanJsonText(text) {
  return text
    .replace(/```json|```/gi, "")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
}

function tryParseJson(rawText) {
  const cleaned = cleanJsonText(rawText);

  try {
    return JSON.parse(cleaned);
  } catch {
    const extracted = extractBalancedJson(cleaned);
    if (!extracted) return null;

    try {
      return JSON.parse(cleanJsonText(extracted));
    } catch {
      return null;
    }
  }
}

async function callGemini({ apiKey, model, prompt, temperature = 0.2, topP = 0.8 }) {
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
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature,
          topP,
          maxOutputTokens: 2200,
          responseMimeType: "application/json"
        }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || "Provider request failed.");
  }

  return data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
}

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

    const apiKey = process.env.GEMINI_API_KEY;
    const model = "gemini-2.5-flash";

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

    const firstText = await callGemini({
      apiKey,
      model,
      prompt: `${SYSTEM_PROMPT}\n\n${userPrompt}`,
      temperature: 0.2,
      topP: 0.8
    });

    let parsed = tryParseJson(firstText);

    if (!parsed) {
      const repairPrompt = `You repair malformed JSON.

Return ONLY valid JSON with this exact structure:
{
  "ideas": [
    {
      "id": 1,
      "hook": "...",
      "angle": "...",
      "outline": ["...", "...", "..."],
      "why_it_works": "...",
      "viral_score": 85
    }
  ],
  "niche_insight": "..."
}

Fix this malformed JSON and output only corrected JSON:

${firstText}`;

      const repairedText = await callGemini({
        apiKey,
        model,
        prompt: repairPrompt,
        temperature: 0,
        topP: 0.1
      });

      parsed = tryParseJson(repairedText);
    }

    if (!parsed) {
      return res.status(500).json({ error: "AI response could not be repaired into valid JSON." });
    }

    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Server error."
    });
  }
}
