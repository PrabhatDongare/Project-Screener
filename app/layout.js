import './globals.css';
import { Inter } from 'next/font/google';
import AppShell from '@/components/AppShell';

// Haas Grotesk is licensed; the design doc names Inter (display optical size) as the open substitute.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap', axes: ['opsz'] });

export const metadata = {
  title: 'LinkedIn Job Outreach',
  description: 'Screen scraped LinkedIn hiring posts against your resume and reach out to recruiters.',
};

const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var isDark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (isDark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
