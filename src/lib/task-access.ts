export function technicianTeamAccessWhere(userId: string, userName?: string | null) {
  return {
    teams: {
      some: {
        OR: [
          { members: { some: { id: userId } } },
          ...(userName ? [{ name: userName }] : []),
        ],
      },
    },
  };
}
