function fillTemplate(str, vars) {
  return String(str || '').replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] != null ? vars[key] : ''));
}

function formatReminderDate(value) {
  return new Date(value).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatReminderTime(value) {
  const [hours, minutes] = String(value).split(':');
  const date = new Date();
  date.setHours(parseInt(hours, 10), parseInt(minutes, 10));
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function buildReminderContent(booking, settings) {
  const reminderSettings = (settings && settings.reminders) || {};
  const general = (settings && settings.general) || {};

  const vars = {
    name: booking.name,
    service: booking.service,
    date: formatReminderDate(booking.preferred_date),
    time: formatReminderTime(booking.preferred_time),
    staff: 'Sofia Zamani',
    business_name: 'Halo Aesthetic',
    address: general.address || 'Denver, CO',
    phone: general.phone || '',
  };

  const subjectTemplate = reminderSettings.subject || 'Reminder: Your Appointment Tomorrow at {{business_name}}';
  const bodyTemplate = reminderSettings.body || '<p>Hi {{name}}, this is a reminder about your appointment on {{date}} at {{time}}.</p>';

  return {
    subject: fillTemplate(subjectTemplate, vars),
    body: fillTemplate(bodyTemplate, vars),
    enabled: reminderSettings.enabled !== false,
  };
}

module.exports = { buildReminderContent, fillTemplate };
