-- Run this in Supabase SQL Editor
-- (Select all, paste, click Run without RLS)

create table if not exists users (
  id bigint primary key,
  username text unique not null,
  password_hash text not null
);

create table if not exists settings (
  id bigint primary key,
  "businessName" text,
  address text,
  phone text,
  gst text,
  note text,
  "posWidthMm" numeric,
  "nameFontSize" numeric,
  "priceFontSize" numeric,
  "barcodeWidth" numeric,
  "barcodeHeight" numeric
);

create table if not exists customers (
  id bigint primary key,
  name text,
  phone text,
  address text
);

-- Add missing columns to existing tables if needed
alter table sales add column if not exists bill_id bigint;
alter table sales add column if not exists bill_no bigint;
alter table sales add column if not exists customer_id bigint;
alter table dues add column if not exists customer_id bigint;
alter table dues add column if not exists bill_id bigint;
alter table dues add column if not exists bill_no bigint;
alter table due_paid add column if not exists customer_id bigint;

-- Add nextBillNo to meta if not exists
insert into meta (key, value) values ('nextBillNo', '1') on conflict (key) do nothing;
