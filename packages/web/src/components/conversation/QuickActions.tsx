import { QUICK_ACTIONS } from '@antiwarden/shared';

interface QuickActionsProps {
    onAction: (prompt: string) => void;
    disabled?: boolean;
}

export function QuickActions({ onAction, disabled }: QuickActionsProps) {
    return (
        <div className="quick-actions" style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
        }}>
            {QUICK_ACTIONS.map((action) => (
                <button
                    key={action.id}
                    onClick={() => onAction(action.prompt)}
                    disabled={disabled}
                    className="quick-action-btn"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.375rem 0.75rem',
                        fontSize: '0.75rem',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '20px',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.5 : 1,
                        transition: 'all 0.2s',
                    }}
                    title={action.prompt}
                    onMouseEnter={(e) => {
                        if (!disabled) {
                            e.currentTarget.style.borderColor = 'var(--accent)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-color)';
                    }}
                >
                    <span>{action.icon}</span>
                    <span>{action.label}</span>
                </button>
            ))}
        </div>
    );
}
