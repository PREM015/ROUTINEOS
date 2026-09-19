"use client";

/**
 * Image — Next.js `next/image` wrapper that adds rounded corners, optional
 * aspect-ratio framing and a graceful fallback placeholder rendered when the
 * source fails to load or is missing.
 *
 * Usage:
 *   <Image src={url} alt="Cover" width={400} height={240} rounded="lg" aspectRatio="16/9" />
 *   <Image src={url} alt="Banner" fill sizes="100vw" />
 */
import * as React from 'react';
import NextImage from 'next/image';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type RoundedSize = 'none' | 'sm' | 'md' | 'lg' | 'full';

const ROUNDED_CLASSES: Record<RoundedSize, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
};

export interface ImageProps {
  src: string;
  alt: string;
  /** Explicit dimensions when not using `fill`. */
  width?: number;
  height?: number;
  /** Fill the wrapping container (`fill` mode on next/image). */
  fill?: boolean;
  /** Sizes hint forwarded to next/image for responsive srcsets. */
  sizes?: string;
  /** CSS aspect-ratio for the wrapper, e.g. `'16 / 9'`. */
  aspectRatio?: string;
  rounded?: RoundedSize;
  priority?: boolean;
  /** Low-res base64 preview used for the blur-up transition. */
  blurDataURL?: string;
  className?: string;
  onError?: () => void;
}

export function Image({
  src,
  alt,
  width,
  height,
  fill = false,
  sizes,
  aspectRatio,
  rounded = 'md',
  priority = false,
  blurDataURL,
  className,
  onError,
}: ImageProps) {
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    setHasError(false);
  }, [src]);

  const roundedClass = ROUNDED_CLASSES[rounded];

  if (hasError || !src) {
    return (
      <div
        style={aspectRatio ? { aspectRatio } : undefined}
        className={cn(
          'flex items-center justify-center bg-gray-100 text-gray-400',
          roundedClass,
          className,
        )}
        role="img"
        aria-label={alt || 'Image unavailable'}
      >
        <ImageOff className="h-6 w-6" />
      </div>
    );
  }

  const image = (
    <NextImage
      src={src}
      alt={alt}
      fill={fill}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      sizes={sizes}
      priority={priority}
      style={{ objectFit: 'cover' }}
      onError={() => {
        setHasError(true);
        onError?.();
      }}
      {...(blurDataURL ? { placeholder: 'blur', blurDataURL } : {})}
    />
  );

  if (fill) {
    return (
      <div
        style={aspectRatio ? { aspectRatio } : undefined}
        className={cn('relative overflow-hidden', roundedClass, className)}
      >
        {image}
      </div>
    );
  }

  if (aspectRatio) {
    return (
      <div
        style={{ aspectRatio }}
        className={cn('relative overflow-hidden', roundedClass, className)}
      >
        {image}
      </div>
    );
  }

  return <div className={cn('relative', className)}>{image}</div>;
}