// api/chat-agent.js
// Vercel Edge Function - powers the Linchpin AI live chat agent.
// Uses OpenAI tool-calling so lead capture (name/contact/concern) is
// returned in a guaranteed structured format instead of a fragile
// trailing-JSON convention. Once the model calls save_lead, the email
// is sent via Formspree immediately.

export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `You are the Linchpin Service Assistant - a warm, professional, discreet intake assistant for a private investigation and cybersecurity firm.

Your job in this conversation:
1. Greet the visitor and ask what brings them here today.
2. Naturally collect three things over the conversation (do not ask all at once, do not make it feel like a form):
   - Their name
   - A way to reach them (email or phone)
   - A short description of their concern (e.g. suspected infidelity, fraud, OSINT, cybersecurity)
3. Be empathetic and human - many visitors are anxious or upset. Acknowledge their situation briefly before moving the conversation forward.
4. As soon as you have collected ALL THREE pieces of information (name, contact, concern), you MUST call the save_lead function with that data. Do this immediately once you have all three - do not wait for more conversation.
5. After calling save_lead, send one final closing message confirming a Linchpin team member will reach out within 24 hours, and stop asking further questions.
6. Never give specific investigative advice, pricing, or promises about outcomes. Keep responses to 2-3 sentences max.
7. If asked about something outside Linchpin's services (penetration testing, OSINT, fraud investigation, private investigation, cybersecurity), politely redirect to those topics or say a team member can answer that directly.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'save_lead',
      description: 'Save the visitor lead information once name, contact info, and concern have all been collected. Call this exactly once per conversation, as soon as all three pieces are known.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: "The visitor's full name" },
          contact: { type: 'string', description: "Email address or phone number to reach the visitor" },
          concern: { type: 'string', description: "A short summary of what the visitor needs help with" },
        },
        required: ['name', 'contact', 'concern'],
      },
    },
  },
];

function buildMessages(history) {
  return [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
}

async function sendLeadEmail(lead) {
  try {
    await fetch('https://formspree.io/f/meedbokp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _subject: 'New AI Chat Lead - Linchpin Service',
        name: lead.name,
        contact: lead.contact,
        concern: lead.concern,
        source: 'AI Live Chat Widget',
      }),
    });
    return true;
  } catch (e) {
    return false;
  }
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
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.6,
        max_tokens: 300,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return new Response(JSON.stringify({ error: 'OpenAI error', detail: errText }), { status: 502 });
    }

    const aiData = await aiRes.json();
    const choice = aiData.choices?.[0];
    const msg = choice?.message;

    let emailed = false;
    let leadData = null;
    let reply = msg?.content || '';

    const toolCall = msg?.tool_calls?.find(tc => tc.function?.name === 'save_lead');

    if (toolCall) {
      try {
        leadData = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        leadData = null;
      }

      if (leadData && leadData.name && leadData.contact && leadData.concern) {
        emailed = await sendLeadEmail(leadData);
      }

      // The model called the tool but may not have produced a closing text
      // message in the same turn. Make a follow-up call so it can respond
      // to its own tool result with the final confirmation message.
      const followUpMessages = [
        ...buildMessages(messages),
        msg,
        {
          role: 'tool',
          tool_call_id: toolCall.id,
          content: emailed
            ? 'Lead saved and emailed to the team successfully.'
            : 'Lead saved, but the email notification failed to send.',
        },
      ];

      const followUpRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: followUpMessages,
          temperature: 0.6,
          max_tokens: 200,
        }),
      });

      if (followUpRes.ok) {
        const followUpData = await followUpRes.json();
        reply = followUpData.choices?.[0]?.message?.content || reply;
      }
    }

    return new Response(
      JSON.stringify({
        reply,
        collected: leadData ? { ...leadData, complete: true } : null,
        emailed,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error', detail: String(err) }), { status: 500 });
  }
}
