import { notFound } from "next/navigation";
import Link from "next/link";
import { Calendar, Clock, MapPin, Users, Wrench, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { MegtrasLogo } from "@/components/brand/MegtrasLogo";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  COMING_SOON: { label: "Upcoming", cls: "bg-blue-100 text-blue-700" },
  IN_PROGRESS: { label: "In Progress", cls: "bg-amber-100 text-amber-700" },
  DONE: { label: "Completed", cls: "bg-green-100 text-green-700" },
};

function formatDate(date: Date) {
  return date.toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default async function SharedAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const appt = await prisma.appointment.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true } },
      teams: { select: { name: true } },
      assets: { include: { jobCategory: { select: { name: true } } } },
    },
  });
  if (!appt) notFound();

  const status = STATUS[appt.status] ?? STATUS.COMING_SOON;
  const isWarranty = appt.billingType === "WARRANTY";
  const total = isWarranty ? "FOC" : `RM ${Number(appt.totalPrice).toFixed(2)}`;
  const ref = `GP-${String(appt.jobNo).padStart(4, "0")}`;
  const time = `${appt.time}${appt.timeFinish ? ` - ${appt.timeFinish}` : ""}`;
  const teamNames = appt.teams.map((team) => team.name).join(", ") || "To be assigned";

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* ── Banner ── */}
      <header className="bg-linear-to-br from-[#151513] to-[#26251f] text-white">
        <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex h-12 w-40 items-center justify-center rounded-2xl bg-white px-4 shadow-sm">
              <MegtrasLogo className="h-8 w-auto" />
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.cls}`}>{status.label}</span>
          </div>
          <div className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
              Appointment Confirmation
            </p>
            <h1 className="mt-1.5 text-2xl font-bold sm:text-3xl">{appt.jobTitle || "Aircond Service"}</h1>
            <p className="mt-1 text-sm text-white/85">Reference: {ref}</p>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="mx-auto max-w-2xl space-y-4 px-5 py-6 sm:py-8">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-sm text-gray-500">Dear <span className="font-semibold text-gray-800">{appt.customer.name}</span>,</p>
          <p className="mt-1 text-sm leading-relaxed text-gray-600">
            Thank you for choosing Megtras. Here are the details of your scheduled service.
          </p>

          <dl className="mt-5 space-y-4">
            <DetailRow icon={Calendar} label="Date">{formatDate(appt.date)}</DetailRow>
            <DetailRow icon={Clock} label="Time">{time}</DetailRow>
            <DetailRow icon={MapPin} label="Location">{appt.locationAddress || "-"}</DetailRow>
            <DetailRow icon={Users} label="Assigned Team">{teamNames}</DetailRow>
          </dl>
        </section>

        {/* Service items */}
        {appt.assets.length > 0 && (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Wrench className="h-4 w-4 text-[#151513]" /> Service Items
            </h2>
            <ul className="mt-3 divide-y divide-gray-100">
              {appt.assets.map((asset) => (
                <li key={asset.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      {asset.acType ? `${asset.acType}: ` : ""}{asset.label || "Unit"}
                    </p>
                    {asset.jobCategory?.name && (
                      <p className="text-xs text-gray-500">{asset.jobCategory.name}</p>
                    )}
                  </div>
                  {!isWarranty && (
                    <span className="shrink-0 text-sm font-medium text-gray-700">
                      RM {Number(asset.unitPrice).toFixed(2)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
              <span className="text-sm font-semibold text-gray-800">Total</span>
              <span className="text-base font-bold text-[#151513]">{total}</span>
            </div>
          </section>
        )}

        {/* Terms link */}
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#151513]" />
            <p className="text-sm leading-relaxed text-gray-600">
              By confirming this booking, you agree to our{" "}
              <Link href="/terms-and-conditions" className="font-semibold text-[#151513] underline decoration-[#F2B705]/60 underline-offset-2 hover:text-[#26251f]">
                Terms &amp; Conditions
              </Link>{" "}
              for the air conditioner cleaning service.
            </p>
          </div>
        </section>

        <footer className="pt-2 text-center text-xs text-gray-400">
          © 2026 Megtras · 012-2579290
        </footer>
      </main>
    </div>
  );
}

function DetailRow({ icon: Icon, label, children }: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F2B705]/15">
        <Icon className="h-4 w-4 text-[#151513]" />
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-gray-400">{label}</dt>
        <dd className="text-sm font-medium text-gray-800">{children}</dd>
      </div>
    </div>
  );
}
