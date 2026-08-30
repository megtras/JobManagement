import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getAllBranches } from "@/lib/actions/branches";
import { BranchesClient } from "@/components/branches/BranchesClient";

export default async function BranchesPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role === "TECHNICIAN") redirect("/tasks");

  const branches = await getAllBranches();
  return <BranchesClient branches={branches} />;
}
