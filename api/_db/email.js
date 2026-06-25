const { Resend } = require('resend');

const FROM_ADDRESS = 'Halo Aesthetic <hello@haloaesthetic.com>';
const REPLY_TO_ADDRESS = 'haloaesthetic@hotmail.com';
const SITE_URL = process.env.SITE_URL || 'https://www.haloaesthetic.com';

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set');
  }
  return new Resend(process.env.RESEND_API_KEY);
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(value) {
  const [hours, minutes] = String(value).split(':');
  const date = new Date();
  date.setHours(parseInt(hours, 10), parseInt(minutes, 10));
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function baseLayout({ heading, intro, details, footerNote }) {
  return `
  <div style="background:#f6f1e3; padding:40px 20px; font-family:Georgia,'Times New Roman',serif;">
    <div style="max-width:520px; margin:0 auto; background:#ffffff; border-radius:14px; overflow:hidden; border:1px solid #e3dcc7;">
      <div style="background:#0e0c09; padding:28px 36px;">
        <div style="color:#f3efe7; font-size:20px; letter-spacing:2px; text-transform:uppercase; font-weight:bold;">Halo <span style="color:#cfa15e;">Aesthetic</span></div>
      </div>
      <div style="padding:36px;">
        <h1 style="font-size:22px; color:#1c1a14; margin:0 0 18px; font-style:italic;">${heading}</h1>
        <p style="font-size:15px; line-height:1.6; color:#3a362e; margin:0 0 22px;">${intro}</p>
        ${details}
        <p style="font-size:13px; line-height:1.6; color:#6b6558; margin-top:28px;">${footerNote}</p>
      </div>
      <div style="background:#efe8d4; padding:20px 36px; text-align:center; font-size:12px; color:#6b6558;">
        Halo Aesthetic · Denver, CO · (303) 727-0746<br>
        <span style="color:#9c6a2e;">haloaesthetic@hotmail.com</span>
      </div>
    </div>
  </div>
  `;
}

function detailsTable(booking, { includeSpecialist = false } = {}) {
  const specialistRow = includeSpecialist
    ? `
      <tr>
        <td style="padding:10px 0; border-bottom:1px solid #e3dcc7; color:#6b6558; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">Specialist</td>
        <td style="padding:10px 0; border-bottom:1px solid #e3dcc7; text-align:right; color:#1c1a14; font-size:14px;">Sofia Zamani</td>
      </tr>
    `
    : '';

  return `
    <table style="width:100%; border-collapse:collapse; margin-bottom:10px; font-family:Georgia,serif;">
      ${specialistRow}
      <tr>
        <td style="padding:10px 0; border-bottom:1px solid #e3dcc7; color:#6b6558; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">Service${booking.service.includes(',') ? 's' : ''}</td>
        <td style="padding:10px 0; border-bottom:1px solid #e3dcc7; text-align:right; color:#1c1a14; font-size:14px;">${booking.service}</td>
      </tr>
      <tr>
        <td style="padding:10px 0; border-bottom:1px solid #e3dcc7; color:#6b6558; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">Date</td>
        <td style="padding:10px 0; border-bottom:1px solid #e3dcc7; text-align:right; color:#1c1a14; font-size:14px;">${formatDate(booking.preferred_date)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0; color:#6b6558; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">Time</td>
        <td style="padding:10px 0; text-align:right; color:#1c1a14; font-size:14px;">${formatTime(booking.preferred_time)}</td>
      </tr>
    </table>
  `;
}

const STUDIO_ADDRESS = '800 N Pearl Street, Denver, CO 80203, USA';
const STUDIO_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(STUDIO_ADDRESS)}`;

function studioLocationBlock() {
  return `
    <div style="margin-top:24px; padding:18px 20px; background:#f6f1e3; border:1px solid #e3dcc7; border-radius:10px;">
      <div style="font-size:13px; text-transform:uppercase; letter-spacing:0.5px; color:#6b6558; margin-bottom:6px;">Studio Address</div>
      <div style="font-size:15px; color:#1c1a14; margin-bottom:14px;">${STUDIO_ADDRESS}</div>
      <a href="${STUDIO_MAPS_URL}" style="display:inline-block; background:#1c1a14; color:#f6f1e3; text-decoration:none; font-family:Georgia,serif; font-size:13px; letter-spacing:0.5px; padding:10px 20px; border-radius:999px;">View on Google Maps</a>
    </div>
  `;
}

function buildEmail(type, booking) {
  const firstName = booking.name.split(' ')[0];

  if (type === 'received') {
    return {
      subject: 'We received your appointment request — Halo Aesthetic',
      html: baseLayout({
        heading: `Thank you, ${firstName}`,
        intro: `Your appointment request has been received. Sofia will review it and confirm shortly by email or phone.`,
        details: detailsTable(booking),
        footerNote: `This is a request only — it isn't confirmed yet. You'll receive another email as soon as it's confirmed.`,
      }),
    };
  }

  if (type === 'confirmed') {
    return {
      subject: 'Your appointment is confirmed — Halo Aesthetic',
      html: baseLayout({
        heading: `You're all set, ${firstName}`,
        intro: `Great news — your appointment has been confirmed. Here are the details for your visit.`,
        details: detailsTable(booking, { includeSpecialist: true }) + studioLocationBlock(),
        footerNote: `Need to reschedule or have a question? Just reply to this email or call (303) 727-0746.`,
      }),
    };
  }

  if (type === 'cancelled') {
    return {
      subject: 'Your appointment has been cancelled — Halo Aesthetic',
      html: baseLayout({
        heading: `Appointment cancelled`,
        intro: `Hi ${firstName}, your appointment below has been cancelled. If this wasn't expected or you'd like to rebook, just reply to this email or call (303) 727-0746.`,
        details: detailsTable(booking),
        footerNote: `We hope to see you again soon at Halo Aesthetic.`,
      }),
    };
  }

  if (type === 'completed') {
    const reviewUrl = `${SITE_URL}/leave-review.html?name=${encodeURIComponent(booking.name)}`;
    return {
      subject: `Thank you for visiting, ${firstName}! — Halo Aesthetic`,
      html: baseLayout({
        heading: `Thank you, ${firstName}!`,
        intro: `It was such a pleasure having you in the studio. We hope you're loving your results and feeling your best!`,
        details: `
          <div style="margin:24px 0; padding:20px; background:#f6f1e3; border:1px solid #e3dcc7; border-radius:10px; text-align:center;">
            <p style="font-size:15px; color:#3a362e; margin:0 0 16px;">${firstName}, your support means the world to us. If you have a moment, we'd be so grateful if you could share your experience with others.</p>
            <a href="${reviewUrl}" style="display:inline-block; background:#1c1a14; color:#f6f1e3; text-decoration:none; font-family:Georgia,serif; font-size:14px; letter-spacing:0.5px; padding:12px 28px; border-radius:999px;">Leave a Review</a>
          </div>
        `,
        footerNote: `We can't wait to welcome you back, ${firstName}. Reply to this email or call (303) 727-0746 any time.`,
      }),
    };
  }

  if (type === 'modified') {
    return {
      subject: 'Your appointment request was updated — Halo Aesthetic',
      html: baseLayout({
        heading: `Request updated, ${firstName}`,
        intro: `We've received your changes to the appointment request below. It's back in our review queue as Pending, and Sofia will confirm shortly.`,
        details: detailsTable(booking),
        footerNote: `Need to make another change? You can edit this request again any time from your account's booking history, as long as it's still pending.`,
      }),
    };
  }

  throw new Error(`Unknown email type: ${type}`);
}

