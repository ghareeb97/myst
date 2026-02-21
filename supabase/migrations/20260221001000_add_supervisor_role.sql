-- Add supervisor role to role_enum
ALTER TYPE public.role_enum ADD VALUE IF NOT EXISTS 'supervisor';
