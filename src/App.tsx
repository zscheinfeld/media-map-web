import MediaMap from "./MediaMap";
import "./App.css";

export default function App() {
  return (
    <main className="app" aria-label="ESHAP Media Universe">
      <h1 className="sr-only">ESHAP Media Universe</h1>
      <MediaMap />
    </main>
  );
}
