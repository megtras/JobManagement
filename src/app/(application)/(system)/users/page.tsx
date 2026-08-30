import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getUsers, getBranches } from "@/lib/actions/users";
import { UsersClient } from "@/components/users/UsersClient";

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === "TECHNICIAN") redirect("/tasks");

  const [users, allBranches] = await Promise.all([getUsers(), getBranches()]);
  // Manager/Admin only assign within their own branch.
  const branches = session.user.role === "SUPERVISOR"
    ? allBranches
    : allBranches.filter((b) => b.id === session.user.branchId);

  return (
    <UsersClient
      users={users as Parameters<typeof UsersClient>[0]["users"]}
      branches={branches}
      currentUserId={session.user.id}
      isSupervisor={session.user.role === "SUPERVISOR"}
    />
  );
}