async function sendAdminBookingModifiedEmail(booking, adminEmail) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email send');
    return;
  }
  if (!adminEmail) return;

  const html = baseLayout({
    heading: 'A client modified their appointment request',
    intro: `${booking.name} just edited and resubmitted a pending appointment request. Please review the updated details in the admin dashboard.`,
    details: detailsTable(booking),
    footerNote: `This request now needs review — open the Appointments tab in the admin dashboard to confirm or update it.`,
  });

  try {
    const resend = getResend();
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: adminEmail,
      replyTo: booking.email || REPLY_TO_ADDRESS,
      subject: `Client modified appointment request — ${booking.name}`,
      html,
    });
  } catch (err) {
    console.error(`Failed to send admin modification email for booking ${booking.id}:`, err);
  }
}

async function sendBookingEmail(type, booking) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email send');
    return;
  }
  if (!booking.email) return;

  try {
    const resend = getResend();
    const { subject, html } = buildEmail(type, booking);
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: booking.email,
      replyTo: REPLY_TO_ADDRESS,
      subject,
      html,
    });
  } catch (err) {
    console.error(`Failed to send "${type}" email for booking ${booking.id}:`, err);
  }
}

async function sendContactNotificationEmail(message) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email send');
    return;
  }

  const html = baseLayout({
    heading: 'New Contact Message',
    intro: `${message.name} sent a message through the website contact form.`,
    details: `
      <table style="width:100%; border-collapse:collapse; margin-bottom:10px; font-family:Georgia,serif;">
        <tr>
          <td style="padding:10px 0; border-bottom:1px solid #e3dcc7; color:#6b6558; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">Name</td>
          <td style="padding:10px 0; border-bottom:1px solid #e3dcc7; text-align:right; color:#1c1a14; font-size:14px;">${message.name}</td>
        </tr>
        <tr>
          <td style="padding:10px 0; border-bottom:1px solid #e3dcc7; color:#6b6558; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">Email</td>
          <td style="padding:10px 0; border-bottom:1px solid #e3dcc7; text-align:right; color:#1c1a14; font-size:14px;">${message.email}</td>
        </tr>
        <tr>
          <td style="padding:10px 0; border-bottom:1px solid #e3dcc7; color:#6b6558; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">Phone</td>
          <td style="padding:10px 0; border-bottom:1px solid #e3dcc7; text-align:right; color:#1c1a14; font-size:14px;">${message.phone || '—'}</td>
        </tr>
        <tr>
          <td style="padding:10px 0; color:#6b6558; font-size:13px; text-transform:uppercase; letter-spacing:0.5px; vertical-align:top;">Message</td>
          <td style="padding:10px 0; text-align:right; color:#1c1a14; font-size:14px;">${message.message}</td>
        </tr>
      </table>
    `,
    footerNote: `Reply directly to this email to respond to ${message.name.split(' ')[0]}, or view all messages in the admin dashboard.`,
  });

  try {
    const resend = getResend();
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: REPLY_TO_ADDRESS,
      replyTo: message.email,
      subject: `New message from ${message.name} — Halo Aesthetic`,
      html,
    });
  } catch (err) {
    console.error(`Failed to send contact notification email for message ${message.id}:`, err);
  }
}

