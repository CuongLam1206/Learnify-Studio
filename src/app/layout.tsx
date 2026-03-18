import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import Providers from "./providers";

export const metadata: Metadata = {
    title: "Learnify — AI eLearning Platform",
    description:
        "Hệ thống eLearning tích hợp AI: tạo video bài giảng, câu hỏi và hỗ trợ học viên thông minh.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="vi" suppressHydrationWarning>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link
                    rel="preconnect"
                    href="https://fonts.gstatic.com"
                    crossOrigin="anonymous"
                />
            </head>
            <body className="min-h-screen bg-gray-50 antialiased">
                <Providers>
                    {children}
                    <Toaster
                        position="top-right"
                        toastOptions={{
                            style: {
                                background: "#fff",
                                color: "#111827",
                                border: "1px solid #e5e7eb",
                                borderRadius: "12px",
                            },
                        }}
                    />
                </Providers>
            </body>
        </html>
    );
}
