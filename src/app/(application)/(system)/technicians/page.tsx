import { redirect } from "next/navigation";

// Technicians are now part of the merged "Teams & Technicians" page.
export default function TechniciansPage() {
  redirect("/teams");
}
