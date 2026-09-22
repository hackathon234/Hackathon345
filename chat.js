const express = require('express');
const db = require('../db');
const { authenticateOptional } = require('../middleware/auth');

const router = express.Router();

const SYSTEM_PROMPT = `You are the Amani Assistant, a supportive, non-judgmental first point of contact on a
mental health and community care platform. You are not a therapist and do not diagnose. Keep replies short,
warm, and practical. When appropriate, gently point the person toward booking a session with a professional
or volunteer, or joining a nearby gathering, using the platform's own features. If someone describes a
crisis or intent to harm themselves or others, calmly encourage them to contact local emergency services or
a crisis line immediately, and keep offering support rather than ending the conversation.`;

// Works for both guests and signed-in users — the chatbot is available site-wide.
router.post('/', authenticateOptional, async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server' });
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(Array.isArray(history) ? history.slice(-10) : []),
      { role: 'user', content: message },
    ];

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.6,
        max_tokens: 400,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('[chat] Groq API error:', groqResponse.status, errText);
      return res.status(502).json({ error: 'The assistant is temporarily unavailable' });
    }

    const data = await groqResponse.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "I'm here — could you tell me a bit more?";

    // Log the exchange (best-effort; do not block the response on logging failures)
    if (req.user) {
      db.query(`INSERT INTO chat_messages (user_id, role, content) VALUES ($1,'user',$2),($1,'assistant',$3)`,
        [req.user.id, message, reply]).catch((e) => console.error('[chat] log error', e));
    }

    res.json({ reply });
  } catch (err) {
    console.error('[chat]', err);
    res.status(500).json({ error: 'Could not reach the assistant' });
  }
});

module.exports = router;
