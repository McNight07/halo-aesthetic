-- Run this once in the Neon SQL Editor to set up Halo Aesthetic's database.

create table if not exists bookings (
  id serial primary key,
  name text not null,
  phone text not null,
  email text not null,
  service text not null,
  preferred_date date not null,
  preferred_time time not null,
  notes text,
  created_at timestamptz default now()
);

create table if not exists contact_messages (
  id serial primary key,
  name text not null,
  email text not null,
  phone text,
  message text not null,
  created_at timestamptz default now()
);

alter table contact_messages add column if not exists phone text;
alter table contact_messages add column if not exists is_read boolean not null default false;

create table if not exists services (
  id serial primary key,
  category text not null,
  name text not null unique,
  duration text not null,
  price_cents integer not null,
  display_order integer not null default 0
);

create table if not exists payments (
  id serial primary key,
  stripe_session_id text unique not null,
  amount_cents integer not null,
  currency text not null default 'usd',
  customer_email text,
  service_name text,
  status text not null,
  created_at timestamptz default now()
);

-- Seed data, mirrors the menu already on the site (services.html / booking.html)
insert into services (category, name, duration, price_cents, display_order) values
  ('Waxing', 'Back Wax', '1 hr', 5500, 1),
  ('Waxing', 'Bikini Line Wax', '30 mins', 4000, 2),
  ('Waxing', 'Full Arm Wax', '30 mins', 4500, 3),
  ('Waxing', 'Full Body Wax', '2 hrs 30 mins', 15000, 4),
  ('Waxing', 'Full Legs Wax', '1 hr 30 mins', 5000, 5),
  ('Waxing', 'Half Arms Wax', '1 hr 30 mins', 3000, 6),
  ('Waxing', 'Half Legs Wax', '1 hr 30 mins', 3500, 7),
  ('Waxing', 'Stomach Wax', '1 hr 30 mins', 3000, 8),
  ('Waxing', 'Under Arm Wax', '30 mins', 2000, 9),
  ('Waxing', 'Underarms Wax', '1 hr 30 mins', 2000, 10),
  ('Threading', 'Beard Line Threading', '30 mins', 3000, 11),
  ('Threading', 'Brow Threading', '15 mins', 3500, 12),
  ('Threading', 'Chin Threading', '10 mins', 1500, 13),
  ('Threading', 'Forehead Threading', '20 mins', 2000, 14),
  ('Threading', 'Full Face Threading', '30 mins', 5500, 15),
  ('Threading', 'Sideburns Threading', '20 mins', 3000, 16),
  ('Threading', 'Upper Lip Threading', '15 mins', 1000, 17),
  ('Facial & Other', 'Hydrating Glow Facial', '30 mins', 15000, 18),
  ('Facial & Other', 'Henna Design', '30 mins', 2500, 19),
  ('Bundle', 'Brow & Lip Combo', 'per visit', 4000, 20),
  ('Bundle', 'Smooth Legs & Bikini', 'per visit', 8000, 21),
  ('Bundle', 'Full Face Refresh', 'per visit', 19000, 22)
on conflict (name) do nothing;

alter table services add column if not exists description text;

