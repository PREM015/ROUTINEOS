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
    <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-md max-w-sm w-full border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">Customize Dashboard</h3>
      <ul className="space-y-3">
        {widgets.map((widget) => (
          <li key={widget.id} className="flex items-center justify-between">
            <span className="text-gray-700 dark:text-gray-300 font-medium text-sm">{widget.label}</span>
            <button
              onClick={() => onChange(widget.id, !widget.visible)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                widget.visible ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'
              }`}
              role="switch"
              aria-checked={widget.visible}
            >
              <span className="sr-only">Toggle {widget.label}</span>
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
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
