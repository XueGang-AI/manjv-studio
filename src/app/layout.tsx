import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Manjv Studio — AI 漫剧创作平台",
  description: "AI 驱动的漫剧创作平台，支持故事分析、角色设计、分镜生成、视频合成",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full bg-[var(--bg-base)] text-[var(--color-text-primary)]">
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
