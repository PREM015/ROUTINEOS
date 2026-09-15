"use client";

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export function AIControlPanel() {
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    // TODO: implement actual API call
    setTimeout(() => setLoading(false), 2000);
  };

  return (
    <Card>
      <div className="p-6">
        <h2 className="text-lg font-bold mb-4">AI Control Panel</h2>
        <p className="text-sm text-gray-500 mb-4">Trigger AI insights generation across the system.</p>
        <Button onClick={handleGenerate} disabled={loading}>
          {loading ? 'Generating...' : 'Generate Insights'}
        </Button>
      </div>
    </Card>
  );
}