update services set description = case name
  when 'Back Wax' then 'Smooth, long-lasting hair removal for the full back.'
  when 'Bikini Line Wax' then 'Clean, precise shaping along the bikini line.'
  when 'Full Arm Wax' then 'Hair removal for the entire arm, shoulder to wrist.'
  when 'Full Body Wax' then 'Complete head-to-toe waxing in one extended session.'
  when 'Full Legs Wax' then 'Smooth, hair-free legs from thigh to ankle.'
  when 'Half Arms Wax' then 'Hair removal from elbow to wrist.'
  when 'Half Legs Wax' then 'Hair removal from knee to ankle.'
  when 'Stomach Wax' then 'Gentle hair removal for the abdomen area.'
  when 'Under Arm Wax' then 'Quick, thorough underarm hair removal.'
  when 'Underarms Wax' then 'Thorough underarm hair removal with extra care for sensitive skin.'
  when 'Beard Line Threading' then 'Clean, sharp shaping along the beard line.'
  when 'Brow Threading' then 'Precision eyebrow shaping using traditional threading technique.'
  when 'Chin Threading' then 'Quick, precise hair removal for the chin area.'
  when 'Forehead Threading' then 'Clean hairline shaping along the forehead.'
  when 'Full Face Threading' then 'Complete facial hair removal for a smooth, polished look.'
  when 'Sideburns Threading' then 'Precise shaping and tidying of the sideburn area.'
  when 'Upper Lip Threading' then 'Fast, precise hair removal for the upper lip.'
  when 'Hydrating Glow Facial' then 'A nourishing facial treatment that leaves skin hydrated and glowing.'
  when 'Henna Design' then 'Custom henna application for a beautiful temporary design.'
  when 'Brow & Lip Combo' then 'Brow threading and upper lip threading together in one visit.'
  when 'Smooth Legs & Bikini' then 'Full legs wax and bikini line wax together in one visit.'
  when 'Full Face Refresh' then 'Full face threading paired with a hydrating glow facial.'
end
where description is null;

-- Customer account system

create table if not exists users (
  id serial primary key,
  full_name text not null,
  username text unique not null,
  email text unique not null,
  password_hash text,
  google_id text unique,
  phone text,
  date_of_birth date,
  gender text,
  photo_url text,
  bio text,
  location text,
  education text,
  skills text[] default '{}',
  interests text[] default '{}',
  social_links jsonb default '{}',
  is_private boolean not null default false,
  email_verified boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists sessions (
  id text primary key,
  user_id integer references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

create table if not exists email_verification_tokens (
  token text primary key,
  user_id integer references users(id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists password_reset_tokens (
  token text primary key,
  user_id integer references users(id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists notification_preferences (
  user_id integer primary key references users(id) on delete cascade,
  email_booking_reminders boolean default true,
  email_marketing boolean default false
);

create table if not exists activity_log (
  id serial primary key,
  user_id integer references users(id) on delete cascade,
  action text not null,
  created_at timestamptz default now()
);

alter table bookings add column if not exists user_id integer references users(id);

-- Admin dashboard: appointment status, client CRM, services CRUD flags, reviews, settings

alter table bookings add column if not exists status text not null default 'pending';

alter table services add column if not exists is_featured boolean not null default false;
alter table services add column if not exists is_active boolean not null default true;

create table if not exists clients (
  id serial primary key,
  name text not null,
  email text,
  phone text,
  notes text,
  loyalty_points integer not null default 0,
  created_at timestamptz default now()
);

alter table bookings add column if not exists client_id integer references clients(id);

create table if not exists reviews (
  id serial primary key,
  client_name text not null,
  rating integer not null check (rating between 1 and 5),
  comment text not null,
  is_approved boolean not null default false,
  is_featured boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists feedback (
  id serial primary key,
  name text not null,
  email text,
  message text not null,
  created_at timestamptz default now(),
  is_read boolean not null default false
);

alter table feedback add column if not exists is_approved boolean not null default false;

create table if not exists business_settings (
  key text primary key,
  value jsonb not null
);

insert into business_settings (key, value) values
  ('business_hours', '{"mon_fri": "9am - 8pm", "sat_sun": "10am - 6pm"}'),
  ('general', '{"phone": "(303) 727-0746", "email": "haloaesthetic@hotmail.com", "address": "By appointment — Denver, CO 80203"}')
on conflict (key) do nothing;

-- Backfill: create a client row per distinct contact found in existing bookings,
-- and link client_id on those bookings. Guarded so re-running this script is safe.
insert into clients (name, email, phone)
select distinct on (b.email, b.phone) b.name, b.email, b.phone
from bookings b
where b.client_id is null
  and not exists (select 1 from clients c where c.email = b.email and c.phone = b.phone);

update bookings b
set client_id = c.id
from clients c
where b.client_id is null
  and b.email = c.email
  and b.phone = c.phone;
