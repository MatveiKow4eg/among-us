document.addEventListener("DOMContentLoaded", () => {
  const playersList = document.getElementById("playersList");
  const startBtn = document.getElementById("startGameBtn");
  const stopBtn = document.getElementById("stopGameBtn");
  const clearBtn = document.getElementById("clearPlayersBtn");
  const assignRolesBtn = document.getElementById("assignRolesBtn");
  const gameStateLabel = document.getElementById("gameStateLabel");
  const votingTimer = document.getElementById("votingTimer");
  const playerFilter = document.getElementById("playerFilter");
  const imposterInput = document.getElementById("imposterCountInput");
  const imposterStatusText = document.getElementById("imposterStatusText");
  const imposterControlBlock = document.getElementById("imposterControlBlock");
  const voteThresholdInput = document.getElementById("voteThresholdInput");
const voteThresholdStatus = document.getElementById("voteThresholdStatus");
const setVoteThresholdBtn = document.getElementById("setVoteThresholdBtn");




setVoteThresholdBtn?.addEventListener("click", () => {
  const value = parseInt(voteThresholdInput?.value, 10);
if (isNaN(value) || value < 1 || value > 90) {
  alert("Введите число от 1 до 90");
  return;
}
  db.ref("game/voteThreshold").set(value)
    .then(() => {
      voteThresholdStatus.textContent = `Порог установлен: ${value}`;
      voteThresholdStatus.style.color = "green";
    })
    .catch((err) => {
      voteThresholdStatus.textContent = "Ошибка при обновлении порога";
      voteThresholdStatus.style.color = "red";
      console.error("Ошибка:", err);
    });
});

db.ref("game/voteThreshold").once("value").then((snap) => {
  const val = snap.val();
  if (val && voteThresholdInput) voteThresholdInput.value = val;
});


// Следим за состоянием игры и переключаем отображение
db.ref("game/state").on("value", (snap) => {
  const state = snap.val();

  if (state === "started") {
    // Скрыть input, показать онлайн-импостеров
    if (imposterInput) imposterInput.style.display = "none";
    if (imposterStatusText) {
      imposterStatusText.style.display = "block";
      updateImposterOnlineCount();
    }
  } else {
    // Игра остановлена: если роли уже назначены — показать их количество
    db.ref("game/imposterCount").on("value", (snap) => {
  const imposterCount = snap.val();
  db.ref("game/state").once("value").then((stateSnap) => {
    const state = stateSnap.val();

    if (state === "started") {
      if (imposterInput) imposterInput.style.display = "none";
      if (imposterStatusText) {
        imposterStatusText.style.display = "block";
        updateImposterOnlineCount();
      }
    } else {
      if (imposterCount) {
        if (imposterInput) imposterInput.style.display = "none";
        if (imposterStatusText) {
          imposterStatusText.style.display = "block";
          updateImposterStatus();
        }
      } else {
        if (imposterInput) imposterInput.style.display = "block";
        if (imposterStatusText) imposterStatusText.style.display = "none";
      }
    }
  });
});

  }
});

// Обновление текста: Импостеров в игре: X
function updateImposterStatus() {
  db.ref("players").once("value").then((snap) => {
    const players = snap.val() || {};
    const count = Object.values(players).filter(p => p.role === "imposter" && p.status === "alive").length;
    if (imposterStatusText) imposterStatusText.textContent = `Импостеров в игре: ${count}`;
  });
}

// Обновление текста: Импостеров онлайн: X
function updateImposterOnlineCount() {
  db.ref("players").on("value", (snap) => {
    const players = snap.val() || {};
    const count = Object.values(players).filter(p => p.role === "imposter" && p.status === "alive").length;
    if (imposterStatusText) imposterStatusText.textContent = `Импостеров онлайн: ${count}`;
  });
}


  let allPlayers = {};

  // Обновление состояния игры
  db.ref("game/state").on("value", (snap) => {
    const state = snap.val();
    if (state === "started") {
  gameStateLabel.textContent = "Игра запущена";
  gameStateLabel.style.color = "#00ff88";
} else {
  gameStateLabel.textContent = "Игра остановлена";
  gameStateLabel.style.color = "#ff4444"; 
}
  });

  // Обновление списка игроков
  db.ref("players").on("value", (snapshot) => {
    allPlayers = snapshot.val() || {};
    renderPlayers();
  });

  // Фильтрация игроков
  if (playerFilter) {
    playerFilter.addEventListener("change", renderPlayers);
  }

  function renderPlayers() {
  const filter = playerFilter?.value || "all";
  playersList.innerHTML = "";

  Object.entries(allPlayers).forEach(([id, player]) => {
    if (filter === "alive" && player.status !== "alive") return;
    if (filter === "dead" && player.status !== "dead") return;
    if (filter === "imposter" && player.role !== "imposter") return;

    const div = document.createElement("div");
    div.className = "player-entry";
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

    const btnRow = document.createElement("div");
    btnRow.className = "player-buttons";
    btnRow.append(killBtn, reviveBtn, deleteBtn);

    div.appendChild(btnRow);
    playersList.appendChild(div);
  });
}


  // Кнопка запуска игры
startBtn?.addEventListener("click", async () => {
  const now = Date.now();

  // Проверим, назначены ли импостеры
  const countSnap = await db.ref("game/imposterCount").once("value");
  if (!countSnap.exists()) {
    alert("Сначала назначьте роли!");
    return;
  }

  // Запуск игры без изменения ролей
  await db.ref().update({
    "game/state": "started",
    "game/startedAt": now,
    "game/roleRevealStart": now + 1000
  });

  alert("Игра запущена!");
});


  // Кнопка остановки игры
 stopBtn?.addEventListener("click", () => {
  if (confirm("Остановить игру?")) {
    const updates = {
  "game/state": "waiting",
  "game/startedAt": null,
  "game/voting": null,
  "game/roleRevealStart": null,
  "game/imposterCount": null, // <== ДОБАВЛЕНО
  "suspicion": null,
  "meetings": null
};

    // Сброс ролей и статусов игроков
    db.ref("players").once("value").then((snap) => {
      const players = snap.val() || {};
      Object.keys(players).forEach(id => {
        updates[`players/${id}/role`] = "crew";  // или "?"
        updates[`players/${id}/status`] = "alive";
      });

      return db.ref().update(updates);
    }).then(() => {
      alert("Игра остановлена.");
    }).catch((err) => {
      console.error("Ошибка при остановке игры:", err);
    });
  }
});


  // Кнопка очистки игроков
  clearBtn?.addEventListener("click", () => {
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
  assignRolesBtn?.addEventListener("click", async () => {
  const countInput = document.getElementById("imposterCountInput");
  const count = parseInt(countInput?.value?.trim(), 10);

  if (isNaN(count) || count < 1) {
    alert("Введите корректное число импостеров!");
    return;
  }

  const snap = await db.ref("players").once("value");
  const ids = Object.keys(snap.val() || {});

  if (count > ids.length) {
    alert("Импостеров не может быть больше, чем игроков!");
    return;
  }

  const shuffled = ids.sort(() => 0.5 - Math.random());
  const imposters = shuffled.slice(0, count);

  const updates = {};
  ids.forEach(id => {
    updates[`players/${id}/role`] = imposters.includes(id) ? "imposter" : "crew";
  });

  await db.ref().update(updates);
  await db.ref("game/imposterCount").set(count); // (если нужно где-то использовать это число)

  alert(`Назначено импостеров: ${count}`);
});

})
