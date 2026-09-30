import type { Metadata } from "next";
import "./globals.css";
import { fontVariables } from "@/design/fonts";
import { ToastProvider } from "@/components/ui/feedback";

export const metadata: Metadata = {
  title: "Kaskad: zincir üstü likidasyon kaskadı simülatörü",
  description: "“Şu varlık %3 depeg olursa ne olur?” sorusunu Monad'da, tek tx'te, herkesin doğrulayabileceği şekilde cevaplar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
