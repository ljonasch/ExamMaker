import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ExamForge",
  description: "Generate realistic practice exams from course materials."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}
