import type { ReactNode } from "react";
import type { IconComponent, IconName } from "./types.js";

/**
 * Built-in icons: simple 24×24 stroke SVGs, so the widget needs no icon
 * dependency. Replace any of them via the `icons` prop.
 */
interface SvgIconProps {
    size?: number;
    className?: string;
    title?: string;
}

function svgIcon(displayName: string, children: ReactNode): IconComponent {
    function Icon({ size = 20, className, title }: SvgIconProps) {
        return (
            <svg
                width={size}
                height={size}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={className}
                role={title ? "img" : undefined}
                aria-hidden={title ? undefined : true}
                aria-label={title}
                focusable="false"
            >
                {children}
            </svg>
        );
    }
    Icon.displayName = displayName;
    return Icon;
}

export const defaultIcons: Record<IconName, IconComponent> = {
    send: svgIcon("SendIcon", (
        <>
            <path d="M3 11.5 21 3l-8.5 18-2.5-7.5L3 11.5Z" />
            <path d="M10 13.5 21 3" />
        </>
    )),
    retry: svgIcon("RetryIcon", (
        <>
            <path d="M20 11a8 8 0 1 0-2.3 5.7" />
            <path d="M20 4v7h-7" />
        </>
    )),
    newChat: svgIcon("NewChatIcon", <path d="M12 5v14M5 12h14" />),
    history: svgIcon("HistoryIcon", (
        <>
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5M12 7v5l3 2" />
        </>
    )),
    stop: svgIcon("StopIcon", <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />),
    close: svgIcon("CloseIcon", <path d="M6 6l12 12M18 6 6 18" />),
    chevronUp: svgIcon("ChevronUpIcon", <path d="m6 15 6-6 6 6" />),
    chevronLeft: svgIcon("ChevronLeftIcon", <path d="m15 6-6 6 6 6" />),
    chevronRight: svgIcon("ChevronRightIcon", <path d="m9 6 6 6-6 6" />),
    heart: svgIcon(
        "HeartIcon",
        <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
    ),
    location: svgIcon("LocationIcon", (
        <>
            <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
            <circle cx="12" cy="9.5" r="2.5" />
        </>
    )),
    calendar: svgIcon("CalendarIcon", (
        <>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
        </>
    )),
    car: svgIcon("CarIcon", (
        <>
            <path d="M5 17h14l1-5-2-4H6l-2 4 1 5Z" />
            <path d="M7 8 8.5 5h7L17 8M4 12h16M7 17v2M17 17v2" />
            <circle cx="7.5" cy="14.5" r=".8" fill="currentColor" />
            <circle cx="16.5" cy="14.5" r=".8" fill="currentColor" />
        </>
    )),
    video: svgIcon("VideoIcon", (
        <>
            <rect x="3" y="6" width="13" height="12" rx="2" />
            <path d="m16 10 5-3v10l-5-3" />
        </>
    )),
    googleMeet: svgIcon("GoogleMeetIcon", (
        <>
            <path d="M3 7.2c0-1.2 1-2.2 2.2-2.2H13v14H5.2A2.2 2.2 0 0 1 3 16.8Z" fill="#00AC47" stroke="none" />
            <path d="M13 8.4 17.7 5v14L13 15.6Z" fill="#00832D" stroke="none" />
            <path d="M13 5h4.7L13 9Z" fill="#FFBA00" stroke="none" />
            <path d="M13 15l4.7 4H13Z" fill="#EA4335" stroke="none" />
            <path d="M17.7 8.3 21 6v12l-3.3-2.3Z" fill="#2684FC" stroke="none" />
        </>
    )),
    microsoftTeams: svgIcon("MicrosoftTeamsIcon", (
        <>
            <circle cx="17.5" cy="6" r="2.2" fill="#7B83EB" stroke="none" />
            <circle cx="10.5" cy="5" r="2.7" fill="#5059C9" stroke="none" />
            <path d="M14.5 9h5.2c.7 0 1.3.6 1.3 1.3V16c0 2.2-1.7 4-3.9 4-1 0-1.9-.4-2.6-1Z" fill="#7B83EB" stroke="none" />
            <path d="M7 8h7.5c.8 0 1.5.7 1.5 1.5V17c0 2.2-1.8 4-4 4s-4-1.8-4-4V9Z" fill="#5059C9" stroke="none" />
            <rect x="3" y="7" width="8" height="10" rx="1.2" fill="#4B53BC" stroke="none" />
            <path d="M5 10h4M7 10v5" stroke="white" strokeWidth="1.5" />
        </>
    )),
    zoom: svgIcon("ZoomIcon", (
        <>
            <rect x="2" y="5" width="20" height="14" rx="4" fill="#2D8CFF" stroke="none" />
            <rect x="5" y="9" width="8" height="6" rx="1.5" fill="white" stroke="none" />
            <path d="m13 10.5 4-2v7l-4-2Z" fill="white" stroke="none" />
        </>
    )),
    walk: svgIcon("WalkIcon", (
        <>
            <circle cx="13" cy="4" r="2" />
            <path d="m10 21 2-6-3-3 2-5 4 3 3 1M12 15l4 6M9 12l-4 3" />
        </>
    )),
    building: svgIcon("BuildingIcon", (
        <>
            <rect x="5" y="3" width="14" height="18" rx="1" />
            <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M11 21v-2h2v2" />
        </>
    )),
    area: svgIcon("AreaIcon", <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />),
    rupee: svgIcon("RupeeIcon", <path d="M7 5h10M7 9h10M9 5c5 0 5 8 0 8H7l7 7" />),
    externalLink: svgIcon("ExternalLinkIcon", (
        <>
            <path d="M14 4h6v6M20 4l-9 9" />
            <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </>
    )),
    alert: svgIcon("AlertIcon", (
        <>
            <path d="M12 3 2 20h20L12 3Z" />
            <path d="M12 10v4M12 17h.01" />
        </>
    )),
    check: svgIcon("CheckIcon", <path d="m5 12.5 4.5 4.5L19 7" />),
    info: svgIcon("InfoIcon", (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
        </>
    )),
    sparkles: svgIcon("SparklesIcon", (
        <>
            <path d="m12 3 1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8L12 3Z" />
            <path d="m19 15 .8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8L19 15Z" />
        </>
    )),
    image: svgIcon("ImageIcon", (
        <>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="8.5" cy="9.5" r="1.5" />
            <path d="m21 16-5-5-9 9" />
        </>
    )),
    user: svgIcon("UserIcon", (
        <>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
        </>
    )),
    bot: svgIcon("BotIcon", (
        <>
            <rect x="5" y="8" width="14" height="11" rx="3" />
            <path d="M12 4v4M9.5 13h.01M14.5 13h.01M9.5 16h5" />
        </>
    )),
    share: svgIcon("ShareIcon", (
        <>
            <circle cx="18" cy="5" r="2.5" />
            <circle cx="6" cy="12" r="2.5" />
            <circle cx="18" cy="19" r="2.5" />
            <path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" />
        </>
    )),
    whatsapp: svgIcon("WhatsAppIcon", (
        <>
            <path d="M20.5 11.8a8.5 8.5 0 0 1-12.5 7.5L3.5 20.5l1.3-4.3a8.5 8.5 0 1 1 15.7-4.4z" />
            <path d="M9 8.5c.3-.6.9-.6 1.2 0l.7 1.5c.1.3 0 .6-.2.8l-.5.5c.6 1.2 1.5 2.1 2.7 2.7l.5-.5c.2-.2.5-.3.8-.2l1.5.7c.6.3.6.9 0 1.2-1 .7-2.3.8-3.6.1a8 8 0 0 1-3.4-3.4c-.6-1.2-.5-2.5.3-3.4z" />
        </>
    )),
    mail: svgIcon("MailIcon", (
        <>
            <rect x="3" y="5" width="18" height="14" rx="2.5" />
            <path d="m4 7 8 6 8-6" />
        </>
    )),
    message: svgIcon("MessageIcon", <path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />),
    copy: svgIcon("CopyIcon", (
        <>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V6a2 2 0 0 1 2-2h8" />
        </>
    )),
    phone: svgIcon("PhoneIcon", (
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
    )),
    bed: svgIcon("BedIcon", (
        <>
            <path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 15h18M3 18v2M21 18v2" />
            <path d="M7 9V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
        </>
    )),
    trash: svgIcon("TrashIcon", (
        <>
            <path d="M4 7h16M10 11v6M14 11v6" />
            <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        </>
    )),
    page: svgIcon("PageIcon", (
        <>
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5M9 13h6M9 17h4" />
        </>
    )),
};
