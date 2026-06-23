const Anthropic = require('@anthropic-ai/sdk');
const { isNonEmptyString } = require('./_db/validate');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI writing assistant is not configured right now.' });
  }

  const body = req.body || {};
  if (!isNonEmptyString(body.prompt)) {
    return res.status(400).json({ error: 'Please describe what you would like to say.' });
  }
  if (body.prompt.length > 500) {
    return res.status(400).json({ error: 'That description is too long.' });
  }

  try {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: 'You write short, genuine-sounding customer feedback messages for a beauty studio called Halo Aesthetic, based on a brief description of the client\'s experience. Write in first person, 2-4 sentences, warm and specific, no exaggeration, no emojis, no quotation marks around the output. Respond with only the feedback text itself, nothing else.',
      messages: [{ role: 'user', content: body.prompt }],
    });

    const text = message.content.find((block) => block.type === 'text');
    if (!text) {
      return res.status(502).json({ error: 'Could not generate a draft. Please try again.' });
    }

    return res.status(200).json({ draft: text.text.trim() });
  } catch (err) {
    console.error('ai-feedback generation failed', err);
    return res.status(500).json({ error: 'Could not generate a draft right now. Please try again.' });
  }
};
