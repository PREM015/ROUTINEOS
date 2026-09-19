'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';

interface Quote {
  id: string;
  text: string;
  author: string | null;
}

export function QuoteDisplay() {
  const [quote, setQuote] = useState<Quote | null>(null);

  useEffect(() => {
    fetchQuote();
  }, []);

  async function fetchQuote() {
    try {
      const res = await fetch('/api/quotes/random');
      const data = await res.json();
      if (data.success) {
        setQuote(data.data);
      }
    } catch (error) {
      console.error('Error fetching quote:', error);
    }
  }

  if (!quote) {
    return null;
  }

  return (
    <Card className="p-6 mb-8 bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
      <div className="flex items-start gap-4">
        <span className="text-4xl text-indigo-600">"</span>
        <div className="flex-1">
          <p className="text-lg italic text-gray-800 mb-2">{quote.text}</p>
          {quote.author && (
            <p className="text-sm text-gray-600">— {quote.author}</p>
          )}
        </div>
      </div>
    </Card>
  );
}