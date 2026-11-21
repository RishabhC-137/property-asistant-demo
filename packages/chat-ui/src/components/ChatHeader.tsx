import { Icon } from "../icons/Icon.js";

interface ChatHeaderProps {
    title: string;
    subtitle?: string;
    logoUrl?: string;
    onNewChat: () => void;
    onHistory?: () => void;
    onClose?: () => void;
    busy: boolean;
}

export function ChatHeader({ title, subtitle, logoUrl, onNewChat, onHistory, onClose, busy }: ChatHeaderProps) {
    return (
        <header className="rec-header">
            {logoUrl ? <img className="rec-header__logo" src={logoUrl} alt="" /> : <div className="rec-header__avatar rec-ai-avatar" aria-hidden="true"><Icon name="building" size={20} /></div>}
            <div className="rec-header__titles">
                <div className="rec-header__name">
                    <h2>{title}</h2>
                </div>
                {subtitle && (
                    <div className="rec-header__meta">
                        <p>{subtitle}</p>
                    </div>
                )}
            </div>
            <div className="rec-header__actions">
                {onHistory && (
                    <button type="button" className="rec-icon-button" onClick={onHistory} disabled={busy} aria-label="Your chats" title="Chat history">
                        <Icon name="history" size={18} />
                    </button>
                )}
                <button type="button" className="rec-icon-button" onClick={onNewChat} disabled={busy} aria-label="Start a new chat" title="New chat">
                    <Icon name="newChat" size={18} />
                </button>
                {onClose && (
                    <button type="button" className="rec-icon-button" onClick={onClose} aria-label="Close chat" title="Close">
                        <Icon name="close" size={18} />
                    </button>
                )}
            </div>
        </header>
    );
}
