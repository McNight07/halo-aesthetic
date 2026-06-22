const Stripe = require('stripe');
const { getSql } = require('./_db/client');

// Stripe needs the raw, unparsed request body to verify the webhook signature.
module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
  const signature = req.headers['stripe-signature'];
  const rawBody = await readRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('stripe webhook signature verification failed', err);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try {
      const sql = getSql();
      await sql`
        insert into payments (stripe_session_id, amount_cents, currency, customer_email, service_name, status)
        values (
          ${session.id},
          ${session.amount_total || 0},
          ${session.currency || 'usd'},
          ${session.customer_details ? session.customer_details.email : null},
          ${session.metadata ? session.metadata.service_name || null : null},
          ${session.payment_status || 'paid'}
        )
        on conflict (stripe_session_id) do nothing
      `;
    } catch (err) {
      console.error('payment insert failed', err);
      // Still return 200 so Stripe doesn't retry forever for a DB hiccup we can fix manually.
    }
  }

  return res.status(200).json({ received: true });
};
