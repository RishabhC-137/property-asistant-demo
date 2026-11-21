// Main component
export { ChatWidget, type ChatWidgetProps, type PageContent } from "./components/ChatWidget.js";
export type { KnownUser } from "./components/AskPanel.js";

// Building blocks for custom layouts
export { ChatHeader } from "./components/ChatHeader.js";
export { Composer } from "./components/Composer.js";
export { MessageList } from "./components/MessageList.js";
export { MessageBubble } from "./components/MessageBubble.js";
export { Notice } from "./components/Notice.js";
export { useChat, type ChatDebugEvent, type ConversationSummary, type UseChatOptions, type UseChatResult } from "./state/useChat.js";
export { chatReducer, initialChatState, isBusy, type ChatState, type UiMessage } from "./state/chatReducer.js";

// API client (no React)
export { createChatApi, ChatApiError, type ChatApi, type ClientErrorCode } from "./api/client.js";
export { parseSseChunk, readSseStream, type RawSseEvent } from "./api/sse.js";

// Blocks
export { defaultBlockRenderers, BlockView } from "./blocks/registry.js";
export { PropertyCard } from "./blocks/PropertyCard.js";
export type { BlockActions, BlockProps, BlockRenderer, BlockRenderers } from "./blocks/types.js";

// Icons
export { Icon, IconProvider } from "./icons/Icon.js";
export { defaultIcons } from "./icons/defaultIcons.js";
export { fromIconLibrary, resolveIcons } from "./icons/resolveIcons.js";
export {
    ICON_NAMES,
    type IconComponent,
    type IconLibraryConfig,
    type IconName,
    type IconSet,
    type IconsInput,
} from "./icons/types.js";

// Themes
export {
    builtInThemes,
    darkTheme,
    lightTheme,
    resolveTheme,
    themeToCssVars,
    type ThemeDefinition,
    type ThemeInput,
    type ThemeTokens,
} from "./theme/theme.js";

// Formatting helpers
export { formatDate, formatInr, formatMonthYear, formatPriceRange, formatPriceRangeShort, formatSize } from "./lib/format.js";
export { parseRichText, RichText, type RichTextBlock } from "./lib/richText.js";
export { WishlistContext, useWishlisted, type WishlistAdapter, type WishlistProject } from "./lib/wishlist.js";
export { declineLocation, formatDistance, requestLocation, useUserLocation, type LocationStatus, type UserLocation } from "./lib/userLocation.js";
