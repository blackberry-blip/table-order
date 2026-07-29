export const metadata = {
  title: "Table Order",
  description: "QR table ordering system",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}