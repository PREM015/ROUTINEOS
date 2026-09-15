import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background text-center">
      <div className="p-4 bg-primary/10 rounded-full mb-6">
        <Sparkles className="w-12 h-12 text-primary" />
      </div>
      <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        We couldn't find the page you were looking for. It might have been moved or deleted.
      </p>
      <Link href="/" className="px-6 py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:opacity-90">
        Return Home
      </Link>
    </div>
  );
}
