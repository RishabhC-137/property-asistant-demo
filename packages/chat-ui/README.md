# @property-assistant/chat-ui

An embeddable React chat widget for the chatbot API. It streams replies over SSE and renders every response block type. Icons, themes and block renderers are all **pluggable**.

```tsx
import { ChatWidget } from "@property-assistant/chat-ui";
import "@property-assistant/chat-ui/styles.css";

<div style={{ height: 640 }}>
  <ChatWidget apiBaseUrl="https://api.example.com/api/v1" />
</div>
```

The widget fills its container, so give the parent element a height.

## Props

| Prop | Default | What it does |
|---|---|---|
| `apiBaseUrl` | `"/api/v1"` | The base URL of the chatbot API. |
| `api` | — | A custom `ChatApi` client (for tests or another transport). Overrides `apiBaseUrl`. |
| `theme` | `"auto"` | `"light"`, `"dark"`, `"auto"` (follows the OS), a name from `themes`, or token overrides. |
| `themes` | — | Your own named themes. |
| `icons` | built-in SVGs | Any icon library, or components directly. |
| `blockRenderers` | built-in | Replace how specific block types render. |
| `title`, `subtitle`, `placeholder`, `welcomeMessage`, `suggestions` | sensible defaults | Text shown in the widget. |
| `storageKey` | `"rec-chat:conversationId"` | The localStorage key used to resume a conversation. `null` turns this off. |
| `onEvent` | — | Called for every request and streamed event. Useful for debug panels and analytics. |
| `onClose` | — | When set, the header shows a close button (for popup embeds). |
| `className`, `style` | — | Applied to the root element. |

## Icons: use any library

The widget uses these semantic icon names: `send`, `stop`, `retry`, `newChat`, `close`, `chevronUp`, `chevronLeft`, `chevronRight`, `heart`, `location`, `calendar`, `building`, `area`, `rupee`, `externalLink`, `alert`, `check`, `info`, `sparkles`, `image`, `user` and `bot`.

**Option 1: a library plus export names.** This is the `{ library, names }` form.

```tsx
import { SendHorizontal, RotateCw, MapPin, Bot } from "lucide-react";

<ChatWidget
  icons={{
    library: { SendHorizontal, RotateCw, MapPin, Bot },
    names: { send: "SendHorizontal", retry: "RotateCw", location: "MapPin", bot: "Bot" },
    props: { strokeWidth: 1.75 },          // optional, applied to every icon from this library
  }}
/>
```

**Option 2: components directly.**

```tsx
import { FiSend, FiRefreshCw } from "react-icons/fi";
<ChatWidget icons={{ send: FiSend, retry: FiRefreshCw }} />

import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
<ChatWidget icons={{ send: PaperAirplaneIcon }} />
```

- Any name you leave out uses the built-in icon.
- An unknown export name logs a warning and also falls back to the built-in icon.
- Each icon receives `size`, `width`, `height` and `className`, so lucide, react-icons, Heroicons, Phosphor and Tabler all work without adapters.
- Import only the icons you use rather than `import * as Icons`, so the bundler can drop the rest of the library.

## Themes

Every colour, font and radius is a CSS variable (`--rec-color-primary`, `--rec-radius`, …). The `theme` prop sets them.

```tsx
<ChatWidget theme="dark" />
<ChatWidget theme="auto" />                                           // follows the OS setting, live
<ChatWidget theme={{ base: "light", colorPrimary: "#0047AB" }} />     // a one-off override

// Named themes, which can build on each other:
<ChatWidget
  theme="brandNight"
  themes={{
    brand:      { base: "light", colorPrimary: "#0047AB", radius: "8px" },
    brandNight: { base: "brand", colorBackground: "#0B1020", colorText: "#E6E9F2" },
  }}
/>
```

The tokens are:
- `colorPrimary`, `colorOnPrimary`
- `colorBackground`, `colorSurface`, `colorSurfaceMuted`
- `colorText`, `colorTextMuted`, `colorBorder`
- `colorUserBubble`, `colorOnUserBubble`, `colorAssistantBubble`, `colorOnAssistantBubble`
- `colorDanger`, `colorDangerSurface`, `colorNotice`, `colorNoticeSurface`, `colorFocus`
- `fontFamily`, `fontSize`, `radius`, `radiusSmall`, `shadow`

Dark mode (`color-scheme` for inputs and scrollbars) is detected from `colorBackground`. All styles are scoped under `.rec-chat` with `rec-` class names, so they won't clash with the host page's CSS.

## Custom block renderers

```tsx
import type { BlockProps } from "@property-assistant/chat-ui";

function MyCards({ block, actions }: BlockProps<"property_cards">) {
  return <MyCarousel items={block.data.items} onAsk={(q) => actions.sendMessage(q)} />;
}

<ChatWidget blockRenderers={{ property_cards: MyCards }} />
```

The built-in renderers are declared as a mapped type over every block type. Adding a block type to `@property-assistant/contracts` without a renderer is therefore a compile error.

## Building your own layout

Everything is exported separately:
- `useChat` (state plus send, retry and load-older)
- `MessageList`, `Composer`, `ChatHeader`
- `createChatApi` and the SSE parser, which don't depend on React
- `Icon`, `IconProvider` and `resolveIcons`
- `resolveTheme` and `themeToCssVars`

## How the layers fit

```
api/       client.ts, sse.ts        HTTP + SSE parsing (no React)
state/     chatReducer.ts           pure state transitions (unit-tested)
           useChat.ts               the hook: bootstraps, sends, retries, pages history
blocks/    one file per block type + registry
icons/     built-in SVGs, library resolver, <Icon>
theme/     tokens, presets, resolver → CSS variables
components/ ChatWidget and its parts
```

Connecting a real AI provider is a **backend-only** change. The widget only depends on the SSE contract (`message.started`, `text.delta`, `block`, `message.completed`, `message.error`).

## Tests

```bash
npm test -w @property-assistant/chat-ui
```

These cover:
- the SSE parser, including chunk splits in the middle of multi-byte characters
- the API client
- the reducer
- themes and formatting
- server-rendered component tests: every block type, a real `lucide-react` icon set, custom themes and overriding a renderer
