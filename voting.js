let lastSuspicionSnapshot = null;
let lastPlayersSnapshot = null;

const votesList = document.getElementById("votesList");

// Сохраняем последние snapshots обоих веток
window.db.ref("suspicion").on("value", (snapshot) => {
  lastSuspicionSnapshot = snapshot;
  updateVotesList();
});

window.db.ref("players").on("value", (snapshot) => {
  lastPlayersSnapshot = snapshot;
  updateVotesList();
});

function updateVotesList() {
  // Ждём, пока не будут оба snapshot'а
  if (!lastSuspicionSnapshot || !lastPlayersSnapshot || !votesList) return;

  const votes = lastSuspicionSnapshot.val() || {};
  const players = lastPlayersSnapshot.val() || {};

  votesList.innerHTML = "";

  if (Object.keys(votes).length === 0) {
    votesList.innerHTML = "<li>Нет активных голосований</li>";
    return;
  }

  Object.entries(votes).forEach(([target, voters]) => {
    const aliveVoters = Object.entries(voters || {})
      .map(([voter]) => voter)
      .filter((voter) => players[voter] && players[voter].status === "alive");

    const li = document.createElement("li");
    li.textContent = `Игрок №${target} — голосуют: ${aliveVoters.length > 0 ? aliveVoters.join(", ") : "никто"}`;
    votesList.appendChild(li);

    if (aliveVoters.length >= 10) {
      window.db.ref(`suspicion/${target}`).remove();
      window.db.ref("meetings").set({
        active: true,
        target: Number(target),
        votes: {},
        timerSet: false,
        startedAt: Date.now()
      });
    }
  });
}
