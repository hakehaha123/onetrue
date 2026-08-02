import type { Metadata } from 'next';
import { Instrument_Serif, Manrope } from 'next/font/google';
import { Providers } from '@/components/Providers';

const display = Instrument_Serif({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
});

const body = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: '缘初 AI',
  description: '文生图 · 文生视频',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${display.variable} ${body.variable}`}>
      <body
        style={{
          margin: 0,
          fontFamily: 'var(--font-body), "PingFang SC", "Microsoft YaHei", sans-serif',
          background: '#0e0c0a',
          color: '#f3ebe1',
        }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
