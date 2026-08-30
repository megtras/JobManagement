import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TaskDetailClient } from "@/components/tasks/TaskDetailClient";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "TECHNICIAN") redirect("/");

  const minEvidencePhotos = Math.max(3, Number(process.env.MIN_EVIDENCE_PHOTOS ?? 3));
  const geofenceRadius = Number(process.env.GEOFENCE_RADIUS_METERS ?? 200);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/tasks" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Task Detail</h1>
      </div>
      <TaskDetailClient taskId={id} minEvidencePhotos={minEvidencePhotos} geofenceRadius={geofenceRadius} />
    </div>
  );
}
