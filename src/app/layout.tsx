import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { AppProvider } from '@/context/AppContext';
import AuthProvider from '@/components/auth/AuthProvider';
import AutoLogout from '@/components/auth/AutoLogout';
import { SWRegistration } from '@/components/SWRegistration';

export const metadata: Metadata = {
  title: 'RoutineOS — Personal Habit & Routine Tracker',
  description: 'Track your daily routine, habits, and goals with AI-powered insights.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RoutineOS',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.svg',
  },
  other: {
    'theme-color': '#3b82f6',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#3b82f6" />
        <link rel="apple-touch-icon" href="/apple-icon.svg" />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            <AppProvider>
              <AutoLogout />
              <SWRegistration />
              {children}
            </AppProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}