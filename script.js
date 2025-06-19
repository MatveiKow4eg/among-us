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

// ==================== HUD и логика игрока ====================
function initHUD(number) {
  const registerScreen = document.getElementById("registerScreen");
  const waitingScreen = document.getElementById("waitingScreen");
  const hudScreen = document.getElementById("hudScreen");
  const roleButton = document.getElementById("roleButton");
  const roleDisplay = document.getElementById("roleDisplay");
  const taskSection = document.querySelector(".tasks-section");

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

  let playerNumber = number;
  localStorage.setItem("playerNumber", number);

  const playerRef = db.ref("players/" + number);

  registerScreen.style.display = "none";
  waitingScreen.style.display = "block";

  const avatarColors = ['red', 'blue', 'orange', 'black', 'white', 'pink'];
  const avatarColor = avatarColors[(number - 1) % avatarColors.length];
  document.getElementById("playerAvatar").src = `avatars/${avatarColor}.webp`;

  db.ref("players/" + number).once("value").then((snap) => {
    let createPromise = Promise.resolve();
    if (!snap.exists()) {
      createPromise = playerRef.set({
        status: "alive",
        votedAt: 0,
        votesAgainst: [],
        role: "crew"
      });
    }
    return createPromise;
  }).then(() => {
    playerRef.on("value", (snapshot) => {
      if (!snapshot.exists()) {
        handlePlayerDeletion();
      }
    });
  });

  let gameStarted = false;

  db.ref("game").on("value", (snap) => {
    const game = snap.val();
    if (game.state === "started" && !gameStarted) {
      gameStarted = true;
      waitingScreen.style.display = "none";

      db.ref("players/" + playerNumber + "/role").once("value").then((snap) => {
        const role = snap.val();

        // Если прошло больше 5 секунд с начала игры — сразу HUD без отсчёта
        if (Date.now() - game.startedAt > 5000) {
          hudScreen.style.display = "block";
          roleButton.style.display = "block";
          setupPlayerUI(playerRef);
          return;
        }

        // Иначе — показать отсчёт и роль
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
                setupPlayerUI(playerRef);
              }, 2000);
            }
          }, 1000);
        }, 3000);
      });
    }
  });
}


function setupPlayerUI(playerRef) {
  const number = localStorage.getItem("playerNumber");
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
      updateCooldown(data.votedAt || 0);
    }
  });

  voteBtn.addEventListener("click", () => {
    const target = prompt("Против кого голосуешь (1–60)?");
    if (!target || target < 1 || target > 60) return alert("Некорректно");

    db.ref("players/" + target + "/votesAgainst").transaction((votes) => {
      if (!votes) votes = [];
      if (!votes.includes(number)) votes.push(number);
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
  const voteBtn = document.getElementById("voteBtn");
  const cooldownTimer = document.getElementById("cooldownTimer");
  const duration = 5 * 60 * 1000;
  const left = duration - (Date.now() - votedAt);

  if (left > 0) {
    voteBtn.style.display = "none";
    cooldownTimer.innerText = `Жди: ${Math.ceil(left / 1000)} сек`;
    const interval = setInterval(() => {
      const remaining = duration - (Date.now() - votedAt);
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

    db.ref("players").once("value").then((playersSnap) => {
      const updates = {};
      Object.keys(playersSnap.val() || {}).forEach(id => {
        updates[`players/${id}/votesAgainst`] = [];
      });
      db.ref().update(updates);
    });
  }
});

// ==================== Админка ====================
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
          <button onclick="killPlayer('${id}')">Убить</button>
          <button onclick="revivePlayer('${id}')">Оживить</button>
          <button onclick="deletePlayer('${id}')" style="background:red;">Удалить</button>
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
