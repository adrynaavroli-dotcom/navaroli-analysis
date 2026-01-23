-- Fix overly permissive INSERT policy - only service role can insert alerts (via edge function)
DROP POLICY IF EXISTS "System can insert alerts" ON public.thesis_alerts;

-- No INSERT policy for regular users - alerts are created by edge functions using service_role
-- The edge function runs with service_role which bypasses RLS