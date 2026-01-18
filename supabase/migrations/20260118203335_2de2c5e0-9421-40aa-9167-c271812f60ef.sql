-- Create page_content table for editable pages
CREATE TABLE public.page_content (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_key text NOT NULL UNIQUE,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.page_content ENABLE ROW LEVEL SECURITY;

-- Anyone can view page content
CREATE POLICY "Anyone can view page content"
ON public.page_content
FOR SELECT
USING (true);

-- Only authenticated users can update (we'll check for admin in code)
CREATE POLICY "Authenticated users can update page content"
ON public.page_content
FOR UPDATE
USING (auth.uid() IS NOT NULL);

-- Only authenticated users can insert
CREATE POLICY "Authenticated users can insert page content"
ON public.page_content
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Trigger for updated_at
CREATE TRIGGER update_page_content_updated_at
BEFORE UPDATE ON public.page_content
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default content for pages
INSERT INTO public.page_content (page_key, content) VALUES
('home', '{
  "hero_title": "Investment Analysis",
  "hero_subtitle": "Institutional-grade equity research with a focus on quality businesses at reasonable valuations.",
  "thesis_section_title": "Thesis Library",
  "footer_text": "This is a portfolio demonstration. Not financial advice."
}'::jsonb),
('about', '{
  "title": "About Investment Analysis",
  "subtitle": "A platform dedicated to providing institutional-grade equity research with a focus on quality businesses at reasonable valuations.",
  "philosophy_title": "Investment Philosophy",
  "philosophy_content": "Our approach centers on identifying high-quality businesses trading at reasonable valuations. We believe that exceptional businesses, purchased at fair prices, will compound wealth over time.",
  "methodology_title": "Research Methodology",
  "methodology_content": "Our research process involves three key steps: Business Analysis, Financial Deep Dive, and Valuation.",
  "disclaimer": "The content on this platform is for educational and informational purposes only. It should not be considered financial advice."
}'::jsonb),
('contact', '{
  "title": "Get in Touch",
  "subtitle": "Have questions about investment analysis? I would love to hear from you.",
  "email": "contact@example.com",
  "linkedin_url": "",
  "open_to_opportunities": true,
  "opportunities_text": "I am currently open to discussing new opportunities and collaborations in investment research and equity analysis."
}'::jsonb);