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
  message text not null,
  created_at timestamptz default now()
);

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
