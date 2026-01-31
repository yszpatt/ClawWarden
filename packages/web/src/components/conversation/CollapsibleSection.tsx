import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleSectionProps {
    title: string;
    isExpanded?: boolean;
    onToggle?: (expanded: boolean) => void;
    children: React.ReactNode;
}

export function CollapsibleSection({ title, isExpanded: controlledExpanded, onToggle, children }: CollapsibleSectionProps) {
    const [internalExpanded, setInternalExpanded] = useState(false);

    const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

    const handleToggle = () => {
        const newState = !isExpanded;
        if (onToggle) {
            onToggle(newState);
        } else {
            setInternalExpanded(newState);
        }
    };

    return (
        <details
            className="collapsible-section"
            style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                margin: '0.5rem 0',
                overflow: 'hidden',
            }}
            open={isExpanded}
        >
            <summary
                onClick={(e) => {
                    e.preventDefault();
                    handleToggle();
                }}
                style={{
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                }}
            >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {title}
            </summary>
            <div style={{
                padding: '0.5rem 1rem',
                borderTop: '1px solid var(--border-color)',
            }}>
                {children}
            </div>
        </details>
    );
}
