import type { Metadata } from "next";
import "./v2.css";

export const metadata: Metadata = {
  title: "OpenPresence · Social expertise for your AI agent",
  description: "Give your AI agent the social expertise to build an audience in your niche. Your voice, relationships, and learning, wherever you work.",
};

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return <div className="opv2">{children}</div>;
}
