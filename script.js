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

// ==================== Глобальный мониторинг удаления игрока ====================
document.addEventListener("DOMContentLoaded", () => {
  const globalPlayerNumber = localStorage.getItem("playerNumber");
  if (globalPlayerNumber) {
    const playerRef = db.ref("players/" + globalPlayerNumber);
    playerRef.on("value", (snapshot) => {
      if (!snapshot.exists()) {
        localStorage.removeItem("playerNumber");

        // Удаляем все активные экраны
        document.querySelectorAll(".screen, #hudScreen, #waitingScreen, #roleScreen, #countdownScreen").forEach(el => {
          el.style.display = "none";
          el.classList.remove("active");
        });

        // Показываем экран регистрации
        const registerScreen = document.getElementById("registerScreen");
        if (registerScreen) {
          registerScreen.classList.add("active");
          registerScreen.style.display = "flex";

          const input = document.getElementById("playerInput");
          if (input) input.focus();
        }

        // Показываем сообщение об удалении
        setTimeout(() => {
          alert("Вы были удалены админом.");
        }, 100);
      }
    });
  }
});

// ==================== Система голосования на собрании ====================
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

// ==================== Отслеживание голосов против и запуск собрания ====================
db.ref("players").on("child_changed", (snap) => {
  const playerId = snap.key;
  const data = snap.val();
  if (data.votesAgainst && data.votesAgainst.length >= 10) {
    db.ref("meetings").set({
      active: true,
      target: playerId,
      votes: {},
      timerSet: false
    });

    // Сброс голосов против у всех игроков
    db.ref("players").once("value").then((playersSnap) => {
      const updates = {};
      Object.keys(playersSnap.val() || {}).forEach(id => {
        updates[`players/${id}/votesAgainst`] = [];
      });
      db.ref().update(updates);
    });
  }
});