async function sendMessageReplyEmail(message, replyText, attachment) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email send');
    return;
  }
  if (!message.email) return;

  const firstName = message.name.split(' ')[0];
  const html = baseLayout({
    heading: `A reply from Halo Aesthetic, ${firstName}`,
    intro: replyText.replace(/\n/g, '<br>'),
    details: `
      <div style="margin-top:24px; padding:16px 20px; background:#f6f1e3; border:1px solid #e3dcc7; border-radius:10px;">
        <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:#6b6558; margin-bottom:8px;">Your original message</div>
        <div style="font-size:14px; color:#3a362e; font-style:italic;">${message.message}</div>
      </div>
    `,
    footerNote: `Reply directly to this email if you have any more questions, or visit us at <a href="https://www.haloaesthetic.com" style="color:#9c6a2e;">haloaesthetic.com</a>.`,
  });

  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: message.email,
      replyTo: REPLY_TO_ADDRESS,
      subject: `Re: your message to Halo Aesthetic`,
      html,
      ...(attachment ? { attachments: [{ filename: attachment.filename, content: attachment.content }] } : {}),
    });
    if (error) throw new Error(error.message || JSON.stringify(error));
  } catch (err) {
    console.error(`Failed to send reply email for message ${message.id}:`, err);
    throw err;
  }
}

async function sendCustomClientEmail({ to, subject, bodyHtml }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set');
  }
  if (!to) {
    throw new Error('Recipient email is required');
  }

  const html = baseLayout({
    heading: subject,
    intro: '',
    details: `<div style="font-size:15px; line-height:1.6; color:#3a362e;">${bodyHtml}</div>`,
    footerNote: `Reply directly to this email if you have any questions, or call (303) 727-0746.`,
  });

  const resend = getResend();
  await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    replyTo: REPLY_TO_ADDRESS,
    subject,
    html,
  });
}

module.exports = {
  sendBookingEmail,
  sendContactNotificationEmail,
  sendMessageReplyEmail,
  sendCustomClientEmail,
  sendAdminBookingModifiedEmail,
};
