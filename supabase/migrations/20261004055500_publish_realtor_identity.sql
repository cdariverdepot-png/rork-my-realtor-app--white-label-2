-- Publish the owner's public business identity with their permanent invitation.
-- Existing owner UPDATE/SELECT policies restrict rows by auth_user_id.
-- Credentials and ownership columns remain unwritable.
grant update (name, brand_name, monogram) on public.realtors to authenticated;
