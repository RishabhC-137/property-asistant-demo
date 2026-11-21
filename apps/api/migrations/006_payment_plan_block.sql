-- 006: allow the payment_plan block (a project's payment stages, built from source data).
-- Mirrors BLOCK_TYPES (packages/contracts/src/blocks.ts) — keep them in sync.

ALTER TABLE message_blocks DROP CONSTRAINT message_blocks_type_check;

ALTER TABLE message_blocks
    ADD CONSTRAINT message_blocks_type_check CHECK (type IN (
        'text',
        'property_cards',
        'property_gallery',
        'payment_plan',
        'property_comparison',
        'clarification',
        'quick_replies',
        'lead_capture_form',
        'site_visit_form'
    ));
