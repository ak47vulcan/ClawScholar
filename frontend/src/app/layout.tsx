import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClawScholar — Research Workflow Engine",
  description: "Research-Grade Multi-Agent Academic Workflow Engine",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Prevent FOUC: apply theme before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const t = localStorage.getItem('clawscholar-ui');
                const theme = t ? JSON.parse(t)?.state?.theme ?? 'dark' : 'dark';
                const cls = theme === 'system'
                  ? (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light')
                  : theme;
                document.documentElement.className = cls;
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}>
        {children}
        <div id="toast-portal" />
      </body>
    </html>
  );
}
