// api/chat-agent.js
// Vercel Edge Function — powers the Linchpin AI live chat agent.
// Receives conversation history, asks OpenAI for the next reply,
// and once enough info is collected, emails it via Formspree.

export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `You are the Linchpin Service Assistant — a warm, professional, discreet intake assistant for a private investigation and cybersecurity firm.

Your job in this conversation:
1. Greet the visitor and ask what brings them here today.
2. Naturally collect three things over the conversation (don't ask all at once, don't make it feel like a form):
   - Their name
   - A way to reach them (email or phone)
   - A short description of their concern (e.g. suspected infidelity, fraud, OSINT, cybersecurity)
3. Be empathetic and human — many visitors are anxious or upset. Acknowledge their situation briefly before moving the conversation forward.
4. Once you have all three (name, contact, concern), say a closing line confirming a Linchpin team member will reach out within 24 hours, and stop asking further questions.
5. Never give specific investigative advice, pricing, or promises about outcomes. Keep responses to 2-3 sentences max.
6. If asked about something outside Linchpin's services (penetration testing, OSINT, fraud investigation, private investigation, cybersecurity), politely redirect to those topics or say a team member can answer that directly.

After your reply, on a new line, output EXACTLY this JSON (no markdown, no code fence) representing what you've collected so far:
{"name": "<name or null>", "contact": "<email/phone or null>", "concern": "<short summary or null>", "complete": <true if all three are filled, else false>}`;

function buildMessages(history) {
  return [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}\s*$/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function stripJson(text) {
  return text.replace(/\{[\s\S]*\}\s*$/, '').trim();
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const { messages } = await req.json();

    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages array required' }), { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500 });
    }

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: buildMessages(messages),
        temperature: 0.6,
        max_tokens: 300,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return new Response(JSON.stringify({ error: 'OpenAI error', detail: errText }), { status: 502 });
    }

    const aiData = await aiRes.json();
    const rawReply = aiData.choices?.[0]?.message?.content || '';
    const extracted = extractJson(rawReply);
    const reply = stripJson(rawReply);

    let emailed = false;

    // If the conversation is complete, fire-and-forget the Formspree email
    if (extracted && extracted.complete && extracted.name && extracted.contact) {
      try {
        await fetch('https://formspree.io/f/meedbokp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            _subject: 'New AI Chat Lead — Linchpin Service',
            name: extracted.name,
            contact: extracted.contact,
            concern: extracted.concern || 'Not specified',
            source: 'AI Live Chat Widget',
          }),
        });
        emailed = true;
      } catch (e) {
        // Email failure should not break the chat experience
        emailed = false;
      }
    }

    return new Response(
      JSON.stringify({
        reply,
        collected: extracted || null,
        emailed,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error', detail: String(err) }), { status: 500 });
  }
}
