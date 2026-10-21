import { QueryProvider } from "@/components/providers/query-provider";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrepKit",
  description: "Interview prep kits — checklists, questions, and notes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans">
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
