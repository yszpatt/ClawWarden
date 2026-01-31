import { useState } from 'react';
import type { StructuredOutput, DesignOutput, DevelopmentOutput, TestingOutput } from '@antiwarden/shared';

interface StructuredOutputProps {
    output: StructuredOutput;
}

export function StructuredOutputViewer({ output }: StructuredOutputProps) {
    const [isExpanded, setIsExpanded] = useState(true);

    if (!output || !output.data) {
        return null;
    }

    const data = output.data as DesignOutput | DevelopmentOutput | TestingOutput;

    return (
        <div className="structured-output" style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            marginTop: '1rem',
            overflow: 'hidden'
        }}>
            {/* Header */}
            <div
                className="structured-output-header"
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    userSelect: 'none'
                }}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.7rem',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        background: getOutputTypeColor(output.type),
                        color: '#fff'
                    }}>
                        {output.type}
                    </span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        {new Date(output.timestamp).toLocaleString()}
                    </span>
                </div>
                <button style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '4px',
                    fontSize: '1rem',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s'
                }}>
                    ▼
                </button>
            </div>

            {/* Content */}
            {isExpanded && (
                <div style={{ padding: '1rem' }}>
                    {renderOutputContent(output.type, data)}
                </div>
            )}
        </div>
    );
}

function getOutputTypeColor(type: string): string {
    switch (type) {
        case 'design': return '#8B5CF6';
        case 'development': return '#10B981';
        case 'testing': return '#F59E0B';
        default: return '#6B7280';
    }
}

function renderOutputContent(type: string, data: DesignOutput | DevelopmentOutput | TestingOutput) {
    switch (type) {
        case 'design':
            return renderDesignOutput(data as DesignOutput);
        case 'development':
            return renderDevelopmentOutput(data as DevelopmentOutput);
        case 'testing':
            return renderTestingOutput(data as TestingOutput);
        default:
            return <pre style={{ fontSize: '0.8rem', overflow: 'auto' }}>{JSON.stringify(data, null, 2)}</pre>;
    }
}

