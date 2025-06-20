let canVote = true;

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

// ==================== Централизованная обработка удаления игрока ====================
function handlePlayerDeletion() {
  localStorage.removeItem("playerNumber");

  document.querySelectorAll(".screen, #hudScreen, #waitingScreen, #roleScreen, #countdownScreen").forEach(el => {
    el.style.display = "none";
    el.classList.remove("active");
  });

  const registerScreen = document.getElementById("registerScreen");
  if (registerScreen) {
    registerScreen.style.display = "flex";
    registerScreen.classList.add("active");

    const input = document.getElementById("playerInput");
    if (input) input.focus();
  }

  setTimeout(() => {
    alert("Вы были удалены админом.");
  }, 100);
}

// ==================== DOMContentLoaded ====================
document.addEventListener("DOMContentLoaded", () => {
  const registerScreen = document.getElementById("registerScreen");
  const playerInput = document.getElementById("playerInput");
  const registerBtn = document.getElementById("registerBtn");

  registerBtn.addEventListener("click", () => {
    const number = playerInput.value.trim();
    if (!/^\d+$/.test(number) || Number(number) < 1 || Number(number) > 60) {
      alert("Введите корректный номер от 1 до 60");
      return;
    }
    initHUD(number);
  });

  const savedNumber = localStorage.getItem("playerNumber");
  if (savedNumber) {
    db.ref("players/" + savedNumber).once("value").then((snap) => {
      if (snap.exists()) {
        initHUD(savedNumber);
      } else {
        localStorage.removeItem("playerNumber");
      }
    });
  }
});

function initHUD(number) {
  const registerScreen = document.getElementById("registerScreen");
  const waitingScreen = document.getElementById("waitingScreen");
  const hudScreen = document.getElementById("hudScreen");
  const roleButton = document.getElementById("roleButton");
  const countdownScreen = document.getElementById("countdownScreen");
  const countdownNumber = document.getElementById("countdownNumber");
  const roleScreen = document.getElementById("roleScreen");
  const roleText = document.getElementById("roleText");
  

  const playerRef = db.ref("players/" + number);
  const playerNumber = number;
  localStorage.setItem("playerNumber", number);

  // Скрываем все экраны кроме ожидания
  document.querySelectorAll(".screen, #hudScreen").forEach(el => {
    el.style.display = "none";
    el.classList.remove("active");
  });

  registerScreen.style.display = "none";
  waitingScreen.style.display = "flex";

  const avatarColors = ['red', 'blue', 'orange', 'black', 'white', 'pink'];
  const avatarColor = avatarColors[(number - 1) % avatarColors.length];
  document.getElementById("playerAvatar").src = `avatars/${avatarColor}.webp`;

  // Создать игрока, если его нет, или добавить joinedAt, если отсутствует
  db.ref("players/" + number).once("value").then((snap) => {
    const data = snap.val();
    if (!snap.exists()) {
      return playerRef.set({
        status: "alive",
        votedAt: 0,
        role: "crew", 
        joinedAt: Date.now()
      });
    } else if (!data.joinedAt) {
      return playerRef.update({ joinedAt: Date.now() });
    }
  }).then(() => {
    playerRef.on("value", (snapshot) => {
      if (!snapshot.exists()) {
        handlePlayerDeletion();
      }
    });

    db.ref("game/state").on("value", (snap) => {
      const state = snap.val();
      if (state === "waiting") {
        handleGameResetToWaiting();
      }
    });
    
    // Следим за стартом игры
    db.ref("game").on("value", (snap) => {
      const game = snap.val();
      if (game?.state === "started") {
        db.ref("game").off(); // отписываемся от слушателя

        // Получаем joinedAt игрока
        playerRef.once("value").then((snap) => {
          const playerData = snap.val();
          if (!playerData?.joinedAt || !game?.startedAt) return;

          if (playerData.joinedAt > game.startedAt) {
            // Игрок зашёл после начала — без отсчёта и роли
            waitingScreen.style.display = "none";
            hudScreen.style.display = "block";
            roleButton.style.display = "block";
            setupPlayerUI(playerRef, playerNumber);
          } else {
            // Игрок ждал — запускаем отсчёт и роль
            startGameSequence(game, playerRef, playerNumber);
          }
        });
      }
    });
  });
}


