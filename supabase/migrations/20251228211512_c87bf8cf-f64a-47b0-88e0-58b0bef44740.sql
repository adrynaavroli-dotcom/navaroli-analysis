-- Create table for tracking purchase transactions
CREATE TABLE public.thesis_purchases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thesis_id UUID NOT NULL REFERENCES public.theses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  shares NUMERIC NOT NULL CHECK (shares > 0),
  price_per_share NUMERIC NOT NULL CHECK (price_per_share > 0),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.thesis_purchases ENABLE ROW LEVEL SECURITY;

-- Users can only view their own purchases
CREATE POLICY "Users can view their own purchases"
ON public.thesis_purchases
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own purchases
CREATE POLICY "Users can create their own purchases"
ON public.thesis_purchases
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own purchases
CREATE POLICY "Users can update their own purchases"
ON public.thesis_purchases
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own purchases
CREATE POLICY "Users can delete their own purchases"
ON public.thesis_purchases
FOR DELETE
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_thesis_purchases_updated_at
BEFORE UPDATE ON public.thesis_purchases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_thesis_purchases_thesis_id ON public.thesis_purchases(thesis_id);
CREATE INDEX idx_thesis_purchases_user_id ON public.thesis_purchases(user_id);