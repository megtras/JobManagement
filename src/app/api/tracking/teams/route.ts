import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTeamTracking } from "@/lib/team-tracking";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "TECHNICIAN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const teamTracking = await getTeamTracking(session.user.role, session.user.branchId);
  return NextResponse.json({ teamTracking });
}
