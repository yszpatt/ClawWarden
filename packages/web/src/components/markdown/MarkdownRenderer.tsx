import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
    return (
        <div className={className}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    code(props: any) {
                        const { inline, className, children } = props;
                        const match = /language-(\w+)/.exec(className || '');
                        const language = match ? match[1] : '';

                        return !inline && language ? (
                            <SyntaxHighlighter
                                style={oneDark}
                                language={language}
                                PreTag="div"
                                customStyle={{
                                    borderRadius: '8px',
                                    margin: '0.5rem 0',
                                }}
                            >
                                {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                        ) : (
                            <code
                                className="inline-code"
                                style={{
                                    background: 'var(--bg-secondary)',
                                    padding: '0.2rem 0.4rem',
                                    borderRadius: '4px',
                                    fontSize: '0.9em',
                                }}
                            >
                                {children}
                            </code>
                        );
                    },
                    pre({ children }) {
                        return <>{children}</>;
                    },
                    p({ children }) {
                        return <p style={{ margin: '0.5rem 0', lineHeight: '1.6' }}>{children}</p>;
                    },
                    ul({ children }) {
                        return <ul style={{ paddingLeft: '1.5rem', margin: '0.5rem 0' }}>{children}</ul>;
                    },
                    ol({ children }) {
                        return <ol style={{ paddingLeft: '1.5rem', margin: '0.5rem 0' }}>{children}</ol>;
                    },
                    a({ href, children }) {
                        return (
                            <a
                                href={href}
                                style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {children}
                            </a>
                        );
                    },
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
