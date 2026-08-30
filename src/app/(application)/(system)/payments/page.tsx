import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CreditCard } from "lucide-react";
import { PaymentsClient } from "@/components/payments/PaymentsClient";

export default async function PaymentsPage() {
  const session = await getServerSession(authOptions);
  const role = session!.user.role;

  // TECHNICIAN can't reach this page (proxy blocks it),
  // but we gate approve capability to ADMIN/MANAGER/SUPERVISOR
  const canApprove = role === "ADMIN" || role === "MANAGER" || role === "SUPERVISOR";

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <CreditCard className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
      </div>
      <PaymentsClient canApprove={canApprove} />
    </div>
  );
}
