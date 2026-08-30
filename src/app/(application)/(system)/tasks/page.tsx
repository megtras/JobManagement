import { ClipboardList } from "lucide-react";
import { TasksClient } from "@/components/tasks/TasksClient";

export default function TasksPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <ClipboardList className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Team Tasks</h1>
      </div>
      <TasksClient />
    </div>
  );
}
