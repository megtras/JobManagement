"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, XCircle, Clock, Loader2, AlertCircle,
  CreditCard, User, Building2, Calendar, Image as ImageIcon, X,
} from "lucide-react";
import { useBranchScope } from "@/components/layout/BranchScopeProvider";
import { normalizeUploadUrl } from "@/lib/upload-urls";

interface PaymentRecord {
  id: string;
  method: string;
  amount: string;
  receiptPhotoUrl: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectReason: string | null;
  createdAt: string;
  approvedBy: { name: string } | null;
  appointment: {
    id: string;
    date: string;
    status: "COMING_SOON" | "IN_PROGRESS" | "DONE";
    approvedAt: string | null;
    customer: { name: string; phone: string };
    technician: { name: string } | null;
    branch: { id: string; name: string };
    jobCategory: { name: string } | null;
  };
}

type FilterStatus = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  QR_TRANSFER: "QR / Transfer",
  OFFICE: "Pay at Office",
};

const STATUS_CONFIG = {
  PENDING: { label: "Pending", className: "bg-amber-100 text-amber-700", icon: Clock },
  APPROVED: { label: "Approved", className: "bg-green-100 text-green-700", icon: CheckCircle2 },
  REJECTED: { label: "Rejected", className: "bg-red-100 text-red-700", icon: XCircle },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function PaymentsClient({ canApprove }: { canApprove: boolean }) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [filter, setFilter] = useState<FilterStatus>("PENDING");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Per-card state for reject flow
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Receipt lightbox
  const [lightbox, setLightbox] = useState<string | null>(null);
  const { selectedBranchId } = useBranchScope();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === "ALL" ? "" : `?status=${filter}`;
      const res = await fetch(`/api/payments${q}`);
      if (!res.ok) throw new Error("Failed");
      setPayments(await res.json());
      setError("");
    } catch {
      setError("Could not load payments.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // Approve & Close: finalise the job and approve its pending payment in one go.
  const handleClose = async (paymentId: string, appointmentId: string, customerName: string) => {
    if (!confirm(`Approve & close the job for "${customerName}"? This also approves the payment.`)) return;
    setActionLoading(paymentId);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Approve failed");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAction = async (id: string, action: "APPROVE" | "REJECT") => {
    if (action === "REJECT" && !rejectReason.trim()) return;

    setActionLoading(id);
    try {
      const res = await fetch(`/api/payments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectReason: rejectReason.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");

      // Update local state without full reload
      setPayments((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, status: data.status, rejectReason: rejectReason.trim() || null }
            : p
        )
      );
      setRejectingId(null);
      setRejectReason("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  const TABS: FilterStatus[] = ["PENDING", "APPROVED", "REJECTED", "ALL"];
  const filteredPayments = payments.filter((p) => selectedBranchId === "ALL" || p.appointment.branch.id === selectedBranchId);

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "ALL" ? "All" : STATUS_CONFIG[t].label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : filteredPayments.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CreditCard className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">No payments found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPayments.map((p) => {
            const cfg = STATUS_CONFIG[p.status];
            const StatusIcon = cfg.icon;
            const isRejecting = rejectingId === p.id;

            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.className}`}>
                        <StatusIcon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                      <span className="text-xs text-gray-400">{timeAgo(p.createdAt)}</span>
                    </div>
                    <p className="font-semibold text-gray-900 mt-1">{p.appointment.customer.name}</p>
                    {p.appointment.jobCategory && <p className="text-sm text-gray-500">{p.appointment.jobCategory.name}</p>}
                    {p.appointment.approvedAt && (
                      <span className="inline-flex items-center gap-1 mt-1 text-xs font-medium text-green-700">
                        <CheckCircle2 className="w-3 h-3" /> Job closed
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-gray-900">RM {Number(p.amount).toFixed(2)}</p>
                    <p className="text-xs text-gray-500">{METHOD_LABELS[p.method] ?? p.method}</p>
                  </div>
                </div>

                {/* Meta */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    {p.appointment.branch.name}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(p.appointment.date).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                  {p.appointment.technician && (
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      {p.appointment.technician.name}
                    </div>
                  )}
                  {p.approvedBy && (
                    <div className="flex items-center gap-1.5 text-green-600">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      By {p.approvedBy.name}
                    </div>
                  )}
                </div>

                {/* Receipt photo */}
                {p.receiptPhotoUrl && (
                  <button
                    onClick={() => setLightbox(normalizeUploadUrl(p.receiptPhotoUrl!))}
                    className="flex items-center gap-2 text-xs text-blue-600 hover:underline"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    View receipt photo
                  </button>
                )}

                {/* Reject reason */}
                {p.status === "REJECTED" && p.rejectReason && (
                  <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                    Reason: {p.rejectReason}
                  </div>
                )}

                {/* Actions — only for PENDING payments and users who can approve */}
                {canApprove && p.status === "PENDING" && (
                  <div className="pt-1 space-y-2">
                    {isRejecting ? (
                      <div className="space-y-2">
                        <textarea
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Reason for rejection…"
                          rows={2}
                          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction(p.id, "REJECT")}
                            disabled={!rejectReason.trim() || actionLoading === p.id}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                          >
                            {actionLoading === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                            Confirm Reject
                          </button>
                          <button
                            onClick={() => { setRejectingId(null); setRejectReason(""); }}
                            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {p.appointment.status === "DONE" && !p.appointment.approvedAt ? (
                          <button
                            onClick={() => handleClose(p.id, p.appointment.id, p.appointment.customer.name)}
                            disabled={actionLoading === p.id}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                          >
                            {actionLoading === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Approve &amp; Close
                          </button>
                        ) : (
                          <div className="flex-1 flex items-center text-xs text-gray-400">Awaiting job completion</div>
                        )}
                        <button
                          onClick={() => { setRejectingId(p.id); setRejectReason(""); }}
                          className="flex-1 flex items-center justify-center gap-1.5 border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium py-2 rounded-lg transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Receipt lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            aria-label="Close receipt viewer"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow-lg transition hover:bg-white"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox}
            alt="Receipt"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
