-- =============================================
-- FIX: Enhanced thesis_purchases RLS policy
-- Ensure users can only access purchases for theses they own OR published theses
-- =============================================

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view their own purchases" ON public.thesis_purchases;

-- Create enhanced policy that checks thesis ownership
CREATE POLICY "Users can view their own purchases"
ON public.thesis_purchases
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  AND (
    -- User owns the thesis
    EXISTS (
      SELECT 1 FROM public.theses 
      WHERE theses.id = thesis_purchases.thesis_id 
      AND theses.user_id = auth.uid()
    )
    OR
    -- Thesis is published (public)
    EXISTS (
      SELECT 1 FROM public.theses 
      WHERE theses.id = thesis_purchases.thesis_id 
      AND theses.is_published = true
    )
  )
);

-- Also update INSERT policy to ensure users can only create purchases for their own or published theses
DROP POLICY IF EXISTS "Users can create their own purchases" ON public.thesis_purchases;

CREATE POLICY "Users can create their own purchases"
ON public.thesis_purchases
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    EXISTS (
      SELECT 1 FROM public.theses 
      WHERE theses.id = thesis_purchases.thesis_id 
      AND theses.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.theses 
      WHERE theses.id = thesis_purchases.thesis_id 
      AND theses.is_published = true
    )
  )
);