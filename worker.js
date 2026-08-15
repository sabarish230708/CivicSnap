/**
 * CivicSnap backend — Cloudflare Worker
 * Proxies image-categorization requests to Google Gemini.
 * The Gemini API key is stored as an encrypted secret (GEMINI_API_KEY)
 * and never sent to the browser.
 *
 * Frontend calls this Worker's URL instead of calling Gemini directly.
 */

const ALLOWED_ORIGIN = "https://sabarish230708.github.io"; // lock this down to your site

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const { image, mimeType } = body; // image = base64 string (no data: prefix), mimeType = e.g. "image/jpeg"

    if (!image) {
      return jsonResponse({ error: "Missing 'image' (base64) in request body" }, 400);
    }

    const GEMINI_MODEL = "gemini-3.6-flash"; // keep consistency with the frontend prompt
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;

    const prompt = `You are a municipal AI categorization assistant. 
Look at the attached image.
1. Identify the primary civic issue in the image (e.g., 'Pothole in road', 'Stagnant water', 'Garbage dump'). Keep it short.
2. Determine which municipal department this should be routed to (e.g., 'Roadways Department', 'Municipal Corporation', 'Water Board').
Return a strict JSON object with exactly two keys: "issue" and "department". Example: {"issue": "Pothole", "department": "Roadways Department"}`;

    const geminiPayload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType || "image/jpeg",
                data: image,
              },
            },
          ],
        },
      ],
    };

    let geminiRes;
    try {
      geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiPayload),
      });
    } catch (err) {
      return jsonResponse({ error: "Failed to reach Gemini API", details: String(err) }, 502);
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return jsonResponse(
        { error: "Gemini API error", status: geminiRes.status, details: errText },
        geminiRes.status
      );
    }

    const data = await geminiRes.json();

    // Extract the text Gemini returned and try to parse the JSON it was asked to produce
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    let parsed;
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { issue: "Unknown", department: "Unclassified", raw: rawText };
    }

    return jsonResponse(parsed, 200);
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*", // Or specifically "https://sabarish230708.github.io"
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}
