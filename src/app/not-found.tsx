import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background text-center">
      <div className="mb-6">
        <Logo variant="icon" size="lg" />
      </div>
      <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        We couldn&apos;t find the page you were looking for. It might have been moved or deleted.
      </p>
      <Link href="/" className="px-6 py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:opacity-90">
        Return Home
      </Link>
    </div>
  );
}
