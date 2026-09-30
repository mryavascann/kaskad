import type { Metadata } from "next";
import "./globals.css";
import { fontVariables } from "@/design/fonts";
import { Toaster } from "@/design/ui/toaster";
import { TooltipProvider } from "@/design/ui/tooltip";
import { DemoModeAttribute } from "@/motion/demo-mode";
import { MotionProvider } from "@/motion/provider";
import { RevealNoScript } from "@/motion/reveal";

export const metadata: Metadata = {
  title: "Kaskad: zincir üstü likidasyon kaskadı simülatörü",
  description: "“Şu varlık %3 depeg olursa ne olur?” sorusunu Monad'da, tek tx'te, herkesin doğrulayabileceği şekilde cevaplar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <RevealNoScript />
        <DemoModeAttribute />
        <MotionProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </MotionProvider>
        <Toaster />
      </body>
    </html>
  );
}
