// frontend/app/layout.tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/src/styles/globals.css';

export const metadata: Metadata = {
  title: '智忆评 | CogMemory AD',
  description: '阿尔茨海默病认知评估与辅助诊断系统',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="cma-app-body">{children}</body>
    </html>
  );
}
