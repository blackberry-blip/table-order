import { AuthProvider } from "@/lib/auth-context";

export const metadata = {
  title: "Table Order",
  description: "QR-based restaurant ordering",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}