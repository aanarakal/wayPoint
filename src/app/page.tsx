import { WaypointApp } from "@/components/WaypointApp";

export default function Home() {
  return (
    <main className="page">
      <div className="md-blobs" aria-hidden="true">
        <div className="md-blob md-blob--primary" />
        <div className="md-blob md-blob--secondary" />
        <div className="md-blob md-blob--tertiary" />
      </div>
      <WaypointApp />
    </main>
  );
}
