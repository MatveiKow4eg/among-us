// ==================== Firebase конфигурация ====================
const firebaseConfig = {
  apiKey: "AIzaSyCv0aQq6jTRdPPcTi8yjH4K9goky1IcHqQ",
  authDomain: "among-us-3c0e0.firebaseapp.com",
  databaseURL: "https://among-us-3c0e0-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "among-us-3c0e0",
  storageBucket: "among-us-3c0e0.appspot.com",
  messagingSenderId: "430810539681",
  appId: "1:430810539681:web:6b87449fd40e17cb0b72e0"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

document.addEventListener("DOMContentLoaded", () => {
  const playersList = document.getElementById("playersList");
  const startBtn = document.getElementById("startGameBtn");
  const stopBtn = document.getElementById("stopGameBtn");
  const clearBtn = document.getElementById("clearPlayersBtn");
  const assignRolesBtn = document.getElementById("assignRolesBtn");
  const gameStateLabel = document.getElementById("gameStateLabel");
  const votingTimer = document.getElementById("votingTimer");

  // Обновление состояния игры
  db.ref("game/state").on("value", (snap) => {
    const state = snap.val();
    gameStateLabel.textContent = state === "started" ? "Игра запущена" : "Игра остановлена";
  });

  // Отображение игроков
  db.ref("players").on("value", (snapshot) => {
    const players = snapshot.val() || {};
    playersList.innerHTML = "";
    Object.entries(players).forEach(([id, player]) => {
      const div = document.createElement("div");
      div.innerHTML = `
        <strong>№${id}</strong> — ${player.status === "alive" ? "🟢 Жив" : "⚰️ Мёртв"}<br>
        Роль: ${player.role || "?"}<br>
      `;

      const killBtn = document.createElement("button");
      killBtn.textContent = "Убить";
      killBtn.onclick = () => db.ref(`players/${id}/status`).set("dead");

      const reviveBtn = document.createElement("button");
      reviveBtn.textContent = "Оживить";
      reviveBtn.onclick = () => db.ref(`players/${id}/status`).set("alive");

      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Удалить";
      deleteBtn.onclick = () => db.ref(`players/${id}`).remove();

      div.append(killBtn, reviveBtn, deleteBtn);
      div.style.marginBottom = "15px";
      playersList.appendChild(div);
    });
  });

  // Кнопка запуска игры
  startBtn.addEventListener("click", () => {
    db.ref("players").once("value").then((snap) => {
      const ids = Object.keys(snap.val() || {});
      const shuffled = ids.sort(() => 0.5 - Math.random()).slice(0, 10);
      const updates = {};

      ids.forEach(id => {
        updates[`players/${id}/role`] = shuffled.includes(id) ? "imposter" : "crew";
      });

      const now = Date.now();
      const openAt = now + 1 * 60 * 1000;   // через 1 минуту начнется голосование
      const closeAt = openAt + 1 * 60 * 1000; // голосование будет длиться 1 минуту

      updates["game/state"] = "started";
      updates["game/startedAt"] = now;
      updates["game/voting"] = {
        openAt,
        closeAt,
        status: "open",
        cycleActive: true   // запускаем цикл голосования
      };

      return db.ref().update(updates);
    });
  });

  // Кнопка остановки игры
  stopBtn.addEventListener("click", () => {
    if (confirm("Остановить игру?")) {
      db.ref().update({
        "game/state": "waiting",
        "game/startedAt": null,
        "game/voting": null,
        "suspicion": null,
        "meetings": null
      });
    }
  });

  // Кнопка очистки игроков
  clearBtn.addEventListener("click", () => {
    if (confirm("Удалить всех игроков?")) {
      db.ref().update({
        players: null,
        meetings: null,
        game: { state: "waiting", startedAt: null },
        suspicion: null
      });
    }
  });

  // Назначение ролей вручную
  assignRolesBtn.addEventListener("click", () => {
    db.ref("players").once("value").then((snap) => {
      const ids = Object.keys(snap.val() || {});
      const shuffled = ids.sort(() => 0.5 - Math.random()).slice(0, 10);
      const updates = {};
      ids.forEach(id => {
        updates[`players/${id}/role`] = shuffled.includes(id) ? "imposter" : "crew";
      });
      return db.ref().update(updates);
    }).then(() => {
      alert("Роли назначены.");
    });
  });

  // Отображение таймера голосования
  let timerInterval = null;
  function formatTime(ms) {
    const sec = Math.ceil(ms / 1000);
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function updateVotingTimer() {
    db.ref("game/voting").on("value", (snap) => {
      const voting = snap.val();
      if (timerInterval) clearInterval(timerInterval);

      if (!voting) {
        votingTimer.innerText = "⛔ Нет голосования";
        return;
      }

      const openAt = voting.openAt;
      const closeAt = voting.closeAt;

      function render() {
        const now = Date.now();
        if (now < openAt) {
          votingTimer.innerText = `⏳ До голосования: ${formatTime(openAt - now)}`;
        } else if (now <= closeAt) {
          votingTimer.innerText = `✅ Голосование: ${formatTime(closeAt - now)}`;
        } else {
          votingTimer.innerText = `❌ Закрыто`;
        }
      }

      render();
      timerInterval = setInterval(render, 1000);
    });
  }

  // Цикл автоматического голосования
function votingCycleWatcher() {
  setInterval(() => {
    db.ref("game/voting").once("value").then((snap) => {
      const voting = snap.val();
      if (!voting || !voting.cycleActive) return;

      const now = Date.now();

      if (now > voting.closeAt) {
        db.ref("meetings").once("value").then((mSnap) => {
          const meeting = mSnap.val();

          if (!meeting || !meeting.active) {
            const nextOpen = now + 60_000;
            const nextClose = nextOpen + 60_000;

            db.ref("game/voting").update({
              openAt: nextOpen,
              closeAt: nextClose,
              status: "open"
            });

            db.ref("suspicion").remove();
          }
        });
      }
    });
  }, 5000); // Проверять каждые 5 секунд
}



  // Запускаем отслеживание и таймеры
  votingCycleWatcher();
  updateVotingTimer();
});
