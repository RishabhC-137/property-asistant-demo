-- 002: persistence for streamed replies, idempotent retries and typed blocks.
-- Additive only: existing rows are kept and backfilled; nothing is deleted.

-- Monotonic per-row sequence used for ordering and pagination cursors.
-- Backfilled in chronological order before the identity is attached, so
-- pre-existing rows keep their conversational order.
ALTER TABLE messages ADD COLUMN seq bigint;

WITH ordered AS (
    SELECT id,
           row_number() OVER (
               ORDER BY created_at, CASE role WHEN 'user' THEN 0 ELSE 1 END, id
           ) AS rn
    FROM messages
)
UPDATE messages m SET seq = o.rn FROM ordered o WHERE m.id = o.id;

ALTER TABLE messages ALTER COLUMN seq SET NOT NULL;
ALTER TABLE messages ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY;
SELECT setval(
    pg_get_serial_sequence('messages', 'seq'),
    COALESCE((SELECT max(seq) FROM messages), 0) + 1,
    false
);

ALTER TABLE messages
    ADD COLUMN status                text NOT NULL DEFAULT 'completed',
    -- sha256(hex) of the submitted user text; detects idempotency-key reuse.
    ADD COLUMN request_hash          text,
    -- For assistant messages: the user message being answered.
    ADD COLUMN reply_to_message_id   uuid,
    ADD COLUMN attempt               integer NOT NULL DEFAULT 1,
    ADD COLUMN error                 jsonb,
    ADD COLUMN generation_started_at timestamptz,
    ADD COLUMN completed_at          timestamptz,
    ADD COLUMN updated_at            timestamptz NOT NULL DEFAULT now();

-- Backfill legacy rows so the new constraints hold.
UPDATE messages
SET request_hash = encode(sha256(convert_to(content, 'UTF8')), 'hex')
WHERE role = 'user' AND request_hash IS NULL;

UPDATE messages a
SET reply_to_message_id = u.id
FROM messages u
WHERE a.role = 'assistant'
  AND u.role = 'user'
  AND u.conversation_id = a.conversation_id
  AND u.client_message_id = a.client_message_id
  AND a.reply_to_message_id IS NULL;

UPDATE messages SET completed_at = created_at, updated_at = created_at WHERE completed_at IS NULL;

-- Defaults stay self-consistent: a row inserted with the default status
-- ('completed') also gets a completion time.
ALTER TABLE messages ALTER COLUMN completed_at SET DEFAULT now();

ALTER TABLE messages
    ADD CONSTRAINT messages_seq_key UNIQUE (seq),
    ADD CONSTRAINT messages_status_check
        CHECK (status IN ('pending', 'completed', 'failed')),
    ADD CONSTRAINT messages_user_completed_check
        CHECK (role = 'assistant' OR status = 'completed'),
    ADD CONSTRAINT messages_user_request_hash_check
        CHECK (role <> 'user' OR request_hash IS NOT NULL),
    ADD CONSTRAINT messages_reply_to_check
        CHECK ((role = 'assistant') = (reply_to_message_id IS NOT NULL)),
    ADD CONSTRAINT messages_completed_at_check
        CHECK (status <> 'completed' OR completed_at IS NOT NULL),
    ADD CONSTRAINT messages_attempt_check CHECK (attempt >= 1),
    ADD CONSTRAINT messages_client_message_id_length_check
        CHECK (char_length(client_message_id) BETWEEN 1 AND 128),
    ADD CONSTRAINT messages_reply_to_message_id_fkey
        FOREIGN KEY (reply_to_message_id) REFERENCES messages (id) ON DELETE CASCADE;

CREATE UNIQUE INDEX messages_reply_to_message_id_key
    ON messages (reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;

CREATE INDEX messages_conversation_seq_idx ON messages (conversation_id, seq DESC);

-- Ordered structured blocks of an assistant message.
CREATE TABLE message_blocks (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id     uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
    position       integer NOT NULL CHECK (position >= 0),
    type           text NOT NULL CHECK (type IN (
                       'text',
                       'property_cards',
                       'property_comparison',
                       'clarification',
                       'quick_replies',
                       'lead_capture_form',
                       'site_visit_form'
                   )),
    schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
    data           jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT message_blocks_message_position_key UNIQUE (message_id, position)
);
