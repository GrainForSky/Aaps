import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AndroidAPS Remote Control',
  description: '远程控制 AndroidAPS 胰岛素泵 - 管理胰岛素和碳水输注',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="antialiased bg-slate-950 text-white">
        {children}
      </body>
    </html>
  );
}