// ==================== Игрок ====================
if (document.getElementById("registerScreen")) {
  const registerScreen = document.getElementById("registerScreen");
  const waitingScreen = document.getElementById("waitingScreen");
  const hudScreen = document.getElementById("hudScreen");
  const roleButton = document.getElementById("roleButton");
  const roleDisplay = document.getElementById("roleDisplay");
  const taskSection = document.querySelector(".tasks-section");

  const playerInput = document.getElementById("playerInput");
  const registerBtn = document.getElementById("registerBtn");

  const playerNumEl = document.getElementById("playerNumber");
  const statusEl = document.getElementById("playerStatus");
  const voteBtn = document.getElementById("voteBtn");
  const cooldownTimer = document.getElementById("cooldownTimer");

  const meetingSection = document.getElementById("meetingSection");
  const meetingTarget = document.getElementById("meetingTarget");
  const voteKickBtn = document.getElementById("voteKickBtn");
  const voteSkipBtn = document.getElementById("voteSkipBtn");

  const countdownScreen = document.getElementById("countdownScreen");
  const countdownNumber = document.getElementById("countdownNumber");
  const roleScreen = document.getElementById("roleScreen");
  const roleText = document.getElementById("roleText");

  let playerNumber = localStorage.getItem("playerNumber");

  registerBtn.addEventListener("click", () => {
    const number = playerInput.value.trim();
    if (!/^\d+$/.test(number) || Number(number) < 1 || Number(number) > 60) {
      alert("Введите корректный номер от 1 до 60");
      return;
    }
    localStorage.setItem("playerNumber", number);
    initHUD(number);
  });

  if (playerNumber) {
  db.ref("players/" + playerNumber).once("value").then((snap) => {
    if (snap.exists()) {
      initHUD(playerNumber);
    } else {
      localStorage.removeItem("playerNumber");
    }
  });
}

function initHUD(number) {
  playerNumber = number;
  registerScreen.style.display = "none";
  waitingScreen.style.display = "block";
  const joinedAt = Date.now();

  const playerRef = db.ref("players/" + number);

  const avatarColors = ['red', 'blue', 'orange', 'black', 'white', 'pink'];
  const avatarColor = avatarColors[(number - 1) % avatarColors.length];
  const avatarPath = `avatars/${avatarColor}.webp`;
  document.getElementById("playerAvatar").src = avatarPath;

  db.ref("players/" + number).once("value").then((snap) => {
    if (!snap.exists()) {
      return playerRef.set({
        status: "alive",
        votedAt: 0,
        votesAgainst: [],
        role: "crew"
      });
    }
  });

  let gameStarted = false;

  db.ref("game").on("value", (snap) => {
    const game = snap.val();
    if (game.state === "started" && !gameStarted && game.startedAt && game.startedAt >= joinedAt) {
      gameStarted = true;
      waitingScreen.style.display = "none";

      const countdownScreen = document.getElementById("countdownScreen");
      const countdownNumber = document.getElementById("countdownNumber");
      const roleScreen = document.getElementById("roleScreen");
      const roleText = document.getElementById("roleText");

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

            db.ref("players/" + playerNumber + "/role").once("value").then((snap) => {
              const role = snap.val();
              roleText.innerText = role === "imposter" ? "🟥 Ты ИМПОСТЕР!" : "🟦 Ты мирный.";
              roleScreen.classList.add("active");

              setTimeout(() => {
                roleScreen.classList.remove("active");
                hudScreen.style.display = "block";
                roleButton.style.display = "block";
                setupPlayerUI(playerRef);
              }, 2000);
            });
          }
        }, 1000);
      }, 3000);
    }
  });
}


  function revealRoleTemporarily() {
    const playerNumber = localStorage.getItem("playerNumber");
    db.ref("players/" + playerNumber + "/role").once("value", (snap) => {
      const role = snap.val();
      if (role) {
        roleDisplay.innerText = role === "imposter" ? "🟥 Ты ИМПОСТЕР!" : "🟦 Ты мирный.";
        roleDisplay.style.display = "block";
        setTimeout(() => {
          roleDisplay.style.display = "none";
        }, 2000);
      }
    });
  }

  function setupPlayerUI(playerRef) {
    const number = localStorage.getItem("playerNumber");

    roleButton.addEventListener("click", () => {
      revealRoleTemporarily();
    });

    playerRef.on("value", (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        alert("Вы были удалены админом.");
        localStorage.removeItem("playerNumber");
        location.reload();
        return;
      }

      playerNumEl.textContent = number;

      if (data.role === "imposter" && taskSection) {
        taskSection.style.display = "none";
      }

      if (data.status === "dead") {
        statusEl.innerText = "Мёртв";
        statusEl.classList.add("dead");
        voteBtn.style.display = "none";
        cooldownTimer.innerText = "";
      } else {
        statusEl.innerText = "Жив";
        statusEl.classList.remove("dead");
        updateCooldown(data.votedAt || 0);
      }
    });

    voteBtn.addEventListener("click", () => {
      const target = prompt("Против кого голосуешь (1–60)?");
      if (!target || target < 1 || target > 60) return alert("Некорректно");

      db.ref("players/" + target + "/votesAgainst").transaction((votes) => {
        if (!votes) votes = [];
        if (!votes.includes(playerNumber)) votes.push(playerNumber);
        return votes;
      });

      const now = Date.now();
      playerRef.update({ votedAt: now });
      updateCooldown(now);
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

  function updateCooldown(votedAt) {
    const duration = 5 * 60 * 1000;
    const left = duration - (Date.now() - votedAt);
    if (left > 0) {
      voteBtn.style.display = "none";
      cooldownTimer.innerText = `Жди: ${Math.ceil(left / 1000)} сек`;
      const interval = setInterval(() => {
        const now = Date.now();
        const remaining = duration - (now - votedAt);
        if (remaining <= 0) {
          voteBtn.style.display = "inline-block";
          cooldownTimer.innerText = "";
          clearInterval(interval);
        } else {
          cooldownTimer.innerText = `Жди: ${Math.ceil(remaining / 1000)} сек`;
        }
      }, 1000);
    } else {
      voteBtn.style.display = "inline-block";
      cooldownTimer.innerText = "";
    }
  }
}

// ==================== Админ ====================
document.addEventListener("DOMContentLoaded", () => {
  const playersList = document.getElementById("playersList");
  const startBtn = document.getElementById("startGameBtn");
  if (!playersList) return;

  db.ref("game/state").once("value", (snap) => {
    if (!snap.exists()) db.ref("game").set({ state: "waiting" });
  });

  db.ref("players").on("value", (snapshot) => {
    const players = snapshot.val();
    if (!players) {
      playersList.innerHTML = "<p>Нет игроков</p>";
      return;
    }

    let html = "<table><tr><th>Игрок</th><th>Статус</th><th>Роль</th><th>Действия</th></tr>";
    for (let id in players) {
      const p = players[id];
      html += `<tr>
        <td>${id}</td>
        <td>${p.status}</td>
        <td>${p.role || "?"}</td>
        <td>
          <button onclick=\"killPlayer('${id}')\">Убить</button>
          <button onclick=\"revivePlayer('${id}')\">Оживить</button>
          <button onclick=\"deletePlayer('${id}')\" style=\"background:red;\">Удалить</button>
        </td>
      </tr>`;
    }
    html += "</table>";
    playersList.innerHTML = html;
  });

  window.killPlayer = (id) => db.ref("players/" + id).update({ status: "dead" });
  window.revivePlayer = (id) => db.ref("players/" + id).update({ status: "alive" });
  window.deletePlayer = (id) => {
    if (confirm("Удалить игрока?")) {
      db.ref("players/" + id).remove();
      db.ref("meetings/votes/" + id).remove();
      db.ref("game/state").once("value").then((snap) => {
        if (snap.val() === "started") {
          db.ref("game/state").set("waiting");
        }
      });
    }
  };

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
});

// ==================== Глобальный мониторинг удаления игрока ====================
document.addEventListener("DOMContentLoaded", () => {
  const globalPlayerNumber = localStorage.getItem("playerNumber");
  if (globalPlayerNumber) {
    const playerRef = db.ref("players/" + globalPlayerNumber);
    playerRef.on("value", (snapshot) => {
      if (!snapshot.exists()) {
        localStorage.removeItem("playerNumber");
        const allScreens = document.querySelectorAll(".screen, #hudScreen, #waitingScreen");
        allScreens.forEach(el => el.style.display = "none");
        allScreens.forEach(el => el.classList.remove("active"));

        const registerScreen = document.getElementById("registerScreen");
      if (registerScreen) registerScreen.classList.add("active");

      }
    });
  }
});