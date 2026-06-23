const { Resend } = require('resend');

const FROM_ADDRESS = 'Sofia Zamani — Halo Aesthetic <onboarding@resend.dev>';

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
        <span style="color:#9c6a2e;">sofiazamani7@gmail.com</span>
      </div>
    </div>
  </div>
  `;
}

function detailsTable(booking) {
  return `
    <table style="width:100%; border-collapse:collapse; margin-bottom:10px; font-family:Georgia,serif;">
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
        intro: `Great news — your appointment has been confirmed. The studio address will be shared with you directly ahead of your visit.`,
        details: detailsTable(booking),
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

  throw new Error(`Unknown email type: ${type}`);
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
      subject,
      html,
    });
  } catch (err) {
    console.error(`Failed to send "${type}" email for booking ${booking.id}:`, err);
  }
}

module.exports = { sendBookingEmail };
