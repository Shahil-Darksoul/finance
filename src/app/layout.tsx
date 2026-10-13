import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Ledgerly — Personal Finance & Investing",
    template: "%s · Ledgerly",
  },
  description:
    "Track income, expenses, savings, bills and investments in one place, with forecasting built on your own history.",
  applicationName: "Ledgerly",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#151824" },
  ],
};

/**
 * Applied before hydration so a dark-mode user never sees a white flash.
 * The same values are also persisted on toggle (see ThemeToggle).
 */
const themeScript = `(function(){try{var s=localStorage.getItem('ledgerly-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=s==='light'||s==='dark'?s:(m?'dark':'light');var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t;}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}