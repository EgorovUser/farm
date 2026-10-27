import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Корни и Руда — Фаза 3: ядро + M01–M06, M09, M10, M15 (Игрок · Инвентарь · Модфордж · Магазин · Ферма · Загон · Крафт · Заточка · Квесты)",
  description:
    "Браузерная cozy-экономическая RPG: ферма, idle и карточный рогалик. Отладочная консоль: шины статов, цен, событий и рандома, живые витрины модулей Фазы 3 (ферма, загон, квесты).",
  keywords: ["игра", "idle", "ферма", "рогалик", "TypeScript", "Next.js"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
