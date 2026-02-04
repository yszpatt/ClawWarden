import { useState } from 'react';
import type { StructuredOutput, PlanOutput, DevelopmentOutput, TestingOutput } from '@clawwarden/shared';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface StructuredOutputProps {
    outputs: StructuredOutput | StructuredOutput[];
}

export function StructuredOutputViewer({ outputs }: StructuredOutputProps) {
    const list = Array.isArray(outputs) ? outputs : outputs ? [outputs] : [];

    if (list.length === 0) {
        return (
            <div style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                background: 'var(--bg-secondary)',
                borderRadius: '12px',
                border: '1px dashed var(--border-color)'
            }}>
                暂无总结数据
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
            {list.map((output, idx) => (
                <SingleOutputViewer key={idx} output={output} defaultExpanded={false} />
            ))}
        </div>
    );
}

function SingleOutputViewer({ output, defaultExpanded = false }: { output: StructuredOutput, defaultExpanded?: boolean }) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    if (!output || !output.data) return null;
    const data = output.data as any;

    return (
        <div className="structured-output" style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            overflow: 'hidden',
            width: '100%'
        }}>
            {/* Header */}
            <div
                className="structured-output-header"
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    padding: '1rem',
                    background: 'var(--bg-secondary)',
                    borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none',
                    cursor: 'pointer',
                    userSelect: 'none',
                    gap: '1rem'
                }}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flex: 1 }}>
                    <span style={{
                        width: '85px',
                        textAlign: 'center',
                        display: 'inline-block',
                        padding: '2px 0',
                        borderRadius: '4px',
                        fontSize: '0.6rem',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        background: getOutputTypeColor(output.type),
                        color: '#fff',
                        flexShrink: 0,
                        marginTop: '2px'
                    }}>
                        {output.type}
                    </span>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: '1.4' }}>
                            {data.summary || (output.type === 'plan' ? '计划方案' : output.type === 'development' ? '开发变更' : '测试报告')}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.6 }}>
                            {new Date(output.timestamp).toLocaleString()}
                        </span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', height: '100%', minHeight: '24px', alignSelf: 'center' }}>
                    <button style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        padding: '4px',
                        fontSize: '1rem',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        ▼
                    </button>
                </div>
            </div>

            {/* Content */}
            {isExpanded && (
                <div style={{ padding: '1.25rem' }}>
                    {renderOutputContent(output.type, data)}
                </div>
            )}
        </div>
    );
}

function getOutputTypeColor(type: string): string {
    switch (type) {
        case 'plan': return '#8B5CF6';
        case 'development': return '#10B981';
        case 'testing': return '#F59E0B';
        default: return '#6B7280';
    }
}

function renderOutputContent(type: string, data: any) {
    switch (type) {
        case 'plan':
            return renderPlanOutput(data);
        case 'development':
            return renderDevelopmentOutput(data);
        case 'testing':
            return renderTestingOutput(data);
        default:
            return renderGenericOutput(data);
    }
}

function renderGenericOutput(data: any) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {data.details && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>详情</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
                        {data.details}
                    </p>
                </div>
            )}
            {/* Generic fallback for unexpected data */}
            {!data.details && (
                <pre style={{ fontSize: '0.75rem', overflow: 'auto', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '4px' }}>
                    {JSON.stringify(data, null, 2)}
                </pre>
            )}
        </div>
    );
}

function renderPlanOutput(data: PlanOutput) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Sections (Parsed from Markdown) */}
            {(data as any).sections && Object.keys((data as any).sections).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {Object.entries((data as any).sections).map(([title, content], idx) => (
                        <div key={idx}>
                            <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 600, borderLeft: '3px solid var(--accent)', paddingLeft: '0.75rem' }}>
                                {title}
                            </h4>
                            <div className="markdown-content" style={{ fontSize: '0.875rem', lineHeight: '1.6', color: 'var(--text-secondary)', paddingLeft: '1rem' }}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {content as string}
                                </ReactMarkdown>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!((data as any).sections) && (
                <>
                    {data.approach && (
                        <div>
                            <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>技术方案</h4>
                            <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.5', whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{data.approach}</p>
                        </div>
                    )}
                    {data.components && data.components.length > 0 && (
                        <div>
                            <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>组件设计</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {data.components.map((c: any, i: number) => (
                                    <div key={i} style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{c.name}</div>
                                        <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{c.description}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function renderDevelopmentOutput(data: DevelopmentOutput) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {data.changes && data.changes.length > 0 && (
                <div>
                    <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>变更详情</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {data.changes.map((change, idx) => (
                            <div key={idx} style={{
                                padding: '0.75rem',
                                background: 'var(--bg-secondary)',
                                borderRadius: '6px',
                                display: 'flex',
                                gap: '0.75rem',
                                alignItems: 'center'
                            }}>
                                <span style={{
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.65rem',
                                    fontWeight: 'bold',
                                    background: getChangeActionColor(change.action),
                                    color: '#fff'
                                }}>
                                    {change.action.toUpperCase()}
                                </span>
                                <code style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>{change.file}</code>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{change.description}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {data.nextSteps && data.nextSteps.length > 0 && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>后续步骤</h4>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem' }}>
                        {data.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
}

function renderTestingOutput(data: TestingOutput) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1, padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>通过率</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#10B981' }}>
                        {data.testsRun > 0 ? Math.round((data.testsPassed / data.testsRun) * 100) : 0}%
                    </div>
                </div>
                <div style={{ flex: 1, padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>运行/通过/失败</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                        {data.testsRun} / <span style={{ color: '#10B981' }}>{data.testsPassed}</span> / <span style={{ color: '#EF4444' }}>{data.testsFailed}</span>
                    </div>
                </div>
            </div>
            {data.issues && data.issues.length > 0 && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>发现的问题</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {data.issues.map((issue, idx) => (
                            <div key={idx} style={{ padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '6px', borderLeft: `4px solid ${getSeverityColor(issue.severity)}` }}>
                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{issue.description}</div>
                                {issue.location && <code style={{ fontSize: '0.7rem', opacity: 0.6 }}>{issue.location}</code>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function getChangeActionColor(action: string): string {
    switch (action) {
        case 'created': return '#10B981';
        case 'modified': return '#3B82F6';
        case 'deleted': return '#EF4444';
        default: return '#6B7280';
    }
}

function getSeverityColor(severity: string): string {
    switch (severity) {
        case 'low': return '#10B981';
        case 'medium': return '#F59E0B';
        case 'high': return '#EF4444';
        case 'critical': return '#DC2626';
        default: return '#6B7280';
    }
}
