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

let playerNumber = null;
let canVote = true;
window.voteCooldownTimer = null;

// ==================== Утилиты ====================
function formatTime(ms) {
  const sec = Math.ceil(ms / 1000);
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function resetAllScreens() {
  document.querySelectorAll(".screen, #hudScreen").forEach(el => {
    el.style.display = "none";
    el.classList.remove("active");
  });
}

function handlePlayerDeletion() {
  localStorage.removeItem("playerNumber");
  localStorage.removeItem("voted");
  resetAllScreens();
  const reg = document.getElementById("registerScreen");
  reg.style.display = "flex";
  reg.classList.add("active");
  alert("Вы были удалены админом.");
}

function handleGameResetToWaiting() {
  resetAllScreens();
  document.getElementById("waitingScreen").style.display = "flex";
  localStorage.removeItem("voted");
}

// ==================== Старт ====================
document.addEventListener("DOMContentLoaded", () => {
  const registerBtn = document.getElementById("registerBtn");
  registerBtn.onclick = () => {
    const input = document.getElementById("playerInput");
    const num = input.value.trim();
    if (!/^[1-9][0-9]?$|^60$/.test(num)) return alert("Введите номер от 1 до 60");
    initHUD(num);
  };

  const saved = localStorage.getItem("playerNumber");
  if (saved) {
    db.ref("players/" + saved).once("value", snap => {
      if (snap.exists()) initHUD(saved);
      else localStorage.removeItem("playerNumber");
    });
  }
});

// ==================== Основная инициализация HUD ====================
function initHUD(number) {
  playerNumber = number;
  const playerRef = db.ref("players/" + number);
  localStorage.setItem("playerNumber", number);

  resetAllScreens();
  document.getElementById("waitingScreen").style.display = "flex";

  db.ref("players/" + number).once("value").then(snap => {
    if (!snap.exists()) return playerRef.set({ status: "alive", role: "crew", joinedAt: Date.now() });
    if (!snap.val().joinedAt) return playerRef.update({ joinedAt: Date.now() });
  }).then(() => {
    db.ref("players/" + number).on("value", snap => {
      if (!snap.exists()) handlePlayerDeletion();
    });

    db.ref("game/state").on("value", snap => {
      if (snap.val() === "waiting") handleGameResetToWaiting();
    });

    db.ref("game").on("value", snap => {
      const game = snap.val();
      if (game?.state === "started") {
        db.ref("game").off();
        db.ref("players/" + number).once("value").then(snap => {
          const player = snap.val();
          if (player.joinedAt > game.startedAt) {
            showHUD(playerRef);
          } else {
            startGameSequence(game, playerRef);
          }
        });
      }
    });
  });
}

function startGameSequence(game, playerRef) {
  const countdownScreen = document.getElementById("countdownScreen");
  const countdownNumber = document.getElementById("countdownNumber");
  const roleScreen = document.getElementById("roleScreen");
  const roleText = document.getElementById("roleText");

  document.getElementById("waitingScreen").style.display = "none";
  countdownScreen.classList.add("active");
  countdownScreen.style.display = "flex";
  countdownNumber.innerText = "Скоро узнаешь свою роль...";

  setTimeout(() => {
    let count = 3;
    const interval = setInterval(() => {
      countdownNumber.innerText = count;
      count--;
      if (count < 0) {
        clearInterval(interval);
        countdownScreen.classList.remove("active");
        countdownScreen.style.display = "none";

        db.ref("players/" + playerNumber + "/role").once("value", snap => {
          const role = snap.val();
          roleText.innerText = role === "imposter" ? "🟥 Ты ИМПОСТЕР!" : "🟦 Ты мирный.";
          roleScreen.classList.add("active");

          setTimeout(() => {
            roleScreen.classList.remove("active");
            showHUD(playerRef);
          }, 2000);
        });
      }
    }, 1000);
  }, 3000);
}

function showHUD(playerRef) {
  document.getElementById("hudScreen").style.display = "block";
  document.getElementById("roleButton").style.display = "block";
  document.getElementById("playerNumber").innerText = playerNumber;
  document.getElementById("playerAvatar").src = `avatars/${['red','blue','orange','black','white','pink'][(playerNumber - 1) % 6]}.webp`;

  setupPlayerUI(playerRef);
  checkVotingWindow();
}

// ==================== UI ====================
function setupPlayerUI(playerRef) {
  const voteBtn = document.getElementById("voteBtn");
  const statusEl = document.getElementById("playerStatus");
  const taskSection = document.querySelector(".tasks-section");
  const meetingSection = document.getElementById("meetingSection");
  const meetingTarget = document.getElementById("meetingTarget");

  playerRef.on("value", snap => {
    const player = snap.val();
    if (!player) return;
    statusEl.innerText = player.status === "dead" ? "Мёртв" : "Жив";
    statusEl.classList.toggle("dead", player.status === "dead");
    voteBtn.style.display = player.status === "dead" ? "none" : "block";
    taskSection.style.display = player.role === "imposter" ? "none" : "block";
  });

  document.getElementById("roleButton").onclick = () => {
    db.ref("players/" + playerNumber + "/role").once("value", snap => {
      const role = snap.val();
      const roleDisplay = document.getElementById("roleDisplay");
      roleDisplay.innerText = role === "imposter" ? "🟥 Ты ИМПОСТЕР!" : "🟦 Ты мирный.";
      roleDisplay.style.display = "block";
      setTimeout(() => roleDisplay.style.display = "none", 2000);
    });
  };

  voteBtn.onclick = () => {
    if (!canVote) return;
    const target = prompt("На кого ты подозреваешь (1–60)?");
    if (!target || isNaN(target) || target < 1 || target > 60 || Number(target) === Number(playerNumber)) {
      return alert("Некорректный выбор");
    }

    db.ref("game/voting/openAt").once("value", snap => {
      const openAt = snap.val();
      if (!openAt) return;

      db.ref(`suspicion/${target}/${playerNumber}`).set(true);
      localStorage.setItem("voted", openAt.toString());

      canVote = false;
      voteBtn.disabled = true;
      voteBtn.innerText = "Голос засчитан";
    });
  };

  // === Один обработчик meetings на всё ===
// === Глобальная переменная для таймера собрания
window.meetingTimerInterval = null;

// === Один обработчик meetings на всё ===
db.ref("meetings").on("value", snap => {
  const m = snap.val();
  const hudScreen = document.getElementById("hudScreen");
  const meetingSection = document.getElementById("meetingSection");
  const meetingTarget = document.getElementById("meetingTarget");
  const meetingTimer = document.getElementById("meetingTimer");
  const kickCount = document.getElementById("meetingKickCount");
  const skipCount = document.getElementById("meetingSkipCount");
  const voteKickBtn = document.getElementById("voteKickBtn");
  const voteSkipBtn = document.getElementById("voteSkipBtn");

  if (!hudScreen || !meetingSection || !meetingTarget) return;

  // --- СОБРАНИЕ АКТИВНО ---
  if (m && m.active) {
    hudScreen.style.display = "none";
    meetingSection.style.display = "block";
    meetingTarget.innerText = `Цель: Игрок №${m.target}`;
    voteBtn.disabled = true;

    // === ПРАВИЛЬНЫЙ ТАЙМЕР СОБРАНИЯ ===
    if (meetingTimer && m.startedAt) {
      // Сбросить предыдущий интервал!
      if (window.meetingTimerInterval) clearInterval(window.meetingTimerInterval);

      function updateMeetingTimerDisplay() {
        const now = Date.now();
        const secondsLeft = Math.max(0, 20 - Math.floor((now - m.startedAt) / 1000));
        meetingTimer.innerText = secondsLeft;
        if (secondsLeft <= 0 && window.meetingTimerInterval) {
          clearInterval(window.meetingTimerInterval);
        }
      }
      updateMeetingTimerDisplay();
      window.meetingTimerInterval = setInterval(updateMeetingTimerDisplay, 200);
    }

    // === Количество голосов ===
    const votes = m.votes || {};
    let kick = 0, skip = 0;
    Object.values(votes).forEach(v => {
      if (v === "kick") kick++;
      else if (v === "skip") skip++;
    });
    if (kickCount) kickCount.innerText = `Кик: ${kick}`;
    if (skipCount) skipCount.innerText = `Оставить: ${skip}`;

    // === Кнопки голосования ===
    if (votes[playerNumber]) {
      voteKickBtn.style.display = "none";
      voteSkipBtn.style.display = "none";
    } else {
      voteKickBtn.style.display = "inline-block";
      voteSkipBtn.style.display = "inline-block";
    }

  // --- СОБРАНИЕ НЕАКТИВНО ---
  } else {
    meetingSection.style.display = "none";
    // Остановить таймер собрания, если был!
    if (window.meetingTimerInterval) clearInterval(window.meetingTimerInterval);
    localStorage.removeItem("voted");
    db.ref("players/" + playerNumber).once("value").then(snap => {
      if (snap.val()?.status === "alive") {
        hudScreen.style.display = "block";
        checkVotingWindow();
      } else {
        hudScreen.style.display = "none";
        // document.getElementById("deadScreen").style.display = "block";
      }
    });
  }
});

// Голосование в собрании
document.getElementById("voteKickBtn").onclick = () => {
  db.ref(`meetings/votes/${playerNumber}`).set("kick");
  document.getElementById("voteKickBtn").style.display = "none";
  document.getElementById("voteSkipBtn").style.display = "none";
};
document.getElementById("voteSkipBtn").onclick = () => {
  db.ref(`meetings/votes/${playerNumber}`).set("skip");
  document.getElementById("voteKickBtn").style.display = "none";
  document.getElementById("voteSkipBtn").style.display = "none";
};

}

// ==================== Кнопка голосования и кулдауны ====================
function checkVotingWindow() {
  const voteBtn = document.getElementById("voteBtn");
  if (window.voteCooldownTimer) clearInterval(window.voteCooldownTimer);

  db.ref("game/globalCooldownUntil").once("value", snap => {
    const cooldownUntil = snap.val();
    const now = Date.now();

    if (cooldownUntil && now < cooldownUntil) {
      voteBtn.disabled = true;
      voteBtn.innerText = `Ожидайте (${formatTime(cooldownUntil - now)})`;
      window.voteCooldownTimer = setInterval(() => {
        const left = cooldownUntil - Date.now();
        if (left > 0) {
          voteBtn.innerText = `Ожидайте (${formatTime(left)})`;
        } else {
          clearInterval(window.voteCooldownTimer);
          checkVotingWindow();
        }
      }, 1000);
      return;
    }

    // Если глобальный кулдаун неактивен — проверяем персональный голосовой раунд
    db.ref("game/voting").once("value", snap => {
      const voting = snap.val();
      if (!voting) {
        voteBtn.disabled = true;
        voteBtn.innerText = "Голосование не активно";
        return;
      }

      const openAt = voting.openAt;
      const closeAt = voting.closeAt;
      const now = Date.now();
      const votedRound = localStorage.getItem("voted");

      if (now < openAt) {
        voteBtn.disabled = true;
        const updateCountdown = () => {
          const t = openAt - Date.now();
          if (t <= 0) {
            clearInterval(window.voteCooldownTimer);
            checkVotingWindow();
          } else voteBtn.innerText = `Ожидайте (${formatTime(t)})`;
        };
        updateCountdown();
        window.voteCooldownTimer = setInterval(updateCountdown, 1000);
        return;
      }

      if (now >= openAt && now <= closeAt) {
        if (votedRound === openAt.toString()) {
          voteBtn.disabled = true;
          voteBtn.innerText = "Голос засчитан";
        } else {
          voteBtn.disabled = false;
          voteBtn.innerText = "Голосовать";
          canVote = true;
        }
        return;
      }

      // После голосования до следующего открытия
      voteBtn.disabled = true;
      const nextOpen = openAt + 7 * 60 * 1000;
      const t = nextOpen - now;
      voteBtn.innerText = `Ожидайте (${formatTime(t)})`;
      window.voteCooldownTimer = setInterval(() => {
        const left = nextOpen - Date.now();
        if (left <= 0) {
          clearInterval(window.voteCooldownTimer);
          checkVotingWindow();
        } else {
          voteBtn.innerText = `Ожидайте (${formatTime(left)})`;
        }
      }, 1000);
    });
  });
}
