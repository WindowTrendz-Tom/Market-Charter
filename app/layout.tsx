import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Market Charter",
  description: "Personal market charts",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NZ">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
