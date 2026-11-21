import type {
    BlockOf,
    BlockType,
    CardQuery,
    LeadCaptureFormBlock,
    PropertyPage,
    SiteVisitFormBlock,
} from "@property-assistant/contracts";
import type { ReactNode } from "react";

/** What a block can ask the chat to do. */
export interface BlockActions {
    /** Sends text as the next user message (used by quick replies). */
    sendMessage: (text: string) => void;
    /** True while a reply is in progress — interactive blocks should disable themselves. */
    busy: boolean;
    /** Loads more cards for a search (no model call). Absent: cards offer no "Show more". */
    loadMoreProperties?: (query: CardQuery, page: number, limit: number) => Promise<PropertyPage>;
    /** Opens a form in the step-by-step panel. Absent: forms render inline in the reply. */
    openForm?: (block: LeadCaptureFormBlock | SiteVisitFormBlock) => void;
    /** True once the form was sent and confirmed in this tab. */
    formSent?: (block: LeadCaptureFormBlock | SiteVisitFormBlock) => boolean;
    /** True once the visitor explicitly cancelled this form in this tab. */
    formCancelled?: (block: LeadCaptureFormBlock | SiteVisitFormBlock) => boolean;
    /** Adds or removes a project from the next prompt's context. */
    toggleProjectContext?: (project: { id: string; name: string }) => void;
    isProjectContext?: (id: string) => boolean;
}

export interface BlockProps<T extends BlockType = BlockType> {
    block: BlockOf<T>;
    actions: BlockActions;
}

export type BlockRenderer<T extends BlockType = BlockType> = (props: BlockProps<T>) => ReactNode;

/** One renderer per block type. Pass a partial map to the widget to override some. */
export type BlockRenderers = { [K in BlockType]: BlockRenderer<K> };
