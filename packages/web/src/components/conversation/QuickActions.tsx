import { QUICK_ACTIONS } from '@clawwarden/shared';

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
            padding: '0.75rem 1.5rem',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
        }}>
            {QUICK_ACTIONS.map((action) => (
                <button
                    key={action.id}
                    onClick={() => onAction(action.prompt)}
                    disabled={disabled}
                    className="btn-unified ghost"
                    style={{
                        padding: '0.375rem 0.75rem',
                        fontSize: '0.75rem',
                        background: 'var(--bg-card)',
                    }}
                    title={action.prompt}
                >
                    <span>{action.icon}</span>
                    <span>{action.label}</span>
                </button>
            ))}
        </div>
    );
}
