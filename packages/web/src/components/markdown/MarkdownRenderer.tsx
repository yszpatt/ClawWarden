import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
    // Pre-process content to force soft breaks (standard markdown requires 2 spaces)
    const processedContent = content.replace(/\n/g, '  \n');

    return (
        <div className={`markdown-body ${className || ''}`}>
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
                                    margin: 0,
                                    padding: '1rem',
                                    fontSize: '0.875rem',
                                    lineHeight: '1.6',
                                }}
                            >
                                {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                        ) : (
                            <code className="inline-code">
                                {children}
                            </code>
                        );
                    },
                    // We let the CSS handle most of the styling via the .markdown-body class
                    // but we can still override or add specific logic here if needed
                    pre({ children }) {
                        return <pre>{children}</pre>;
                    },
                    p({ children }) {
                        return <p>{children}</p>;
                    },
                    ul({ children }) {
                        return <ul>{children}</ul>;
                    },
                    ol({ children }) {
                        return <ol>{children}</ol>;
                    },
                    a({ href, children }) {
                        return (
                            <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {children}
                            </a>
                        );
                    },
                    table({ children }) {
                        return <table>{children}</table>;
                    },
                    thead({ children }) {
                        return <thead>{children}</thead>;
                    },
                    tbody({ children }) {
                        return <tbody>{children}</tbody>;
                    },
                    tr({ children }) {
                        return <tr>{children}</tr>;
                    },
                    th({ children }) {
                        return <th>{children}</th>;
                    },
                    td({ children }) {
                        return <td>{children}</td>;
                    },
                    blockquote({ children }) {
                        return <blockquote>{children}</blockquote>;
                    },
                    h1({ children }) { return <h1>{children}</h1>; },
                    h2({ children }) { return <h2>{children}</h2>; },
                    h3({ children }) { return <h3>{children}</h3>; },
                    h4({ children }) { return <h4>{children}</h4>; },
                }}
            >
                {processedContent}
            </ReactMarkdown >
        </div >
    );
}
