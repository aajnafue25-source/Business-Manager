-- Run this in Supabase SQL Editor (select all, run without RLS)
-- Adds a snapshot of the customer name directly on each sale row,
-- so the sales list/history can show "who bought this" without extra lookups.

alter table sales add column if not exists customer_name text;
