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
      // Для случая "никого не кикнули" (можешь добавить свой экран, если нужно)
      await db.ref("meetings").set(null);
      return;
    }

    let kick = 0, skip = 0;
    Object.values(votes).forEach(v => {
      if (v === "kick") kick++;
      else if (v === "skip") skip++;
    });

    const totalVotes = kick + skip;
    let kicked = false;

    if (totalVotes > 0 && (kick / totalVotes) > 0.5 && meeting.target) {
      // Кик игрока, которого выбрали
      await db.ref(`players/${meeting.target}/status`).set("dead");
      // Получаем роль кикнутого
      const playerRoleSnap = await db.ref(`players/${meeting.target}/role`).once("value");
      const playerRole = playerRoleSnap.val() || "crew";
      // Сохраняем инфу о кике для всех клиентов
      await db.ref("game/lastKicked").set({
        number: meeting.target,
        role: playerRole,
        shownAt: Date.now()
      });
      kicked = true;
    }

    await db.ref("game/globalCooldownUntil").set(Date.now() + 60000);
    await db.ref("meetings").set(null);

    console.log(`✅ Собрание завершено${kicked ? " — был кик" : ""}`);
    
  }, 20000);
});
