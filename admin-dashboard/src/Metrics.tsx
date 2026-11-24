// @ts-nocheck
import * as React from "https://esm.sh/react@19.3.0";

// Grafana and Prometheus run on fixed local ports; the dashboard may be served
// from either the FastAPI mount or the dev server, so use the same hostname.
const host = window.location.hostname || "localhost";
const GRAFANA_URL = `http://${host}:3000/d/asksight/asksight-backend?orgId=1&refresh=10s&kiosk`;
const PROMETHEUS_URL = `http://${host}:9090`;

export default function Metrics() {
  return (
    <section className="a11s-card a11s-metrics">
      <div className="a11s-admin-bar">
        <span className="a11s-pill">
          <span className="a11s-dot" aria-hidden="true" />
          Grafana · Prometheus
        </span>
        <div className="a11s-actions">
          <a
            className="a11s-button a11s-button-ghost"
            href={PROMETHEUS_URL}
            target="_blank"
            rel="noreferrer"
          >
            Open Prometheus
          </a>
          <a
            className="a11s-button a11s-button-ghost"
            href={GRAFANA_URL}
            target="_blank"
            rel="noreferrer"
          >
            Open Grafana
          </a>
        </div>
      </div>
      <p className="a11s-muted">
        Live API and inference metrics. If this is blank, start the stack with{" "}
        <code>docker compose up -d</code>.
      </p>
      <iframe
        className="a11s-metrics-frame"
        src={GRAFANA_URL}
        title="AskSight metrics"
        loading="lazy"
      />
    </section>
  );
}
