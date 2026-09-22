export function Avatar({ src, alt, initials, size = 'md' }: { src?: string | null; alt?: string; initials?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-16 h-16 text-xl',
  };

  return (
    <div className={`relative inline-flex items-center justify-center overflow-hidden bg-gray-100 rounded-full ${sizeClasses[size]}`}>
      {src ? (
        <img src={src} alt={alt || 'Avatar'} className="w-full h-full object-cover" />
      ) : (
        <span className="font-medium text-gray-600">{initials || alt?.charAt(0).toUpperCase() || 'U'}</span>
      )}
    </div>
  );
}
