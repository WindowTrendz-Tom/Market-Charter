import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
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
        <SiteFooter />
      </body>
    </html>
  );
}
