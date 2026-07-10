export const NO_TEAM_LABEL = 'Unassigned';

// Teams aren't a separate stored entity — a team "exists" simply because at
// least one employee's .team field is set to it. This derives the known
// team list straight from real data (admin's "+ New team" flow just adds an
// employee with a not-yet-used team name), so a newly created team shows up
// everywhere a team list is needed without a separate collection to keep in
// sync.
export function getKnownTeams(employees) {
  const teams = new Set();
  employees.forEach(e => { if (e.team) teams.add(e.team); });
  return Array.from(teams).sort((a, b) => a.localeCompare(b));
}

export function teamOf(employees, employeeName) {
  return employees.find(e => e.name === employeeName)?.team || NO_TEAM_LABEL;
}

// Alphabetical, with Unassigned always last — shared by every team grouping
// below so their section order stays consistent across pages.
function sortTeams(teams) {
  return teams.sort((a, b) => {
    if (a === NO_TEAM_LABEL) return 1;
    if (b === NO_TEAM_LABEL) return -1;
    return a.localeCompare(b);
  });
}

// Groups orders by team, with teams sorted alphabetically and Unassigned
// last, and each team's members sorted alphabetically by employee name.
export function groupByTeam(orders, employees) {
  const byTeam = new Map();
  orders.forEach(o => {
    const team = teamOf(employees, o.employee);
    if (!byTeam.has(team)) byTeam.set(team, []);
    byTeam.get(team).push(o);
  });
  byTeam.forEach(list => list.sort((a, b) => a.employee.localeCompare(b.employee)));
  return { byTeam, teams: sortTeams(Array.from(byTeam.keys())) };
}

// Groups employees themselves by team (rather than their orders) — same
// sort order as groupByTeam, for the admin roster view.
export function groupEmployeesByTeam(employees) {
  const byTeam = new Map();
  employees.forEach(e => {
    const team = e.team || NO_TEAM_LABEL;
    if (!byTeam.has(team)) byTeam.set(team, []);
    byTeam.get(team).push(e);
  });
  byTeam.forEach(list => list.sort((a, b) => a.name.localeCompare(b.name)));
  return { byTeam, teams: sortTeams(Array.from(byTeam.keys())) };
}
