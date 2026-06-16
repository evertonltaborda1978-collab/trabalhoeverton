-- Remove política antiga de update se existir
DROP POLICY IF EXISTS "Users can update own notes" ON notes;

-- Cria política correta permitindo update incluindo is_pinned
CREATE POLICY "Users can update own notes"
ON notes
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
