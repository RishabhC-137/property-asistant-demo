import type { ChatBlock } from "@property-assistant/contracts";
import { ClarificationBlock } from "./ClarificationBlock.js";
import { FormBlock } from "./FormBlock.js";
import { PaymentPlanBlock } from "./PaymentPlanBlock.js";
import { ProjectDetailsBlock } from "./ProjectDetailsBlock.js";
import { ProjectMapBlock } from "./ProjectMapBlock.js";
import { PropertyCardsBlock } from "./PropertyCardsBlock.js";
import { PropertyComparisonBlock } from "./PropertyComparisonBlock.js";
import { PropertyGalleryBlock } from "./PropertyGalleryBlock.js";
import { QuickRepliesBlock } from "./QuickRepliesBlock.js";
import { TextBlock } from "./TextBlock.js";
import type { BlockActions, BlockRenderer, BlockRenderers } from "./types.js";

/**
 * Default renderer for every block type. The mapped type makes this a
 * compile error if a new block type is added to the contracts without a renderer.
 */
export const defaultBlockRenderers: BlockRenderers = {
    text: TextBlock,
    property_cards: PropertyCardsBlock,
    property_gallery: PropertyGalleryBlock,
    project_map: ProjectMapBlock,
    project_details: ProjectDetailsBlock,
    payment_plan: PaymentPlanBlock,
    property_comparison: PropertyComparisonBlock,
    clarification: ClarificationBlock,
    quick_replies: QuickRepliesBlock,
    lead_capture_form: FormBlock,
    site_visit_form: FormBlock,
};

export function BlockView({
    block,
    actions,
    renderers,
}: {
    block: ChatBlock;
    actions: BlockActions;
    renderers: BlockRenderers;
}) {
    const Renderer = renderers[block.type] as BlockRenderer | undefined;
    if (!Renderer) {
        // A block type this UI version doesn't know yet — skip it rather than crash.
        return null;
    }
    return <Renderer block={block} actions={actions} />;
}
