const db = window.db;

const votesList = document.getElementById("votesList");
if (!votesList) throw new Error("votesList не найден!");

// ==================== Таймер собрания ХОСТ ====================
let votingMeetingTimer = null;

// Следим за собранием (meetings)
db.ref("meetings").on("value", async (snap) => {
  const m = snap.val();

  // Если собрание активно и таймер ещё не ставили
  if (m?.active && !m.timerSet) {
    await db.ref("meetings/timerSet").set(true); // Помечаем, что таймер уже стоит
    if (votingMeetingTimer) clearTimeout(votingMeetingTimer);

    // Через 20 секунд считаем голоса
    votingMeetingTimer = setTimeout(async () => {
      const mSnap = await db.ref("meetings").once("value");
      const meeting = mSnap.val();
      if (!meeting) return;

      // Считаем "kick"/"skip"
      const votes = meeting.votes || {};
      let kick = 0, skip = 0;
      Object.values(votes).forEach(v => {
        if (v === "kick") kick++;
        else if (v === "skip") skip++;
      });

      const totalVotes = kick + skip;

      // Получаем количество живых игроков
      const playersSnap = await db.ref("players").once("value");
      const players = playersSnap.val() || {};
      const aliveCount = Object.values(players).filter(p => p.status === "alive").length;

      // Если проголосовало больше половины живых "kick" — кикаем!
      if (totalVotes > 0 && (kick / aliveCount) > 0.5) {
        await db.ref(`players/${meeting.target}/status`).set("dead");
      }

      // Ставим глобальный кулдаун (например, 60 сек)
      await db.ref("game/globalCooldownUntil").set(Date.now() + 60000);

      // Очищаем suspicion и meetings
      await db.ref(`suspicion/${meeting.target}`).remove();
      await db.ref("meetings").set(null);

    }, 20000); // 20 секунд!
  }
});

// ==================== Голоса за подозреваемых (suspicion) ====================
db.ref("suspicion").on("value", (snapshot) => {
  const votes = snapshot.val();
  votesList.innerHTML = "";
  if (!votes) {
    votesList.innerHTML = "<li>Нет активных голосований</li>";
    return;
  }
  Object.entries(votes).forEach(([target, voters]) => {
    // Считаем только те голоса, что ещё не истекли
    const activeVoters = Object.entries(voters || {})
      .filter(([_, expireAt]) => expireAt > Date.now());
    votesList.innerHTML += `<li>Игрок №${target}: ${activeVoters.length} голосов</li>`;
  });
});
