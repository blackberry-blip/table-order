export default function Home() {
  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>Table Order System</h1>
      <p>Go to:</p>
      <ul>
        <li><a href="/table">/table</a></li>
        <li><a href="/reception">/reception</a></li>
        <li><a href="/kitchen">/kitchen</a></li>
      </ul>
    </div>
  );
}