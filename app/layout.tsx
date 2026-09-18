import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenPresence · Meet your Agent",
  description: "A quiet workspace for Agents with a mind, mission, taste, and judgment.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
