-- Garante que a coluna is_pinned existe
ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;

-- Remove políticas antigas de update
DROP POLICY IF EXISTS "Users can update own notes" ON notes;
DROP POLICY IF EXISTS "users can update own notes" ON notes;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON notes;

-- Cria política correta
CREATE POLICY "Users can update own notes"
ON notes
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
