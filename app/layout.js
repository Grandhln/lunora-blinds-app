import "./globals.css";

export const metadata = {
  title: "Lunora Blinds",
  description: "Premium Measurement & Order System for Lunora Blinds",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
