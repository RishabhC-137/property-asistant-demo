-- 004: enforce the user-message length limit in the database as well as the API.
-- Mirrors MAX_MESSAGE_LENGTH (packages/contracts/src/api.ts) — keep them in sync.
-- Assistant messages are not limited here; their text is bounded per block.

ALTER TABLE messages
    ADD CONSTRAINT messages_user_content_length_check
        CHECK (role <> 'user' OR char_length(content) BETWEEN 1 AND 4000);
