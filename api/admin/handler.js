const crypto = require('crypto');
const { getSql } = require('../_db/client');
const { createSessionToken, isAdminAuthenticated, setSessionCookie, clearSessionCookie } = require('../_db/admin-auth');
const { sendBookingEmail, sendMessageReplyEmail, sendCustomClientEmail } = require('../_db/email');
const { isValidEmail, isNonEmptyString } = require('../_db/validate');
const { buildReminderContent } = require('../_db/reminders');

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function priceFromServiceLabel(label) {
  // booking.service is stored like "Brow Threading — $35" or, for multi-service
  // bookings, "Back Wax — $55, Bikini Line Wax — $40" -- sum every $amount present.
  const matches = String(label).matchAll(/\$(\d+)/g);
  let totalCents = 0;
  for (const match of matches) {
    totalCents += parseInt(match[1], 10) * 100;
  }
  return totalCents;
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  if (!process.env.ADMIN_PASSWORD) {
    console.error('ADMIN_PASSWORD is not set');
    return res.status(500).json({ error: 'Admin login is not configured' });
  }
  if (!safeCompare(password, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const token = createSessionToken();
  setSessionCookie(res, token);
  return res.status(200).json({ success: true });
}

async function handleLogout(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  clearSessionCookie(res);
  return res.status(200).json({ success: true });
}

async function handleOverview(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = getSql();
    const [totals, today, newClients, allBookings, upcoming] = await Promise.all([
      sql`select count(*) as total from bookings`,
      sql`select count(*) as total from bookings where preferred_date = current_date`,
      sql`select count(*) as total from clients where created_at >= date_trunc('month', current_date)`,
      sql`select service, status, preferred_date from bookings where preferred_date >= date_trunc('month', current_date)`,
      sql`
        select id, name, service, preferred_date, preferred_time, status
        from bookings
        where preferred_date >= current_date and status != 'cancelled'
        order by preferred_date asc, preferred_time asc
        limit 5
      `,
    ]);

    const monthlyRevenueCents = allBookings
      .filter((b) => b.status === 'completed')
      .reduce((sum, b) => sum + priceFromServiceLabel(b.service), 0);

    const serviceCounts = {};
    allBookings.forEach((b) => {
      String(b.service)
        .split(',')
        .map((part) => part.replace(/\s*—\s*\$\d+\s*$/, '').trim())
        .filter(Boolean)
        .forEach((name) => {
          serviceCounts[name] = (serviceCounts[name] || 0) + 1;
        });
    });
    const mostBooked = Object.entries(serviceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    return res.status(200).json({
      totalAppointments: parseInt(totals[0].total, 10),
      todayAppointments: parseInt(today[0].total, 10),
      monthlyRevenueCents,
      newClientsThisMonth: parseInt(newClients[0].total, 10),
      mostBooked,
      upcoming,
    });
  } catch (err) {
    console.error('admin overview failed', err);
    return res.status(500).json({ error: 'Could not load dashboard overview.' });
  }
}

async function handleBookings(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { status, search, from, to } = req.query;
  try {
    const sql = getSql();
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ilike $${params.length} or email ilike $${params.length} or phone ilike $${params.length})`);
    }
    if (from) {
      params.push(from);
      conditions.push(`preferred_date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`preferred_date <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
    const rows = await sql(
      `select * from bookings ${whereClause} order by preferred_date desc, preferred_time desc limit 300`,
      params
    );

    return res.status(200).json({ bookings: rows });
  } catch (err) {
    console.error('admin bookings fetch failed', err);
    return res.status(500).json({ error: 'Could not load appointments.' });
  }
}

async function handleBookingStatus(req, res) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, status } = req.body || {};
  const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
  if (!id || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Valid id and status are required' });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      update bookings set status = ${status} where id = ${id}
      returning id, name, email, service, preferred_date, preferred_time
    `;

    if (status === 'confirmed' || status === 'cancelled' || status === 'completed') {
      await sendBookingEmail(status, rows[0]);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('booking status update failed', err);
    return res.status(500).json({ error: 'Could not update appointment status.' });
  }
}

async function handleSendReminder(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.body || {};
  if (!id) {
    return res.status(400).json({ error: 'id is required' });
  }

  try {
    const sql = getSql();
    const bookingRows = await sql`select * from bookings where id = ${id}`;
    if (bookingRows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }
    const booking = bookingRows[0];
    if (!booking.email) {
      return res.status(400).json({ error: 'This appointment has no email on file.' });
    }

    const settingsRows = await sql`select * from business_settings`;
    const settings = {};
    settingsRows.forEach((row) => { settings[row.key] = row.value; });

    const { subject, body } = buildReminderContent(booking, settings);

    try {
      await sendCustomClientEmail({ to: booking.email, subject, bodyHtml: body });
      await sql`update bookings set reminder_status = 'sent', reminder_sent_at = now() where id = ${id}`;
      await sql`
        insert into client_emails (client_id, booking_id, to_email, subject, body, status)
        values (${booking.client_id || null}, ${booking.id}, ${booking.email}, ${subject}, ${body}, 'sent')
      `;
      return res.status(200).json({ success: true });
    } catch (sendErr) {
      console.error('manual reminder send failed', sendErr);
      await sql`update bookings set reminder_status = 'failed' where id = ${id}`;
      await sql`
        insert into client_emails (client_id, booking_id, to_email, subject, body, status)
        values (${booking.client_id || null}, ${booking.id}, ${booking.email}, ${subject}, ${body}, 'failed')
      `;
      return res.status(502).json({ error: 'Could not send the reminder email.' });
    }
  } catch (err) {
    console.error('reminder lookup failed', err);
    return res.status(500).json({ error: 'Could not send the reminder.' });
  }
}

async function handleBookingUpdate(req, res) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, name, phone, email, service, date, time, notes } = req.body || {};
  if (!id) {
    return res.status(400).json({ error: 'id is required' });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      update bookings set
        name = coalesce(${name}, name),
        phone = coalesce(${phone}, phone),
        email = coalesce(${email}, email),
        service = coalesce(${service}, service),
        preferred_date = coalesce(${date}, preferred_date),
        preferred_time = coalesce(${time}, preferred_time),
        notes = coalesce(${notes}, notes)
      where id = ${id}
      returning client_id
    `;

    if (rows[0] && rows[0].client_id && (name || phone || email)) {
      await sql`
        update clients set
          name = coalesce(${name}, name),
          phone = coalesce(${phone}, phone),
          email = coalesce(${email}, email)
        where id = ${rows[0].client_id}
      `;
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('booking update failed', err);
    return res.status(500).json({ error: 'Could not update appointment.' });
  }
}

async function handleBookingDelete(req, res) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'id is required' });
  }

  try {
    const sql = getSql();
    await sql`delete from bookings where id = ${id}`;
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('booking delete failed', err);
    return res.status(500).json({ error: 'Could not delete appointment.' });
  }
}

async function handleBookingCreate(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, phone, email, service, date, time, notes, status } = req.body || {};
  if (!name || !phone || !email || !service || !date || !time) {
    return res.status(400).json({ error: 'name, phone, email, service, date, and time are required' });
  }

  try {
    const sql = getSql();

    let clientRows = await sql`select id from clients where email = ${email} and phone = ${phone}`;
    let clientId;
    if (clientRows.length > 0) {
      clientId = clientRows[0].id;
    } else {
      const inserted = await sql`insert into clients (name, email, phone) values (${name}, ${email}, ${phone}) returning id`;
      clientId = inserted[0].id;
    }

    const finalStatus = status || 'confirmed';
    const rows = await sql`
      insert into bookings (name, phone, email, service, preferred_date, preferred_time, notes, status, client_id)
      values (${name}, ${phone}, ${email}, ${service}, ${date}, ${time}, ${notes || null}, ${finalStatus}, ${clientId})
      returning id, name, email, service, preferred_date, preferred_time
    `;

    if (finalStatus === 'confirmed') {
      await sendBookingEmail('confirmed', rows[0]);
    } else if (finalStatus === 'pending') {
      await sendBookingEmail('received', rows[0]);
    }

    return res.status(201).json({ success: true, id: rows[0].id });
  } catch (err) {
    console.error('admin booking create failed', err);
    return res.status(500).json({ error: 'Could not create appointment.' });
  }
}

async function handleClients(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { search } = req.query;
  try {
    const sql = getSql();
    const params = [];
    let whereClause = '';
    if (search) {
      params.push(`%${search}%`);
      whereClause = `where c.name ilike $1 or c.email ilike $1 or c.phone ilike $1`;
    }

    const rows = await sql(
      `
      select c.id, c.name, c.email, c.phone, c.loyalty_points, c.created_at,
        count(b.id) as appointment_count,
        max(b.preferred_date) as last_visit
      from clients c
      left join bookings b on b.client_id = c.id
      ${whereClause}
      group by c.id
      order by last_visit desc nulls last
      limit 300
      `,
      params
    );
    return res.status(200).json({ clients: rows });
  } catch (err) {
    console.error('admin clients fetch failed', err);
    return res.status(500).json({ error: 'Could not load clients.' });
  }
}

async function handleClientDetail(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'id is required' });
  }

  try {
    const sql = getSql();
    const [clientRows, bookingRows] = await Promise.all([
      sql`select * from clients where id = ${id}`,
      sql`select * from bookings where client_id = ${id} order by preferred_date desc`,
    ]);
    if (clientRows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    return res.status(200).json({ client: clientRows[0], bookings: bookingRows });
  } catch (err) {
    console.error('admin client detail fetch failed', err);
    return res.status(500).json({ error: 'Could not load client.' });
  }
}

async function handleClientNotes(req, res) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, notes } = req.body || {};
  if (!id) {
    return res.status(400).json({ error: 'id is required' });
  }

  try {
    const sql = getSql();
    await sql`update clients set notes = ${notes || null} where id = ${id}`;
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('client notes update failed', err);
    return res.status(500).json({ error: 'Could not save notes.' });
  }
}

async function handleClientEmail(req, res) {
  const sql = getSql();

  if (req.method === 'GET') {
    const { clientId } = req.query;
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' });
    }
    try {
      const rows = await sql`select * from client_emails where client_id = ${clientId} order by created_at desc limit 100`;
      return res.status(200).json({ emails: rows });
    } catch (err) {
      console.error('client email history fetch failed', err);
      return res.status(500).json({ error: 'Could not load email history.' });
    }
  }

  if (req.method === 'POST') {
    const { clientId, bookingId, to, subject, body } = req.body || {};
    if (!isValidEmail(to) || !isNonEmptyString(subject) || !isNonEmptyString(body)) {
      return res.status(400).json({ error: 'A valid recipient, subject, and message are required.' });
    }

    try {
      await sendCustomClientEmail({ to, subject, bodyHtml: body });
    } catch (err) {
      console.error('client email send failed', err);
      return res.status(502).json({ error: 'Could not send the email. Please try again.' });
    }

    try {
      const rows = await sql`
        insert into client_emails (client_id, booking_id, to_email, subject, body)
        values (${clientId || null}, ${bookingId || null}, ${to}, ${subject}, ${body})
        returning *
      `;
      return res.status(201).json({ email: rows[0] });
    } catch (err) {
      console.error('client email log failed', err);
      return res.status(200).json({ warning: 'Email sent, but could not save it to the client history.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleServicesAdmin(req, res) {
  const sql = getSql();

  if (req.method === 'GET') {
    try {
      const rows = await sql`select * from services order by category, display_order`;
      return res.status(200).json({ services: rows });
    } catch (err) {
      console.error('admin services fetch failed', err);
      return res.status(500).json({ error: 'Could not load services.' });
    }
  }

  if (req.method === 'POST') {
    const { category, name, duration, priceCents, description } = req.body || {};
    if (!category || !name || !duration || !priceCents) {
      return res.status(400).json({ error: 'category, name, duration, and priceCents are required' });
    }
    try {
      const rows = await sql`
        insert into services (category, name, duration, price_cents, description, display_order)
        values (${category}, ${name}, ${duration}, ${priceCents}, ${description || null}, 999)
        returning *
      `;
      return res.status(201).json({ service: rows[0] });
    } catch (err) {
      console.error('admin service create failed', err);
      return res.status(500).json({ error: 'Could not create service. Name may already exist.' });
    }
  }

  if (req.method === 'PUT') {
    const { id, category, name, duration, priceCents, description, isFeatured, isActive } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    try {
      const rows = await sql`
        update services set
          category = coalesce(${category}, category),
          name = coalesce(${name}, name),
          duration = coalesce(${duration}, duration),
          price_cents = coalesce(${priceCents}, price_cents),
          description = coalesce(${description}, description),
          is_featured = coalesce(${isFeatured}, is_featured),
          is_active = coalesce(${isActive}, is_active)
        where id = ${id}
        returning *
      `;
      return res.status(200).json({ service: rows[0] });
    } catch (err) {
      console.error('admin service update failed', err);
      return res.status(500).json({ error: 'Could not update service.' });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    try {
      await sql`delete from services where id = ${id}`;
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('admin service delete failed', err);
      return res.status(500).json({ error: 'Could not delete service.' });
    }
  }

  res.setHeader('Allow', 'GET, POST, PUT, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleCalendar(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const month = req.query.month; // 'YYYY-MM', defaults to current month
  try {
    const sql = getSql();
    const monthStart = month ? `${month}-01` : null;

    const rows = monthStart
      ? await sql`
          select service, status, preferred_date
          from bookings
          where preferred_date >= ${monthStart}::date
            and preferred_date < (${monthStart}::date + interval '1 month')
        `
      : await sql`
          select service, status, preferred_date
          from bookings
          where preferred_date >= date_trunc('month', current_date)
            and preferred_date < date_trunc('month', current_date) + interval '1 month'
        `;

    const byDay = {};
    rows.forEach((b) => {
      const day = new Date(b.preferred_date).toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = { revenueCents: 0, appointmentCount: 0 };
      byDay[day].appointmentCount += 1;
      if (b.status === 'completed') {
        byDay[day].revenueCents += priceFromServiceLabel(b.service);
      }
    });

    return res.status(200).json({
      days: Object.entries(byDay).map(([date, v]) => ({ date, ...v })),
    });
  } catch (err) {
    console.error('admin calendar fetch failed', err);
    return res.status(500).json({ error: 'Could not load calendar data.' });
  }
}

async function handleRevenue(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = getSql();

    const thisMonthRows = await sql`
      select service, status from bookings
      where preferred_date >= date_trunc('month', current_date)
    `;
    const lastMonthRows = await sql`
      select service, status from bookings
      where preferred_date >= date_trunc('month', current_date - interval '1 month')
        and preferred_date < date_trunc('month', current_date)
    `;

    const allTimeRows = await sql`select service, status from bookings`;

    const revenueOf = (rows) => rows
      .filter((b) => b.status === 'completed')
      .reduce((sum, b) => sum + priceFromServiceLabel(b.service), 0);

    return res.status(200).json({
      thisMonthCents: revenueOf(thisMonthRows),
      lastMonthCents: revenueOf(lastMonthRows),
      allTimeCents: revenueOf(allTimeRows),
      thisMonthCount: thisMonthRows.length,
      lastMonthCount: lastMonthRows.length,
      allTimeCount: allTimeRows.length,
    });
  } catch (err) {
    console.error('admin revenue fetch failed', err);
    return res.status(500).json({ error: 'Could not load revenue data.' });
  }
}

async function handleReviews(req, res) {
  const sql = getSql();

  if (req.method === 'GET') {
    try {
      const rows = await sql`select * from reviews order by created_at desc limit 300`;
      return res.status(200).json({ reviews: rows });
    } catch (err) {
      console.error('admin reviews fetch failed', err);
      return res.status(500).json({ error: 'Could not load reviews.' });
    }
  }

  if (req.method === 'PUT') {
    const { id, isApproved, isFeatured } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    try {
      const rows = await sql`
        update reviews set
          is_approved = coalesce(${isApproved}, is_approved),
          is_featured = coalesce(${isFeatured}, is_featured)
        where id = ${id}
        returning *
      `;
      return res.status(200).json({ review: rows[0] });
    } catch (err) {
      console.error('admin review update failed', err);
      return res.status(500).json({ error: 'Could not update review.' });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    try {
      await sql`delete from reviews where id = ${id}`;
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('admin review delete failed', err);
      return res.status(500).json({ error: 'Could not delete review.' });
    }
  }

  res.setHeader('Allow', 'GET, PUT, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleMessages(req, res) {
  const sql = getSql();

  if (req.method === 'GET') {
    try {
      const rows = await sql`select * from contact_messages order by created_at desc limit 300`;
      return res.status(200).json({ messages: rows });
    } catch (err) {
      console.error('admin messages fetch failed', err);
      return res.status(500).json({ error: 'Could not load messages.' });
    }
  }

  if (req.method === 'PUT') {
    const { id, isRead } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    try {
      const rows = await sql`
        update contact_messages set is_read = coalesce(${isRead}, is_read)
        where id = ${id}
        returning *
      `;
      return res.status(200).json({ message: rows[0] });
    } catch (err) {
      console.error('admin message update failed', err);
      return res.status(500).json({ error: 'Could not update message.' });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    try {
      await sql`delete from contact_messages where id = ${id}`;
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('admin message delete failed', err);
      return res.status(500).json({ error: 'Could not delete message.' });
    }
  }

  if (req.method === 'POST') {
    const { id, reply } = req.body || {};
    if (!id || !reply || !reply.trim()) {
      return res.status(400).json({ error: 'id and reply are required' });
    }
    try {
      const rows = await sql`select * from contact_messages where id = ${id}`;
      const message = rows[0];
      if (!message) {
        return res.status(404).json({ error: 'Message not found.' });
      }
      await sendMessageReplyEmail(message, reply.trim());
      const updated = await sql`update contact_messages set is_read = true where id = ${id} returning *`;
      return res.status(200).json({ message: updated[0] });
    } catch (err) {
      console.error('admin message reply failed', err);
      return res.status(500).json({ error: 'Could not send reply email.' });
    }
  }

  res.setHeader('Allow', 'GET, POST, PUT, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleFeedback(req, res) {
  const sql = getSql();

  if (req.method === 'GET') {
    try {
      const rows = await sql`select * from feedback order by created_at desc limit 300`;
      return res.status(200).json({ feedback: rows });
    } catch (err) {
      console.error('admin feedback fetch failed', err);
      return res.status(500).json({ error: 'Could not load feedback.' });
    }
  }

  if (req.method === 'PUT') {
    const { id, isRead, isApproved } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    try {
      const rows = await sql`
        update feedback set
          is_read = coalesce(${isRead}, is_read),
          is_approved = coalesce(${isApproved}, is_approved)
        where id = ${id}
        returning *
      `;
      return res.status(200).json({ feedback: rows[0] });
    } catch (err) {
      console.error('admin feedback update failed', err);
      return res.status(500).json({ error: 'Could not update feedback.' });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }
    try {
      await sql`delete from feedback where id = ${id}`;
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('admin feedback delete failed', err);
      return res.status(500).json({ error: 'Could not delete feedback.' });
    }
  }

  res.setHeader('Allow', 'GET, PUT, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleSettings(req, res) {
  const sql = getSql();

  if (req.method === 'GET') {
    try {
      const rows = await sql`select * from business_settings`;
      const settings = {};
      rows.forEach((row) => { settings[row.key] = row.value; });
      return res.status(200).json({ settings });
    } catch (err) {
      console.error('admin settings fetch failed', err);
      return res.status(500).json({ error: 'Could not load settings.' });
    }
  }

  if (req.method === 'PUT') {
    const { key, value } = req.body || {};
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key and value are required' });
    }
    try {
      await sql`
        insert into business_settings (key, value)
        values (${key}, ${JSON.stringify(value)})
        on conflict (key) do update set value = ${JSON.stringify(value)}
      `;
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('admin settings update failed', err);
      return res.status(500).json({ error: 'Could not save settings.' });
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}

module.exports = async (req, res) => {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  if (action === 'login') return handleLogin(req, res);
  if (action === 'logout') return handleLogout(req, res);

  if (!isAdminAuthenticated(req)) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (action === 'overview') return handleOverview(req, res);
  if (action === 'bookings') return handleBookings(req, res);
  if (action === 'booking-status') return handleBookingStatus(req, res);
  if (action === 'booking-send-reminder') return handleSendReminder(req, res);
  if (action === 'booking-update') return handleBookingUpdate(req, res);
  if (action === 'booking-delete') return handleBookingDelete(req, res);
  if (action === 'booking-create') return handleBookingCreate(req, res);
  if (action === 'clients') return handleClients(req, res);
  if (action === 'client-detail') return handleClientDetail(req, res);
  if (action === 'client-notes') return handleClientNotes(req, res);
  if (action === 'client-email') return handleClientEmail(req, res);
  if (action === 'services-admin') return handleServicesAdmin(req, res);
  if (action === 'revenue') return handleRevenue(req, res);
  if (action === 'calendar') return handleCalendar(req, res);
  if (action === 'reviews') return handleReviews(req, res);
  if (action === 'messages') return handleMessages(req, res);
  if (action === 'feedback') return handleFeedback(req, res);
  if (action === 'settings') return handleSettings(req, res);

  return res.status(404).json({ error: 'Not found' });
};
