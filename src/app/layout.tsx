import type { Metadata } from 'next';
import './globals.css';
import { AppProvider } from '@/context/AppContext';
import AuthProvider from '@/components/auth/AuthProvider';

export const metadata: Metadata = {
  title: 'RoutineOS — Personal Habit & Routine Tracker',
  description: 'Track your daily routine, habits, and goals with AI-powered insights.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <AppProvider>{children}</AppProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
