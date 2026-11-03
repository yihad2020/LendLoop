import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import ConvexClientProvider from "@/components/convex-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "LendLoop — Better tools, closer neighbors",
  description: "Borrow what you need. Lend what you don't. A neighborhood tool-sharing community.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ClerkProvider><ConvexClientProvider>{children}</ConvexClientProvider></ClerkProvider></body></html>;
}
