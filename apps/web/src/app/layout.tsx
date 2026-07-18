import type { Metadata } from "next";
import { Providers } from "@/lib/convex";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hiro Analytics — Retention Marketing Hub",
  description:
    "Unified Email & SMS performance analytics across Klaviyo, Attentive, Postscript and Omnisend.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
