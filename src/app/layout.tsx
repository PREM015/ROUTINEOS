import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { AppProvider } from '@/context/AppContext';
import AuthProvider from '@/components/auth/AuthProvider';
import AutoLogout from '@/components/auth/AutoLogout';

export const metadata: Metadata = {
  title: 'RoutineOS — Personal Habit & Routine Tracker',
  description: 'Track your daily routine, habits, and goals with AI-powered insights.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            <AppProvider>
              <AutoLogout />
              {children}
            </AppProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

