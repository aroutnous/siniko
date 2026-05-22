const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export default function App() {
  return (
    <main className="app">
      <h1>SINIKO</h1>
      <p>Gestion scolaire — interface en construction</p>
      <p>
        API : <a href={`${apiBase}/docs`}>{apiBase}/docs</a>
      </p>
    </main>
  );
}
