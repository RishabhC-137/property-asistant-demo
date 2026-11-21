-- 007: allow the project_map block (a project's position on a map).
-- Mirrors BLOCK_TYPES (packages/contracts/src/blocks.ts) — keep them in sync.

ALTER TABLE message_blocks DROP CONSTRAINT message_blocks_type_check;

ALTER TABLE message_blocks
    ADD CONSTRAINT message_blocks_type_check CHECK (type IN (
        'text',
        'property_cards',
        'property_gallery',
        'project_map',
        'payment_plan',
        'property_comparison',
        'clarification',
        'quick_replies',
        'lead_capture_form',
        'site_visit_form'
    ));
