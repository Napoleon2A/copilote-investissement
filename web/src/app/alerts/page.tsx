/**
 * Page Alertes — /alerts
 *
 * Gestion des alertes de prix et d'événements : création, liste active,
 * alertes déclenchées, et vérification manuelle.
 */
"use client";
import { useState, useEffect, useCallback } from "react";
import {
  fetchAlerts,
  createAlert,
  deleteAlert,
  checkAlerts,
  fetchTriggeredAlerts,
} from "@/lib/api";
import type { AlertData, AlertType } from "@/lib/api";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

const ALERT_TYPES: { value: AlertType; label: string }[] = [
  { value: "price_above", label: "Prix au-dessus de" },
  { value: "price_below", label: "Prix en-dessous de" },
  { value: "change_pct", label: "Variation (%)" },
  { value: "earnings", label: "Earnings (résultats)" },
];

function formatAlertType(type: AlertType): string {
  return ALERT_TYPES.find((t) => t.value === type)?.label ?? type;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AlertsPage() {
  useDocumentTitle("Alertes");

  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [triggered, setTriggered] = useState<AlertData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Form state
  const [ticker, setTicker] = useState("");
  const [type, setType] = useState<AlertType>("price_above");
  const [conditionValue, setConditionValue] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  // Check state
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [alertsRes, triggeredRes] = await Promise.all([
        fetchAlerts(),
        fetchTriggeredAlerts(),
      ]);
      setAlerts(alertsRes.alerts);
      setTriggered(triggeredRes.alerts);
      setError("");
    } catch {
      setError("Impossible de charger les alertes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    const trimmedTicker = ticker.trim().toUpperCase();
    if (!trimmedTicker) {
      setFormError("Le ticker est requis");
      return;
    }

    const needsValue = type === "price_above" || type === "price_below" || type === "change_pct";
    const numValue = conditionValue ? parseFloat(conditionValue) : undefined;
    if (needsValue && (numValue === undefined || isNaN(numValue))) {
      setFormError("La valeur de condition est requise pour ce type d'alerte");
      return;
    }

    setCreating(true);
    try {
      await createAlert({
        ticker: trimmedTicker,
        type,
        condition_value: numValue,
        message: message.trim() || undefined,
      });
      setTicker("");
      setConditionValue("");
      setMessage("");
      setType("price_above");
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteAlert(id);
      await loadData();
    } catch {
      setError("Erreur lors de la suppression");
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await checkAlerts();
      setCheckResult(
        res.newly_triggered > 0
          ? `${res.newly_triggered} alerte(s) déclenchée(s) sur ${res.checked} vérifiée(s)`
          : `${res.checked} alerte(s) vérifiée(s), aucune déclenchée`
      );
      await loadData();
    } catch {
      setCheckResult("Erreur lors de la vérification");
    } finally {
      setChecking(false);
    }
  };

  const needsConditionValue = type !== "earnings";
  const activeAlerts = alerts.filter((a) => !a.triggered);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1
          className="text-lg font-semibold text-primary"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Alertes
        </h1>
        <p className="text-xs text-muted mt-0.5">
          Configurez des alertes sur les prix, variations et publications de résultats
        </p>
      </div>

      {/* Error global */}
      {error && !loading && (
        <div className="rounded-lg border border-red-300/30 bg-red-50/50 dark:bg-red-900/20 p-4">
          <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Create form */}
      <div className="rounded-lg border border-edge bg-surface p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-primary mb-3">Nouvelle alerte</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Ticker */}
            <div>
              <label className="block text-xs text-muted mb-1">Ticker</label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="AAPL"
                className="w-full rounded border border-edge bg-bg px-3 py-1.5 text-sm text-primary placeholder:text-muted/50 focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy/30 font-mono"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs text-muted mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AlertType)}
                className="w-full rounded border border-edge bg-bg px-3 py-1.5 text-sm text-primary focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy/30"
              >
                {ALERT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Condition value */}
            <div>
              <label className="block text-xs text-muted mb-1">
                {type === "change_pct" ? "Variation (%)" : "Seuil ($)"}
              </label>
              <input
                type="number"
                step="any"
                value={conditionValue}
                onChange={(e) => setConditionValue(e.target.value)}
                placeholder={type === "change_pct" ? "5" : "150.00"}
                disabled={!needsConditionValue}
                className="w-full rounded border border-edge bg-bg px-3 py-1.5 text-sm text-primary placeholder:text-muted/50 focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy/30 font-mono disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>

            {/* Message */}
            <div>
              <label className="block text-xs text-muted mb-1">Message (optionnel)</label>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Note personnelle..."
                className="w-full rounded border border-edge bg-bg px-3 py-1.5 text-sm text-primary placeholder:text-muted/50 focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy/30"
              />
            </div>
          </div>

          {formError && (
            <p className="text-xs text-red-600">{formError}</p>
          )}

          <button
            type="submit"
            disabled={creating}
            className="rounded bg-navy px-4 py-1.5 text-sm font-medium text-white hover:bg-navy-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? "Création..." : "Créer l'alerte"}
          </button>
        </form>
      </div>

      {/* Force check */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleCheck}
          disabled={checking}
          className="rounded border border-edge bg-surface px-4 py-1.5 text-sm text-secondary hover:bg-bg hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {checking ? "Vérification..." : "Vérifier maintenant"}
        </button>
        {checkResult && (
          <span className="text-xs text-muted">{checkResult}</span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="rounded-lg border border-edge bg-surface p-8 text-center shadow-sm">
          <p className="text-secondary text-sm">Chargement des alertes...</p>
        </div>
      )}

      {/* Active alerts */}
      {!loading && (
        <div>
          <h2 className="text-sm font-semibold text-primary mb-2">
            Alertes actives
            {activeAlerts.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted">
                ({activeAlerts.length})
              </span>
            )}
          </h2>

          {activeAlerts.length === 0 ? (
            <div className="rounded-lg border border-edge bg-surface p-6 text-center shadow-sm">
              <p className="text-secondary text-sm">Aucune alerte active.</p>
              <p className="text-muted text-xs mt-1">
                Créez une alerte ci-dessus pour commencer.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onDelete={() => handleDelete(alert.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Triggered alerts */}
      {!loading && triggered.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-primary mb-2">
            Alertes déclenchées
            <span className="ml-2 text-xs font-normal text-muted">
              ({triggered.length})
            </span>
          </h2>
          <div className="space-y-2">
            {triggered.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onDelete={() => handleDelete(alert.id)}
                isTriggered
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AlertCard({
  alert,
  onDelete,
  isTriggered = false,
}: {
  alert: AlertData;
  onDelete: () => void;
  isTriggered?: boolean;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  };

  const conditionLabel =
    alert.type === "price_above"
      ? `> ${alert.condition_value}`
      : alert.type === "price_below"
      ? `< ${alert.condition_value}`
      : alert.type === "change_pct"
      ? `${alert.condition_value}%`
      : "";

  return (
    <div
      className={`rounded-lg border p-3 flex items-center justify-between gap-3 transition-all duration-150 ${
        isTriggered
          ? "border-green-300/30 bg-green-50/50 dark:bg-green-900/20"
          : "border-edge bg-surface hover:border-navy/30 hover:shadow-sm"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Ticker */}
        <span className="text-sm font-bold text-navy font-mono flex-shrink-0">
          {alert.ticker}
        </span>

        {/* Type badge */}
        <span className="text-[10px] text-muted border border-edge rounded px-1.5 py-0.5 bg-bg flex-shrink-0">
          {formatAlertType(alert.type)}
        </span>

        {/* Condition */}
        {conditionLabel && (
          <span className="text-sm text-primary font-mono flex-shrink-0">
            {conditionLabel}
          </span>
        )}

        {/* Message */}
        {alert.message && (
          <span className="text-xs text-muted truncate hidden sm:inline">
            {alert.message}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Triggered timestamp */}
        {isTriggered && alert.triggered_at && (
          <span className="text-[10px] text-green-700 dark:text-green-400 hidden sm:inline">
            {formatDate(alert.triggered_at)}
          </span>
        )}

        {/* Created date */}
        {!isTriggered && (
          <span className="text-[10px] text-muted hidden sm:inline">
            {formatDate(alert.created_at)}
          </span>
        )}

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-muted hover:text-red-500 transition-colors text-xs disabled:opacity-50"
          title="Supprimer"
        >
          {deleting ? "..." : "✕"}
        </button>
      </div>
    </div>
  );
}
