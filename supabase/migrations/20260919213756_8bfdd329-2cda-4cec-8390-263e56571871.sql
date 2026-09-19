ALTER VIEW public.public_thesis_data_view SET (security_invoker = on);

CREATE POLICY "Anyone can view published thesis data"
ON public.public_thesis_data
FOR SELECT
USING (published_at IS NOT NULL);

GRANT SELECT (
  id, company_name, ticker, fair_value, current_price, upside_percent, wacc,
  terminal_growth, implied_growth_rate, growth_margins_data, capital_efficiency_data,
  capital_allocation_data, valuation_context_data, export_config, created_at, updated_at,
  published_at, kpi_data, sensitivity_matrix, dcf_projections, base_fcf, cash, total_debt,
  shares_outstanding, analyst_notes, alert_type
) ON public.public_thesis_data TO anon;