import type { IconsInput } from "@property-assistant/chat-ui";
import {
    BadgeCheck,
    Bot,
    Building2,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    ExternalLink,
    Heart,
    Image,
    IndianRupee,
    Info,
    MapPin,
    RotateCw,
    Ruler,
    SendHorizontal,
    Sparkles,
    SquarePen,
    TriangleAlert,
    User,
    X,
} from "lucide-react";

/**
 * Example icon configurations. Any library works the same way:
 *   { library: <object of icon components>, names: { <widget icon>: "<export name>" } }
 *
 * Import only the icons you use (as below) rather than `import * as …`,
 * so the bundler can drop the rest of the library.
 */
const lucideLibrary = {
    BadgeCheck, Bot, Building2, CalendarDays, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, Heart, Image, IndianRupee, Info,
    MapPin, RotateCw, Ruler, SendHorizontal, Sparkles, SquarePen, TriangleAlert, User, X,
};

export const ICON_SETS: Record<string, { label: string; icons: IconsInput | undefined }> = {
    builtin: { label: "Built-in (no dependency)", icons: undefined },
    lucide: {
        label: "lucide-react",
        icons: {
            library: lucideLibrary,
            names: {
                send: "SendHorizontal",
                stop: "Square",
                retry: "RotateCw",
                newChat: "SquarePen",
                close: "X",
                chevronUp: "ChevronUp",
                chevronLeft: "ChevronLeft",
                chevronRight: "ChevronRight",
                heart: "Heart",
                location: "MapPin",
                calendar: "CalendarDays",
                building: "Building2",
                area: "Ruler",
                rupee: "IndianRupee",
                externalLink: "ExternalLink",
                alert: "TriangleAlert",
                check: "BadgeCheck",
                info: "Info",
                sparkles: "Sparkles",
                image: "Image",
                user: "User",
                bot: "Bot",
            },
            props: { strokeWidth: 1.75 },
        },
    },
    lucidePartial: {
        label: "lucide-react (send + bot only, rest built-in)",
        icons: { send: SendHorizontal, bot: Bot },
    },
};
