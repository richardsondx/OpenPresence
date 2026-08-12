import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenPresence · Put an intelligent presence into the world",
  description: "A quiet control room for agents with a mind, mission, taste, and presence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
