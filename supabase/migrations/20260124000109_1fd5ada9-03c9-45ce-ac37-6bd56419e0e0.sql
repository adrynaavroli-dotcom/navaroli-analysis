-- Fix 1: Profiles table - restrict SELECT to own profile only
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = user_id);

-- Fix 2: Public thesis data - create a secure view that excludes user identifiers
-- First, create a public view that hides sensitive user data
CREATE OR REPLACE VIEW public.public_thesis_data_view
WITH (security_invoker = on) AS
SELECT 
  id,
  company_name,
  ticker,
  fair_value,
  current_price,
  upside_percent,
  wacc,
  terminal_growth,
  implied_growth_rate,
  growth_margins_data,
  capital_efficiency_data,
  capital_allocation_data,
  valuation_context_data,
  export_config,
  created_at,
  updated_at,
  published_at,
  kpi_data,
  sensitivity_matrix,
  dcf_projections,
  base_fcf,
  cash,
  total_debt,
  shares_outstanding,
  analyst_notes,
  alert_type
FROM public.public_thesis_data
WHERE published_at IS NOT NULL;

-- Update the public SELECT policy to be more restrictive
-- Users can only view their own data OR use the view for public access
DROP POLICY IF EXISTS "Anyone can view published thesis data" ON public.public_thesis_data;

-- Only owners can directly query the table
CREATE POLICY "Only owners can view their thesis data directly"
ON public.public_thesis_data
FOR SELECT
USING (auth.uid() = user_id);