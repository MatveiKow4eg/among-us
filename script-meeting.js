// ==================== Таймер собрания ХОСТ ====================
let votingMeetingTimer = null;

db.ref("meetings").on("value", async (snap) => {
  const m = snap.val();
  console.log("Meeting data: ", m);  // Логируем данные собрания

  // Если нет активного собрания — ничего не делаем
  if (!m || !m.active) return;

  // Если таймер уже установлен — ничего не делаем
  if (m.timerSet) return;

  // Отмечаем, что таймер установлен
  await db.ref("meetings/timerSet").set(true);

  // Очищаем предыдущий таймер
  if (votingMeetingTimer) clearTimeout(votingMeetingTimer);

  console.log("⏳ Собрание началось, таймер на 20 секунд...");

  votingMeetingTimer = setTimeout(async () => {
    const mSnap = await db.ref("meetings").once("value");
    const meeting = mSnap.val();
    console.log("Meeting after timeout: ", meeting);  // Логируем данные собрания после таймера
    if (!meeting) return;

    // Инициализация votes, если оно пустое или не существует
    let votes = meeting.votes || {};
    console.log("Votes: ", votes);  // Логируем данные голосов

    // Если нет голосов, завершаем собрание
    if (Object.keys(votes).length === 0) {
      console.log("Нет голосов, собрание завершено");
      await db.ref("meetings").set(null);
      return;
    }

    let kick = 0, skip = 0;
    Object.values(votes).forEach(v => {
      if (v === "kick") kick++;
      else if (v === "skip") skip++;
    });

    const totalVotes = kick + skip;
    if (totalVotes > 0 && (kick / totalVotes) > 0.5) {
      await db.ref(`players/${meeting.target}/status`).set("dead");
    }

    await db.ref("game/globalCooldownUntil").set(Date.now() + 60000);
    await db.ref("meetings").set(null);

    console.log("✅ Собрание завершено");
  }, 20000);
});
