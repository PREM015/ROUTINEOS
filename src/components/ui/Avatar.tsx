import Image from 'next/image';

/**
 * A user avatar, or their initials.
 *
 * ## Why `next/image` rather than `<img>`
 *
 * A plain `<img>` on an avatar is a real cost, not a lint nit: the browser
 * cannot tell whether the image will change, so it is never cached across
 * navigations and every page that shows a header re-downloads it. `next/image`
 * serves an appropriately sized variant and keeps it in the Next image cache.
 *
 * `unoptimized` is deliberate and not laziness: this renders ARBITRARY user-supplied
 * URLs — OAuth providers, S3, anything — which the image optimizer cannot fetch
 * without a server round trip that would fail for most of them and add a request
 * per avatar. An external or unconfigured host would also throw on `next/image`
 * unless every provider were allow-listed in `next.config.ts`.
 *
 * So the wins kept here are the intrinsic `width`/`height` (which removes the
 * layout shift as the image loads) and `object-cover`, without pretending the
 * optimizer handles third-party hosts.
 */
export function Avatar({
  src,
  alt,
  initials,
  size = 'md',
}: {
  src?: string | null;
  alt?: string;
  initials?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-16 h-16 text-xl',
  };

  // Intrinsic pixel dimensions, so the image reserves its box before it loads and
  // the surrounding row does not shift. The container clips and scales anyway.
  const px = { sm: 32, md: 40, lg: 64 }[size];

  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden bg-gray-100 rounded-full ${sizeClasses[size]}`}
    >
      {src ? (
        <Image
          src={src}
          alt={alt || 'Avatar'}
          width={px}
          height={px}
          unoptimized
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="font-medium text-gray-600">
          {initials || alt?.charAt(0).toUpperCase() || 'U'}
        </span>
      )}
    </div>
  );
}