function startGameSequence(game, playerRef, playerNumber) {
  const waitingScreen = document.getElementById("waitingScreen");
  const hudScreen = document.getElementById("hudScreen");
  const roleButton = document.getElementById("roleButton");
  const countdownScreen = document.getElementById("countdownScreen");
  const countdownNumber = document.getElementById("countdownNumber");
  const roleScreen = document.getElementById("roleScreen");
  const roleText = document.getElementById("roleText");

  waitingScreen.style.display = "none";

  Promise.all([
    db.ref("players/" + playerNumber).once("value"),
    db.ref("players/" + playerNumber + "/role").once("value")
  ]).then(([playerSnap, roleSnap]) => {
    const playerData = playerSnap.val();
    const role = roleSnap.val();

    if (!playerData?.joinedAt || !game?.startedAt) {
      alert("Ошибка: отсутствует joinedAt или startedAt");
      return;
    }

    if (playerData.joinedAt > game.startedAt) {
      // Заход после старта — HUD сразу
      hudScreen.style.display = "block";
      roleButton.style.display = "block";
      setupPlayerUI(playerRef);
      return;
    }

    // Заход ДО старта — нормальный запуск
    countdownNumber.innerText = "Скоро узнаешь свою роль...";
    countdownScreen.classList.add("active");

    setTimeout(() => {
      let count = 3;
      const interval = setInterval(() => {
        countdownNumber.innerText = count;
        count--;
        if (count < 0) {
          clearInterval(interval);
          countdownScreen.classList.remove("active");

          roleText.innerText = role === "imposter" ? "🟥 Ты ИМПОСТЕР!" : "🟦 Ты мирный.";
          roleScreen.classList.add("active");

          setTimeout(() => {
            roleScreen.classList.remove("active");
            hudScreen.style.display = "block";
            roleButton.style.display = "block";
            setupPlayerUI(playerRef, playerNumber);
          }, 2000);
        }
      }, 1000);
    }, 3000);
  });
}




function setupPlayerUI(playerRef, number) {
  const playerNumEl = document.getElementById("playerNumber");
  const statusEl = document.getElementById("playerStatus");
  const voteBtn = document.getElementById("voteBtn");
  const cooldownTimer = document.getElementById("cooldownTimer");

  const taskSection = document.querySelector(".tasks-section");
  const meetingSection = document.getElementById("meetingSection");
  const meetingTarget = document.getElementById("meetingTarget");
  const voteKickBtn = document.getElementById("voteKickBtn");
  const voteSkipBtn = document.getElementById("voteSkipBtn");
  const roleButton = document.getElementById("roleButton");
  const roleDisplay = document.getElementById("roleDisplay");
  roleButton.addEventListener("click", () => {
    db.ref("players/" + number + "/role").once("value", (snap) => {
      const role = snap.val();
      if (role) {
        roleDisplay.innerText = role === "imposter" ? "🟥 Ты ИМПОСТЕР!" : "🟦 Ты мирный.";
        roleDisplay.style.display = "block";
        setTimeout(() => roleDisplay.style.display = "none", 2000);
      }
    });
  });

  playerRef.on("value", (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    playerNumEl.textContent = number;

    if (data.role === "imposter") taskSection.style.display = "none";

    if (data.status === "dead") {
      statusEl.innerText = "Мёртв";
      statusEl.classList.add("dead");
      voteBtn.style.display = "none";
      cooldownTimer.innerText = "";
    } else {
      statusEl.innerText = "Жив";
      statusEl.classList.remove("dead");
      updateCooldownFromServer(number);
    }
  });

voteBtn.addEventListener("click", () => {
  if (!canVote) return;

  const target = prompt("Против кого голосуешь (1–60)?");
  if (!target || isNaN(target) || target < 1 || target > 60 || target === number) {
    return alert("Некорректный выбор");
  }

  const now = Date.now();
  const cooldownEnd = now + 5 * 60 * 1000;

  db.ref().update({
    [`Voting/${number}`]: Number(target),
    [`players/${number}/voteCooldown`]: cooldownEnd
  });
});



  voteKickBtn.addEventListener("click", () => {
    db.ref(`meetings/votes/${number}`).set("kick");
    meetingSection.style.display = "none";
  });

  voteSkipBtn.addEventListener("click", () => {
    db.ref(`meetings/votes/${number}`).set("skip");
    meetingSection.style.display = "none";
  });

  db.ref("meetings").on("value", (snap) => {
    const meeting = snap.val();
    if (meeting && meeting.active) {
      if (meeting.votes && meeting.votes[number]) {
        meetingSection.style.display = "none";
      } else {
        meetingSection.style.display = "block";
        meetingTarget.innerText = `Цель: Игрок №${meeting.target}`;
      }
    } else {
      meetingSection.style.display = "none";
    }
  });
}

