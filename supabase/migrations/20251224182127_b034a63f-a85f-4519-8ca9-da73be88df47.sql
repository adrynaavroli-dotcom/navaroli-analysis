-- Create enum for thesis direction
CREATE TYPE public.thesis_direction AS ENUM ('long', 'short');

-- Create enum for investment strategy
CREATE TYPE public.investment_strategy AS ENUM ('value', 'growth', 'compounder', 'turnaround', 'dividend');

-- Create enum for market cap category
CREATE TYPE public.market_cap_category AS ENUM ('mega', 'large', 'mid', 'small', 'micro');

-- Create theses table
CREATE TABLE public.theses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  company_name TEXT NOT NULL,
  sector TEXT NOT NULL,
  direction thesis_direction NOT NULL DEFAULT 'long',
  strategy investment_strategy NOT NULL DEFAULT 'growth',
  market_cap_category market_cap_category NOT NULL DEFAULT 'large',
  
  -- Price data
  current_price DECIMAL(12, 2) NOT NULL,
  target_price DECIMAL(12, 2),
  currency TEXT NOT NULL DEFAULT 'USD',
  
  -- Key metrics (stored as JSON for flexibility)
  metrics JSONB DEFAULT '{}',
  
  -- Sparkline data (array of price points)
  sparkline_data JSONB DEFAULT '[]',
  
  -- Content sections (Markdown)
  executive_summary TEXT,
  investment_case TEXT,
  valuation TEXT,
  risks TEXT,
  
  -- Chart data for visualizations
  chart_data JSONB DEFAULT '{}',
  
  -- Metadata
  analysis_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.theses ENABLE ROW LEVEL SECURITY;

-- Public can read published theses
CREATE POLICY "Anyone can view published theses"
ON public.theses
FOR SELECT
USING (is_published = true);

-- Authenticated users can view their own theses
CREATE POLICY "Users can view their own theses"
ON public.theses
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Authenticated users can create theses
CREATE POLICY "Users can create their own theses"
ON public.theses
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Authenticated users can update their own theses
CREATE POLICY "Users can update their own theses"
ON public.theses
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Authenticated users can delete their own theses
CREATE POLICY "Users can delete their own theses"
ON public.theses
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Create profiles table for user information
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  title TEXT DEFAULT 'Equity Research Analyst',
  bio TEXT,
  linkedin_url TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can view profiles (public portfolio)
CREATE POLICY "Profiles are viewable by everyone"
ON public.profiles
FOR SELECT
USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own profile
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_theses_updated_at
BEFORE UPDATE ON public.theses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (new.id, new.raw_user_meta_data ->> 'full_name');
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create indexes for performance
CREATE INDEX idx_theses_ticker ON public.theses(ticker);
CREATE INDEX idx_theses_sector ON public.theses(sector);
CREATE INDEX idx_theses_direction ON public.theses(direction);
CREATE INDEX idx_theses_is_published ON public.theses(is_published);
CREATE INDEX idx_theses_user_id ON public.theses(user_id);
CREATE INDEX idx_theses_analysis_date ON public.theses(analysis_date DESC);