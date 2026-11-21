-- 001: create tables — the schema as it existed before migrations were introduced.
-- Uses IF NOT EXISTS so it is a no-op on databases created by hand earlier,
-- and creates the same tables on a fresh database.

CREATE TABLE IF NOT EXISTS conversations (
    id         uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
    client_message_id text NOT NULL,
    role              text NOT NULL CHECK (role IN ('user', 'assistant')),
    content           text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (conversation_id, client_message_id, role)
);
