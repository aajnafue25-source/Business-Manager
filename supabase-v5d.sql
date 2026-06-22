-- Run in Supabase SQL Editor → Run without RLS

-- Categories
create table if not exists categories (
  id bigint primary key,
  user_id bigint not null,
  name text not null
);

-- Brands  
create table if not exists brands (
  id bigint primary key,
  user_id bigint not null,
  name text not null
);

-- Add category + brand to products (snapshot names for fast display)
alter table products add column if not exists category_id bigint;
alter table products add column if not exists brand_id bigint;
alter table products add column if not exists category_name text;
alter table products add column if not exists brand_name text;
