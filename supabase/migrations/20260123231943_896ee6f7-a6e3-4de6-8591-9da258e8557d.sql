-- Add alert tracking fields to public_thesis_data
ALTER TABLE public.public_thesis_data 
ADD COLUMN IF NOT EXISTS last_alert_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS alert_type TEXT,
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS price_at_last_check NUMERIC;

-- Add admin email to profiles for notifications
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notification_email TEXT;

-- Create alerts log table
CREATE TABLE IF NOT EXISTS public.thesis_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thesis_id UUID REFERENCES public.public_thesis_data(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  alert_type TEXT NOT NULL, -- 'fair_value_reached', 'price_drop', 'needs_review'
  ticker TEXT NOT NULL,
  message TEXT NOT NULL,
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  email_sent BOOLEAN DEFAULT false,
  acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.thesis_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies for thesis_alerts
CREATE POLICY "Users can view their own alerts"
ON public.thesis_alerts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own alerts"
ON public.thesis_alerts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "System can insert alerts"
ON public.thesis_alerts FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can delete their own alerts"
ON public.thesis_alerts FOR DELETE
USING (auth.uid() = user_id);