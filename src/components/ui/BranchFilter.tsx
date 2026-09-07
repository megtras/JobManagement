"use client";

interface Branch { id: string; name: string }

interface Props {
  branches: Branch[];
  value: string;
  onChange: (id: string) => void;
}

export function BranchFilter({ branches, value, onChange }: Props) {
  return (
    <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden text-sm">
      <button
        onClick={() => onChange("ALL")}
        className={`px-3 py-1.5 font-medium transition ${
          value === "ALL" ? "bg-[#151513] text-white" : "text-gray-600 hover:bg-gray-50"
        }`}
      >
        All
      </button>
      {branches.map((b) => (
        <button
          key={b.id}
          onClick={() => onChange(b.id)}
          className={`px-3 py-1.5 font-medium transition border-l border-gray-200 ${
            value === b.id ? "bg-[#151513] text-white" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          {b.name}
        </button>
      ))}
    </div>
  );
}
