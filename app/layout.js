import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata = {
  title: "Lunora Blinds",
  description: "Premium Measurement & Order System for Lunora Blinds",
};

import Link from "next/link";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <nav className="global-nav">
          <div className="nav-container">
            <div className="nav-brand">Lunora Blinds</div>
            <div className="nav-links">
              <Link href="/">Orders</Link>
              <Link href="/quote">Quote Generator</Link>
              <Link href="/settings">Business Settings</Link>
            </div>
          </div>
        </nav>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
