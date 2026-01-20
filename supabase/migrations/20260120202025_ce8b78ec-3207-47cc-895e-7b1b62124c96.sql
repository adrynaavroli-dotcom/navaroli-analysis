-- Add unique constraint on workspace_id for upsert functionality
ALTER TABLE public.public_thesis_data 
ADD CONSTRAINT public_thesis_data_workspace_id_key UNIQUE (workspace_id);