function updateCooldownFromServer(number) {
  const voteBtn = document.getElementById("voteBtn");

  let interval;

  db.ref(`players/${number}/voteCooldown`).on("value", (snap) => {
    const cooldownTimestamp = snap.val();
    if (interval) clearInterval(interval);

if (!cooldownTimestamp || Date.now() > cooldownTimestamp) {
  voteBtn.innerText = "Голосовать";
  voteBtn.disabled = false;
  canVote = true;
  return;
}

    canVote = false; // 🚫 блокируем голосование во время кулдауна

    interval = setInterval(() => {
      const left = cooldownTimestamp - Date.now();
      if (left <= 0) {
        voteBtn.innerText = "Голосовать";
        canVote = true; // ✅ разблокируем после кулдауна
        clearInterval(interval);
      } else {
        const totalSeconds = Math.ceil(left / 1000);
        const min = Math.floor(totalSeconds / 60);
        const sec = totalSeconds % 60;
        voteBtn.innerText = ` ${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        voteBtn.disabled = true;
      }
    }, 1000);
  });
}




// ==================== Логика собраний ====================
db.ref("meetings").on("value", (snap) => {
  const meeting = snap.val();
  if (meeting && meeting.active && !meeting.timerSet) {
    db.ref("meetings/timerSet").set(true);
    setTimeout(() => {
      db.ref("meetings").once("value").then((s) => {
        const m = s.val();
        const votes = m.votes || {};
        let kick = 0, skip = 0;
        Object.values(votes).forEach(v => {
          if (v === "kick") kick++;
          if (v === "skip") skip++;
        });
        if (kick > skip) db.ref("players/" + m.target + "/status").set("dead");
        db.ref("meetings").set(null);
      });
    }, 15000);
  }
});

db.ref("votes").on("value", (snap) => {
  const votes = snap.val() || {};

  Object.entries(votes).forEach(([target, voters]) => {
    const count = Object.keys(voters).length;
    if (count >= 10) {
      db.ref("meeting").set({
        active: true,
        target: Number(target),
        votes: {},
        timerSet: false
      });

      // Очистим голосование
      db.ref("votes").remove();
    }
  });
});

// ==================== Админка ====================
document.addEventListener("DOMContentLoaded", () => {
  const playersList = document.getElementById("playersList");
  const startBtn = document.getElementById("startGameBtn");
  const stopBtn = document.getElementById("stopGameBtn");
  const clearBtn = document.getElementById("clearPlayersBtn");
  const assignRolesBtn = document.getElementById("assignRolesBtn");
  const gameStateLabel = document.getElementById("gameStateLabel");

  // Установить начальное состояние игры, если не задано
  db.ref("game/state").once("value", (snap) => {
    if (!snap.exists()) {
      db.ref("game").set({ state: "waiting" });
    }
  });

  // Слушатель изменения состояния игры
  db.ref("game/state").on("value", (snap) => {
    const state = snap.val();
    if (gameStateLabel) {
      gameStateLabel.textContent = state === "started"
        ? "Игра запущена"
        : "Игра остановлена";
    }
  });

  // Обновление списка игроков
db.ref("players").on("value", (snapshot) => {
  const players = snapshot.val() || {};
  const container = document.getElementById("playersList");
  container.innerHTML = "";

 Object.entries(players).forEach(([number, player]) => {
  const div = document.createElement("div");

 const votedFor = player.votedFor !== undefined ? player.votedFor : "—";
const isAlive = player.status === "alive";
const cooldownId = `cooldown-${number}`;

div.innerHTML = `
  <strong>Игрок №${number}</strong> — ${isAlive ? "🟢 Жив" : "⚰️ Мёртв"}<br>
  Голосует за: №${votedFor}<br>
  Кулдаун: <span id="${cooldownId}">—</span><br>
`;


  const killBtn = document.createElement("button");
  killBtn.textContent = "Убить";
  killBtn.onclick = () => db.ref(`players/${number}/status`).set("dead");

  const reviveBtn = document.createElement("button");
  reviveBtn.textContent = "Оживить";
  reviveBtn.onclick = () => db.ref(`players/${number}/status`).set("alive");

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "Удалить";
  deleteBtn.onclick = () => db.ref(`players/${number}`).remove();

  div.appendChild(killBtn);
  div.appendChild(reviveBtn);
  div.appendChild(deleteBtn);

  div.style.marginBottom = "15px";
  container.appendChild(div);

    if (player.voteCooldown) {
    liveAdminCooldown(number, player.voteCooldown);
    }
  });
});

function getCooldownText(timestamp) {
  const now = Date.now();
  const remaining = Math.max(0, timestamp - now);
  if (remaining <= 0) return "✅ Готов";
  const sec = Math.floor(remaining / 1000);
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `⏳ ${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function liveAdminCooldown(number, timestamp) {
  const span = document.getElementById(`cooldown-${number}`);
  if (!span) return;

  const interval = setInterval(() => {
    const left = timestamp - Date.now();
    if (left <= 0) {
      span.innerText = "✅ Готов";
      clearInterval(interval);
    } else {
      const sec = Math.floor(left / 1000);
      const min = Math.floor(sec / 60);
      const s = sec % 60;
      span.innerText = `⏳ ${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  }, 1000);
}


// === Проверка количества голосов и отображение кнопки ===
const votingPanel = document.createElement("div");
votingPanel.id = "startMeetingBlock";
document.body.appendChild(votingPanel);

db.ref("votes").on("value", (snap) => {
  const votes = snap.val() || {};
  let triggered = false;

  Object.entries(votes).forEach(([target, voters]) => {
    const count = Object.keys(voters).length;
    if (count >= 10 && !triggered) {
      showStartMeetingButton(target);
      triggered = true;
    }
  });

  if (!triggered) hideStartMeetingButton();
});

function showStartMeetingButton(target) {
  const block = document.getElementById("startMeetingBlock");
  block.innerHTML = `
    <button id="startMeetingBtn">🗳 Начать голосование против игрока №${target}</button>
  `;

  document.getElementById("startMeetingBtn").onclick = () => {
    db.ref("meeting").set({
      active: true,
      target: Number(target),
      votes: {}
    });
    db.ref("votes").remove(); // очистим голосование
    hideStartMeetingButton();
  };
}

function hideStartMeetingButton() {
  const block = document.getElementById("startMeetingBlock");
  block.innerHTML = "";
}

  // Обработчики кнопок
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      db.ref("players").once("value", (snap) => {
        const ids = Object.keys(snap.val() || {});
        const shuffled = ids.sort(() => 0.5 - Math.random()).slice(0, 10);
        const updates = {};
        ids.forEach(id => {
          updates[`players/${id}/role`] = shuffled.includes(id) ? "imposter" : "crew";
        });
        updates["game/state"] = "started";
        updates["game/startedAt"] = Date.now();
        db.ref().update(updates);
      });
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      if (confirm("Вы уверены, что хотите остановить игру?")) {
        db.ref("game").set({
          state: "waiting",
          startedAt: null
        });
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (confirm("Удалить всех игроков и очистить игру?")) {
        db.ref().update({
          players: null,
          meetings: null,
          game: {
            state: "waiting",
            startedAt: null
          }
        });
      }
    });
  }

  if (assignRolesBtn) {
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
        alert("Роли успешно назначены! Теперь можно запускать игру.");
      });
    });
  }

  // Глобальные функции
  window.killPlayer = (id) => db.ref("players/" + id).update({ status: "dead" });
  window.revivePlayer = (id) => db.ref("players/" + id).update({ status: "alive" });
  window.deletePlayer = (id) => {
    if (confirm("Удалить игрока?")) {
      db.ref("players/" + id).remove();
      db.ref("meetings/votes/" + id).remove();
    }
  };
});
