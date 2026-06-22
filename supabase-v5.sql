-- Run this in Supabase SQL Editor (select all, run without RLS)

-- Units for products (grocery support)
alter table products add column if not exists unit text default 'pcs';

-- Suppliers
create table if not exists suppliers (
  id bigint primary key,
  user_id bigint not null,
  name text,
  phone text,
  address text
);

-- Purchases (header) + purchase items
create table if not exists purchases (
  id bigint primary key,
  user_id bigint not null,
  supplier_id bigint,
  supplier_name text,
  date text,
  purchase_no bigint,
  total numeric default 0,
  amount_paid numeric default 0,
  due_amount numeric default 0,
  note text
);

create table if not exists purchase_items (
  id bigint primary key,
  user_id bigint not null,
  purchase_id bigint not null,
  product_id bigint,
  description text,
  quantity numeric,
  unit_cost numeric,
  amount numeric
);

-- Purchase returns
create table if not exists purchase_returns (
  id bigint primary key,
  user_id bigint not null,
  purchase_id bigint,
  supplier_id bigint,
  supplier_name text,
  product_id bigint,
  description text,
  date text,
  quantity numeric,
  unit_cost numeric,
  amount numeric,
  note text
);

-- Sales returns
create table if not exists sales_returns (
  id bigint primary key,
  user_id bigint not null,
  sale_id bigint,
  bill_id bigint,
  bill_no bigint,
  product_id bigint,
  customer_id bigint,
  description text,
  date text,
  quantity numeric,
  unit_price numeric,
  amount numeric,
  note text
);

-- Supplier dues (what we owe suppliers) - separate from customer dues
create table if not exists supplier_dues (
  id bigint primary key,
  user_id bigint not null,
  supplier_id bigint,
  party text,
  date text,
  amount numeric,
  note text
);
create table if not exists supplier_due_paid (
  id bigint primary key,
  user_id bigint not null,
  supplier_id bigint,
  party text,
  date text,
  amount numeric,
  note text
);

-- Meta counters for purchase numbering
insert into meta (key, value) values ('nextPurchaseNo', '1') on conflict (key) do nothing;

-- Add phone to sales (snapshot of customer phone at time of sale, for bill printing)
alter table sales add column if not exists customer_phone text;
