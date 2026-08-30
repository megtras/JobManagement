"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface Branch { id: string; name: string }

interface BranchScopeValue {
  branches: Branch[];
  isSupervisor: boolean;
  selectedBranchId: string;
  setSelectedBranchId: (id: string) => void;
}

export const BRANCH_SCOPE_STORAGE_KEY = "genplusaircond.supervisorBranchId";

const BranchScopeContext = createContext<BranchScopeValue | null>(null);

function isValidBranchId(id: string, branches: Branch[]) {
  return id === "ALL" || branches.some((branch) => branch.id === id);
}

export function BranchScopeProvider({
  branches,
  isSupervisor,
  children,
}: {
  branches: Branch[];
  isSupervisor: boolean;
  children: ReactNode;
}) {
  const [selectedBranchId, setSelectedBranchIdState] = useState("ALL");

  useEffect(() => {
    if (!isSupervisor) {
      setSelectedBranchIdState("ALL");
      return;
    }

    const stored = window.localStorage.getItem(BRANCH_SCOPE_STORAGE_KEY);
    if (stored && isValidBranchId(stored, branches)) {
      setSelectedBranchIdState(stored);
    }
  }, [branches, isSupervisor]);

  const setSelectedBranchId = (id: string) => {
    const next = isValidBranchId(id, branches) ? id : "ALL";
    setSelectedBranchIdState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BRANCH_SCOPE_STORAGE_KEY, next);
    }
  };

  useEffect(() => {
    if (isSupervisor && !isValidBranchId(selectedBranchId, branches)) {
      setSelectedBranchId("ALL");
    }
  }, [branches, isSupervisor, selectedBranchId]);

  const value = useMemo(
    () => ({ branches, isSupervisor, selectedBranchId, setSelectedBranchId }),
    [branches, isSupervisor, selectedBranchId],
  );

  return <BranchScopeContext.Provider value={value}>{children}</BranchScopeContext.Provider>;
}

export function useBranchScope() {
  const context = useContext(BranchScopeContext);
  if (!context) {
    return {
      branches: [],
      isSupervisor: false,
      selectedBranchId: "ALL",
      setSelectedBranchId: () => {},
    } satisfies BranchScopeValue;
  }
  return context;
}

export function BranchScopeSelector() {
  const { branches, isSupervisor, selectedBranchId, setSelectedBranchId } = useBranchScope();
  if (!isSupervisor || branches.length === 0) return null;

  const options = [{ id: "ALL", name: "All Branches" }, ...branches];

  return (
    <div className="mx-3 mb-4 rounded-xl bg-[#0d2225] p-3">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Branch</p>
      <div role="radiogroup" aria-label="Branch" className="mt-2 space-y-1">
        {options.map((option) => {
          const active = selectedBranchId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelectedBranchId(option.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                active ? "bg-[#1ea89b]/15 text-white" : "text-neutral-300 hover:bg-[#1ea89b]/10 hover:text-white"
              }`}
            >
              <span
                className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 ${
                  active ? "border-[#1ea89b]" : "border-neutral-600"
                }`}
              >
                {active && <span className="h-1.5 w-1.5 rounded-full bg-[#1ea89b]" />}
              </span>
              <span className="truncate">{option.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
