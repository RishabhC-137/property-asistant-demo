-- 003: drop messages.request_hash.
-- Duplicate submissions are now detected by comparing the stored `content`
-- with the incoming (trimmed) message directly; the hash was redundant.
-- The column only held values derived from `content`, so no data is lost.

ALTER TABLE messages
    DROP CONSTRAINT messages_user_request_hash_check,
    DROP COLUMN request_hash;
