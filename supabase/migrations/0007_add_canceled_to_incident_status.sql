-- 0007_add_canceled_to_incident_status.sql
-- Add 'canceled' to the incident_status enum so that admins can cancel incidents.

-- In Postgres, we can append a value to an existing enum type.
-- This operation cannot be executed inside a transaction block (like a multi-statement migration) in some environments,
-- but standard Supabase migrations handle ALTER TYPE ADD VALUE correctly.
ALTER TYPE public.incident_status ADD VALUE IF NOT EXISTS 'canceled';
