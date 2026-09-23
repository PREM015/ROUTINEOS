'use client';
import React from 'react';

interface WidgetConfig {
  id: string;
  label: string;
  visible: boolean;
}

interface DashboardCustomizerProps {
  widgets: WidgetConfig[];
  onChange: (id: string, visible: boolean) => void;
}

export const DashboardCustomizer: React.FC<DashboardCustomizerProps> = ({ widgets, onChange }) => {
  return (
    <div className="p-4 bg-card rounded-xl shadow-sm max-w-sm w-full border border-border transition-all duration-300 ease-out-expo hover:-translate-y-0.5 hover:shadow-md fade-rise-in">
      <h3 className="text-lg font-semibold text-foreground mb-4 pb-2 border-b border-border">Customize Dashboard</h3>
      <ul className="space-y-3">
        {widgets.map((widget) => (
          <li key={widget.id} className="flex items-center justify-between">
            <span className="text-muted-foreground font-medium text-sm">{widget.label}</span>
            <button
              onClick={() => onChange(widget.id, !widget.visible)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                widget.visible ? 'bg-primary' : 'bg-muted'
              }`}
              role="switch"
              aria-checked={widget.visible}
            >
              <span className="sr-only">Toggle {widget.label}</span>
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  widget.visible ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
