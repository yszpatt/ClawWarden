
export function Logo({ className = '', size = 32 }: { className?: string; size?: number }) {
    return (
        <img
            src="/logo-pixel.png"
            alt="VibeWarden Logo"
            height={size}
            className={className}
            style={{
                objectFit: 'contain',
                display: 'block',
                width: 'auto' // Ensure auto width for non-square logos
            }}
        />
    );
}
