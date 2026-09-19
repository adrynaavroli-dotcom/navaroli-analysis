ALTER VIEW public.public_thesis_data_view SET (security_invoker = off);
REVOKE ALL ON public.public_thesis_data FROM anon;
GRANT SELECT ON public.public_thesis_data_view TO anon, authenticated;

INSERT INTO public.page_content (page_key, content)
VALUES ('site_visibility', '{"credit_public": false}'::jsonb)
ON CONFLICT (page_key) DO NOTHING;