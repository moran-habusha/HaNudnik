import type { Metadata, Viewport } from "next";
import BabiezSwRegister from "./BabiezSwRegister";

export const metadata: Metadata = {
  title: "The Babiez List",
  description: "רשימת קניות משותפת",
  manifest: "/babiez/manifest.json",
  icons: {
    icon: "/babiez/icon-512.png",
    apple: "/babiez/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#7F5FFF",
};

export default function BabiezLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <BabiezSwRegister />
      {children}
    </>
  );
}
