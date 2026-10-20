// Netlify Function: /.netlify/functions/chat
// Keeps the API key on the server so it is never exposed in the browser.

const SYSTEM_PROMPT = `You are JARVIS, a friendly, witty voice assistant running in a web browser.
Your replies are spoken aloud, so:
- Keep answers short: 1 to 3 sentences unless the user asks for detail.
- Use plain spoken English. No markdown, bullet points, emojis or code blocks.
- Be warm and slightly dry-humoured, like a polite British butler.
- You cannot control the computer yourself. The app handles commands like "open WhatsApp" or "search for ...". If asked to do something you can't do, say so briefly and suggest what you can do.
- If you don't know something, say so honestly.`;

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Use POST" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY is not set in Netlify environment variables." })
    };
  }

  let messages;
  try {
    ({ messages } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad JSON" }) };
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "No messages" }) };
  }

  // Basic safety: keep only the last 10 turns, plain strings, limited length.
  const clean = messages
    .slice(-10)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (clean.length === 0 || clean[0].role !== "user") {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Conversation must start with a user message" }) };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: process.env.JARVIS_MODEL || "claude-haiku-5-5",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: clean
      })
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: data?.error?.message || "Upstream AI error" })
      };
    }

    const reply = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
    return { statusCode: 200, headers, body: JSON.stringify({ reply: reply || "I'm not sure what to say to that." }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
