-- 008: optional Property Desk account ownership for chat conversations.
-- Existing anonymous conversations remain usable; only newly authenticated
-- conversations receive an owner and become private to that signed-in user.

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS owner_subject text;

CREATE INDEX IF NOT EXISTS conversations_owner_subject_updated_at_idx
    ON conversations (owner_subject, updated_at DESC)
    WHERE owner_subject IS NOT NULL;
