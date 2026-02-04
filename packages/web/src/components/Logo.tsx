
export function Logo({ className = '', size = 32 }: { className?: string; size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            aria-label="ClawWarden Logo"
        >
            {/* The Warden: A sturdy shield/hexagon container representing security and monitoring */}
            <path
                d="M16 2.5L5 8.5V23.5L16 29.5L27 23.5V8.5L16 2.5Z"
                fill="#1e293b"
                stroke="#3b82f6"
                strokeWidth="2"
                strokeLinejoin="round"
            />

            {/* The Claw: Stylized 'C' (for Claude) formed by three aggressive claw marks/code slashes */}
            {/* Top Slash */}
            <path
                d="M22 10L14 14"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeLinecap="round"
            />
            {/* Middle/Main Curve Slash */}
            <path
                d="M11 15C10 16 10 20 12 21.5"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeLinecap="round"
            />
            {/* Bottom Slash */}
            <path
                d="M15 24L20 21"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeLinecap="round"
            />

            {/* The Digital Eye: A central point indicating the Warden is watching */}
            <circle cx="16" cy="16" r="1.5" fill="#3b82f6" className="animate-pulse" />
        </svg>
    );
}