function renderDesignOutput(data: DesignOutput) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Summary */}
            {data.summary && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>摘要</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.5', color: 'var(--text-primary)' }}>
                        {data.summary}
                    </p>
                </div>
            )}

            {/* Approach */}
            {data.approach && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>技术方案</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.5', whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
                        {data.approach}
                    </p>
                </div>
            )}

            {/* Components */}
            {data.components && data.components.length > 0 && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>组件</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {data.components.map((component, idx) => (
                            <div key={idx} style={{
                                padding: '0.5rem',
                                background: 'var(--bg-secondary)',
                                borderRadius: '4px',
                                border: '1px solid var(--border-color)'
                            }}>
                                <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                    {component.name}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                    {component.description}
                                </div>
                                {component.files && component.files.length > 0 && (
                                    <div style={{ marginTop: '0.5rem' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>文件:</div>
                                        {component.files.map((file, fIdx) => (
                                            <code key={fIdx} style={{
                                                display: 'inline-block',
                                                marginRight: '0.5rem',
                                                marginTop: '0.25rem',
                                                padding: '2px 6px',
                                                background: 'var(--bg-tertiary)',
                                                borderRadius: '2px',
                                                fontSize: '0.75rem',
                                                color: 'var(--accent)'
                                            }}>
                                                {file}
                                            </code>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Dependencies */}
            {data.dependencies && data.dependencies.length > 0 && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>依赖项</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {data.dependencies.map((dep, idx) => (
                            <code key={idx} style={{
                                padding: '4px 8px',
                                background: 'var(--bg-secondary)',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                color: 'var(--text-primary)'
                            }}>
                                {dep}
                            </code>
                        ))}
                    </div>
                </div>
            )}

            {/* Considerations */}
            {data.considerations && data.considerations.length > 0 && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>注意事项</h4>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {data.considerations.map((item, idx) => (
                            <li key={idx}>{item}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Complexity */}
            {data.estimatedComplexity && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>复杂度评估</h4>
                    <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        background: getComplexityColor(data.estimatedComplexity),
                        color: '#fff'
                    }}>
                        {data.estimatedComplexity.toUpperCase()}
                    </span>
                </div>
            )}
        </div>
    );
}

function renderDevelopmentOutput(data: DevelopmentOutput) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Summary */}
            {data.summary && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>摘要</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{data.summary}</p>
                </div>
            )}

            {/* Changes */}
            {data.changes && data.changes.length > 0 && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>变更</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {data.changes.map((change, idx) => (
                            <div key={idx} style={{
                                padding: '0.5rem',
                                background: 'var(--bg-secondary)',
                                borderRadius: '4px',
                                display: 'flex',
                                gap: '0.75rem',
                                alignItems: 'center'
                            }}>
                                <span style={{
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.7rem',
                                    fontWeight: 'bold',
                                    background: getChangeActionColor(change.action),
                                    color: '#fff'
                                }}>
                                    {change.action}
                                </span>
                                <code style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>{change.file}</code>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{change.description}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tests Added */}
            {data.testsAdded && data.testsAdded.length > 0 && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>新增测试</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {data.testsAdded.map((test, idx) => (
                            <code key={idx} style={{
                                display: 'block',
                                padding: '4px 8px',
                                background: 'var(--bg-secondary)',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                color: 'var(--text-primary)'
                            }}>
                                {test}
                            </code>
                        ))}
                    </div>
                </div>
            )}

            {/* Breaking Changes */}
            {data.breakingChanges && data.breakingChanges.length > 0 && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#EF4444', fontSize: '0.9rem' }}>破坏性变更</h4>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', color: '#EF4444' }}>
                        {data.breakingChanges.map((change, idx) => (
                            <li key={idx}>{change}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Next Steps */}
            {data.nextSteps && data.nextSteps.length > 0 && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>后续步骤</h4>
                    <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {data.nextSteps.map((step, idx) => (
                            <li key={idx}>{step}</li>
                        ))}
                    </ol>
                </div>
            )}
        </div>
    );
}

function renderTestingOutput(data: TestingOutput) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Summary */}
            {data.summary && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>摘要</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{data.summary}</p>
                </div>
            )}

            {/* Test Results */}
            <div>
                <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>测试结果</h4>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{
                        padding: '0.5rem 1rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)'
                    }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>运行</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{data.testsRun}</div>
                    </div>
                    <div style={{
                        padding: '0.5rem 1rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)'
                    }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>通过</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#10B981' }}>{data.testsPassed}</div>
                    </div>
                    <div style={{
                        padding: '0.5rem 1rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)'
                    }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>失败</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#EF4444' }}>{data.testsFailed}</div>
                    </div>
                    {data.testsRun > 0 && (
                        <div style={{
                            padding: '0.5rem 1rem',
                            background: 'var(--bg-secondary)',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)'
                        }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>通过率</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: getPassRateColor(data.testsPassed / data.testsRun) }}>
                                {Math.round((data.testsPassed / data.testsRun) * 100)}%
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Coverage */}
            {data.coverage && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>覆盖率</h4>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>行: </span>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>{data.coverage.lines}%</span>
                        </div>
                        <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>函数: </span>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>{data.coverage.functions}%</span>
                        </div>
                        <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>分支: </span>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 'bold' }}>{data.coverage.branches}%</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Issues */}
            {data.issues && data.issues.length > 0 && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', fontSize: '0.9rem' }}>问题</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {data.issues.map((issue, idx) => (
                            <div key={idx} style={{
                                padding: '0.5rem',
                                background: 'var(--bg-secondary)',
                                borderRadius: '4px',
                                borderLeft: `3px solid ${getSeverityColor(issue.severity)}`
                            }}>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '0.7rem',
                                        fontWeight: 'bold',
                                        background: getSeverityColor(issue.severity),
                                        color: '#fff'
                                    }}>
                                        {issue.severity.toUpperCase()}
                                    </span>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{issue.description}</span>
                                </div>
                                {issue.location && (
                                    <code style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                        {issue.location}
                                    </code>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function getComplexityColor(complexity: string): string {
    switch (complexity) {
        case 'low': return '#10B981';
        case 'medium': return '#F59E0B';
        case 'high': return '#EF4444';
        default: return '#6B7280';
    }
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

function getPassRateColor(rate: number): string {
    if (rate >= 0.9) return '#10B981';
    if (rate >= 0.7) return '#F59E0B';
    return '#EF4444';
}
