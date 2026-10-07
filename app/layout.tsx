import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './globals.css';

export const metadata: Metadata = { title: 'Headcount — every guest counts', description: 'Sponsor-funded check-in payouts. A Base Sepolia testnet demo using mock hUSDC.' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
