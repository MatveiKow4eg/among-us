const db = firebase.database();

function checkForMeetingTrigger() {
  db.ref("players").once("value", (snap) => {
    const players = snap.val();
    if (!players) return;

    // Проверим, есть ли уже активное собрание
    db.ref("meetings/active").once("value", (meetingSnap) => {
      const meetingActive = meetingSnap.val();
      if (meetingActive) return;

      for (let targetId in players) {
        const p = players[targetId];
        if (!p.votesAgainst) continue;

        // Удалим дубликаты на всякий случай
        const uniqueVotes = [...new Set(p.votesAgainst)];
        if (uniqueVotes.length >= 10) {
          // Начинаем собрание
          db.ref("meetings").set({
            active: true,
            target: targetId,
            votes: {}
          });

          // Сбросим все голоса против этого игрока
          db.ref("players/" + targetId + "/votesAgainst").set([]);

          break;
        }
      }
    });
  });
}

// Проверяем каждые 5 секунд
setInterval(checkForMeetingTrigger, 5000);
