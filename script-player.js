const db = window.db;
console.log("🔥 Скрипт игрока запущен!");

let gameStartedHandled = false;
let playerNumber = null;
let canVote = true;
window.voteCooldownTimer = null;
let meetingSound = null;
let deathSound = null;
const sessionStartedAt = Date.now();
document.addEventListener("click", () => {
  if (!meetingSound) {
    meetingSound = new Audio("/sounds/meeting_alert.mp3");
    meetingSound.load();
  }
  if (!deathSound) {
    deathSound = new Audio("/sounds/death_alert.mp3");
    deathSound.load();
  }
});

// ==================== Утилиты ====================
function formatTime(ms) {
  const sec = Math.ceil(ms / 1000);
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}


function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(screenId);
  if (el) el.classList.add('active');
}

function resetAllScreens() {
  document.querySelectorAll(".screen, #hudScreen").forEach(el => {
    // НЕ трогай imosterImage, если сейчас идёт reveal!
    if (el.id === "imposterImage" && window._roleRevealRunning) return;
    if (el) {
      el.style.display = "none";
      el.classList.remove("active", "visible");
    }
  });

  // Не скрывай имостера, если сейчас анимация reveal!
  const imposterImage = document.getElementById("imposterImage");
  if (imposterImage && !window._roleRevealRunning) {
    imposterImage.classList.remove("visible");
    imposterImage.style.opacity = "0";
    imposterImage.style.pointerEvents = "none";
  }
}



function handlePlayerDeletion() {
  localStorage.removeItem("playerNumber");
  localStorage.removeItem("voted");
  resetAllScreens();
  const reg = document.getElementById("registerScreen");
  if (reg) {
    reg.style.display = "flex";
    reg.classList.add("active");
  }
  alert("Вы были удалены админом.");
}

// ======= Мониторинг онлайн-игроков =======
let onlinePlayersListener = null;
function monitorOnlinePlayers() {
  const onlineNumber = document.getElementById("onlineNumber");
  if (!onlineNumber) return;
  // Снимаем старую подписку, если была
  if (onlinePlayersListener) db.ref("players").off("value", onlinePlayersListener);
  onlinePlayersListener = snap => {
    const players = snap.val() || {};
    const count = Object.values(players).filter(p => p.status === "alive").length;
    onlineNumber.textContent = count;
  };
  db.ref("players").on("value", onlinePlayersListener);
}

let hudPlayersListener = null;
function monitorHudOnlinePlayers() {
  const hudOnlineNumber = document.getElementById("hudOnlineNumber");
  if (!hudOnlineNumber) return;
  // Снимаем старую подписку, если была
  if (hudPlayersListener) db.ref("players").off("value", hudPlayersListener);
  hudPlayersListener = snap => {
    const players = snap.val() || {};
    const count = Object.values(players).filter(p => p.status === "alive").length;
    hudOnlineNumber.textContent = count;
  };
  db.ref("players").on("value", hudPlayersListener);
}

// ==================== Сброс к ожиданию ====================
function handleGameResetToWaiting() {
  resetAllScreens();

  const waitingScreen = document.getElementById("waitingScreen");
  if (waitingScreen) {
    waitingScreen.style.display = "flex";
    waitingScreen.classList.add("active");
  }


  alert("Игра была остановлена. Ожидайте начала новой игры.");
}


// ==================== Старт ====================
document.addEventListener("DOMContentLoaded", () => {
  const registerBtn = document.getElementById("registerBtn");
  if (registerBtn) {
    registerBtn.onclick = async () => {
      const input = document.getElementById("playerInput");
     const num = parseInt(input.value.trim());
if (isNaN(num) || num < 1 || num > 60) {
  alert("Введите номер от 1 до 60");
  return;
}
      // Проверка уникальности номера в базе:
      try {
        const snap = await db.ref("players/" + num).once("value");
        if (snap.exists()) {
          alert("Этот номер уже занят, выберите другой!");
          return;
        }

        // Если номер свободен, регистрируем игрока
        await db.ref("players/" + num).set({
          status: "alive",
          joinedAt: Date.now()
        });

        // Переход к HUD
        initHUD(num);

      } catch (e) {
        alert("Ошибка соединения, попробуйте ещё раз");
        console.error(e);
      }
    };
  }

  // --- Восстановление игрока при повторном входе --- //
  const saved = localStorage.getItem("playerNumber");
  if (saved) {
    db.ref("players/" + saved).once("value", snap => {
      if (snap.exists()) initHUD(saved);
      else localStorage.removeItem("playerNumber");
    });
  }
});



// ==================== Основная инициализация HUD ====================
let isResetting = false;
let roleRevealHandled = false; // Защита от повторного срабатывания

// 🔁 Реакция на запуск roleRevealStart (показ роли через задержку)
db.ref("game/roleRevealStart").on("value", snap => {
  const start = snap.val();
  if (!start || roleRevealHandled) return;

  // Блокируем повторное отображение роли, если событие старше входа на страницу
  if (start < sessionStartedAt) return;

  roleRevealHandled = true; // блок повторного срабатывания

  const now = Date.now();
  const delay = Math.max(0, start - now);

  const showRole = () => {
    const number = localStorage.getItem("playerNumber");
    if (!number) return;

    db.ref("players/" + number).once("value").then(snap => {
      const data = snap.val();
      if (!data || !data.role) return;

      // ------ Управляй только roleScreen, например ------
      const roleScreen = document.getElementById("roleScreen");
      const roleText = document.getElementById("roleText");
      if (roleScreen && roleText) {

        roleText.style.color = data.role === "imposter" ? "red" : "dodgerblue";
        roleScreen.style.display = "flex";
        // Закрыть через 2 секунды:
        setTimeout(() => {
          roleScreen.style.display = "none";
        }, 2000);
      }
    });
  };


  if (delay > 0) {
    setTimeout(showRole, delay);
  } else {
    showRole();
  }
});


// 🔁 Обработка возврата на экран ожидания при остановке игры
let lastState = null;

db.ref("game/state").on("value", snap => {
  const state = snap.val();
  lastState = state;

  if (state === "waiting") {
  const number = localStorage.getItem("playerNumber");
  resetAllScreens();
  if (number) {
    const waitingScreen = document.getElementById("waitingScreen");
    if (waitingScreen) waitingScreen.style.display = "flex";
    monitorOnlinePlayers?.();
  } else {
    const reg = document.getElementById("registerScreen");
    if (reg) {
      reg.style.display = "flex";
      reg.classList.add("active");
    }
  }
}

});



// ==================== HUD после регистрации ====================
function initHUD(number) {
  playerNumber = number;
  const playerRef = db.ref("players/" + number);
  localStorage.setItem("playerNumber", number);

  resetAllScreens();
  const waitingScreen = document.getElementById("waitingScreen");
  if (waitingScreen) {
    waitingScreen.style.display = "flex";
    monitorOnlinePlayers();
  }

  db.ref("players/" + number).once("value").then(snap => {
    if (!snap.exists()) return playerRef.set({ status: "alive", role: "crew", joinedAt: Date.now() });
    if (!snap.val().joinedAt) return playerRef.update({ joinedAt: Date.now() });
  }).then(() => {
    db.ref("players/" + number).on("value", snap => {
      if (!snap.exists()) handlePlayerDeletion();
    });

    let playerAlive = true;
    db.ref("players/" + number).on("value", snap => {
      const data = snap.val();
      if (!data) return;

      if (data.status === "dead" && playerAlive) {
        playerAlive = false;
        if (deathSound) deathSound.play();
      }
    });

    const gameRef = db.ref("game");
    const handleGameChange = (snap) => {
      const game = snap.val();
      // Запускать только если не запускали ещё и state === "started"
      if (game?.state === "started" && !gameStartedHandled) {
        gameStartedHandled = true;
        db.ref("players/" + number).once("value").then(snap => {
          const player = snap.val();
          if (player.joinedAt > game.startedAt) {
            showHUD(playerRef);
          } else {
            startGameSequence(game, playerRef);
          }
        });
      }
      // Если игра не в "started", сбрасываем флаг
      if (game?.state !== "started") {
        gameStartedHandled = false;
      }
    };
    gameRef.on("value", handleGameChange);
  });
}

function startGameSequence(game, playerRef) {
  const countdownScreen = document.getElementById("countdownScreen");
  const countdownNumber = document.getElementById("countdownNumber");
  const roleScreen = document.getElementById("roleScreen");
  const roleText = document.getElementById("roleText");

  const waitingScreen = document.getElementById("waitingScreen");
  if (waitingScreen) waitingScreen.style.display = "none";

  // Показываем countdownScreen
  if (countdownScreen) {
    countdownScreen.classList.add("active");
    countdownScreen.style.display = "flex";
    console.log("Показываем countdownScreen");
  }
  if (countdownNumber) countdownNumber.innerText = "Скоро узнаешь свою роль...";

  setTimeout(() => {
    let count = 3;
    const interval = setInterval(() => {
      if (countdownNumber) countdownNumber.innerText = count;
      count--;
      if (count < 0) {
        clearInterval(interval);
        if (countdownScreen) {
          countdownScreen.classList.remove("active");
          countdownScreen.style.display = "none";
        }
        db.ref("players/" + playerNumber + "/role").once("value", snap => {
          const role = snap.val();
          if (roleText) {
  if (role === "imposter") {
    roleText.innerHTML = "🟥 Ты ИМПОСТЕР!<br><br><b>СЕКРЕТ:</b> если нажмёшь на свою иконку <img src='avatars/red.webp' style='height:1.5em;vertical-align:middle;'> появятся дополнительные функции";
  } else {
    roleText.innerHTML = "🟦 Ты мирный.";
  }
}


          if (roleScreen) {
            roleScreen.classList.add("active");
            console.log("Показываем roleScreen");
          }
          setTimeout(() => {
            if (roleScreen) roleScreen.classList.remove("active");
            showHUD(playerRef);
            console.log("Показываем HUD после собрания");
          }, 4000);
        });
      }
    }, 2000);
  }, 3000);
}


function showHUD(playerRef) {
  const hudScreen = document.getElementById("hudScreen");
  const playerNumberEl = document.getElementById("playerNumber");
  const playerAvatar = document.getElementById("playerAvatar");
  if (hudScreen) hudScreen.style.display = "block";
  if (playerNumberEl) playerNumberEl.innerText = playerNumber;
  if (playerAvatar) playerAvatar.src = `avatars/${['red','blue','orange','black','white','pink'][(playerNumber - 1) % 6]}.webp`;
  monitorHudOnlinePlayers(); // Показываем онлайн прямо в HUD!
  setupPlayerUI(playerRef);
  checkVotingWindow();
  updateMyVoteInfo();
  db.ref("suspicion").on("value", () => updateMyVoteInfo());
  db.ref("players").on("value", () => updateMyVoteInfo());
}
// ==================== UI ====================
function setupPlayerUI(playerRef) {
  const voteBtn = document.getElementById("voteBtn");
  const statusEl = document.getElementById("playerStatus");
  const taskSection = document.querySelector(".tasks-section");
  const meetingSection = document.getElementById("meetingSection");

  let lastRole = null;

  // Функция для переключения фона
  function changeBackground(isMeetingActive) {
    const body = document.body;
    if (isMeetingActive) {
      body.classList.add("meeting-active");
    } else {
      body.classList.remove("meeting-active");
    }
  }

  db.ref("meetings").on("value", snap => {
    const meeting = snap.val();
    if (meeting && meeting.active) {
      changeBackground(true);
    } else {
      changeBackground(false);
    }
  });


playerRef.on("value", snap => {
  const player = snap.val();
  if (!player) return;
  if (statusEl) {
    statusEl.innerText = player.status === "dead" ? "Мёртв" : "Жив";
    statusEl.classList.toggle("dead", player.status === "dead");
  }
    if (player.status === "dead") {
    // Скрываем/блокируем все кнопки голосования
    const voteBtn = document.getElementById("voteBtn");
    if (voteBtn) {
      voteBtn.disabled = true;
      voteBtn.style.display = "none";
    }
    hideVotingButtons();
  }
  if (voteBtn) voteBtn.style.display = player.status === "dead" ? "none" : "block";
  if (taskSection) taskSection.style.display = player.role === "imposter" ? "none" : "block";

  // 👇 Исправленный блок: ставим кулдаун при назначении роли
  if (
    player.role === "imposter" &&
    lastRole !== "imposter" &&                    // только если роль стала импостером СЕЙЧАС
    typeof player.killAvailableAt === "undefined" // и killAvailableAt еще не задан
  ) {
    db.ref("game/startedAt").once("value", snap2 => {
      const startedAt = snap2.val() || Date.now();
      const firstKillAvailableAt = startedAt + 60 * 1000; // через минуту после старта
      playerRef.update({ killAvailableAt: firstKillAvailableAt, killsLeft: KILL_LIMIT });
    });
  }

  lastRole = player.role; 

  enableImposterHUD(player.role, player.status);
});



if (voteBtn) voteBtn.onclick = () => {
  if (!canVote) return;
  const target = prompt("На кого ты подозреваешь (1–60)?");
  if (!target || isNaN(target) || target < 1 || target > 60 || Number(target) === Number(playerNumber)) {
    return alert("Некорректный выбор");
  }
  db.ref("game/startedAt").once("value", snap => {
    const startedAt = snap.val() || 0;
    const now = Date.now();
    if (!startedAt || now < startedAt + 60 * 1000) {
      alert("Голосовать можно только через минуту после старта игры!");
      return;
    }
    db.ref("players/" + playerNumber + "/voteCooldownUntil").once("value", snap2 => {
      const cooldownUntil = snap2.val() || 0;
      if (cooldownUntil && now < cooldownUntil) {
        alert(`Голосовать можно через ${formatTime(cooldownUntil - now)}`);
        return;
      }
      db.ref("players/" + target + "/status").once("value", statusSnap => {
        const status = statusSnap.val();
        if (status !== "alive") {
          alert("Игрок уже мёртв. Голосовать за него нельзя.");
          return;
        }
        const cooldown = 60 * 1000; // 1 минута
        const expireAt = Date.now() + cooldown;
        db.ref("suspicion").once("value", snap3 => {
          const suspicion = snap3.val() || {};
          const updates = {};
          Object.entries(suspicion).forEach(([someTarget, voters]) => {
            if (voters && voters[playerNumber]) {
              updates[`suspicion/${someTarget}/${playerNumber}`] = null;
            }
          });
          updates[`suspicion/${target}/${playerNumber}`] = expireAt;
          updates[`players/${playerNumber}/voteCooldownUntil`] = expireAt;
          db.ref().update(updates);
          canVote = false;
          if (voteBtn) {
            voteBtn.disabled = true;
            voteBtn.innerText = "Голос засчитан";
          }
          checkVotingWindow();
          updateMyVoteInfo();
        });
      });
    });
  });
};
}
const KILL_COOLDOWN = 60 * 1000; // 60 секунд
const KILL_LIMIT = 2;

let killCooldownInterval = null;

// Вынесем флаг, чтобы пульсация не повторялась при каждом апдейте UI
let pulseShown = false;

// Функция подсветки карточки
function pulseImposterIcon() {
  const card = document.getElementById('playerCard');
  if (!card) return;
  card.classList.add('pulse-imp-icon');
  setTimeout(() => card.classList.remove('pulse-imp-icon'), 3000);
}

// Основная логика панели импостера
function setupImposterTools(playerRef) {
  const killBtn = document.getElementById('killBtn');
  const killCooldown = document.getElementById('killCooldown');
  const killLeft = document.getElementById('killLeft');

  async function readAndUpdateUI() {
    const playerSnap = await playerRef.once("value");
    const player = playerSnap.val();
    const killsLeft = (typeof player.killsLeft === 'number') ? player.killsLeft : KILL_LIMIT;
    const killAvailableAt = player.killAvailableAt || 0;
    const now = Date.now();

    // Кулдаун
    if (killAvailableAt > now) {
      const left = Math.ceil((killAvailableAt - now) / 1000);
      killCooldown.innerText = `Осталось: ${left} сек.`;
      killBtn.disabled = true;
    } else {
      killCooldown.innerText = '';
      killBtn.disabled = (killsLeft <= 0);

      // Пульсация карточки, когда кнопка впервые становится доступной
      if (!pulseShown && killsLeft > 0) {
        pulseImposterIcon();
        pulseShown = true;
      }
    }

    killLeft.innerText = `Осталось убийств: ${killsLeft}`;
    if (killsLeft <= 0) killBtn.disabled = true;

    // Красный цвет и эффект кулдауна на кнопке
    killBtn.classList.toggle('kill-btn-on-cooldown', killBtn.disabled && (killAvailableAt > now));
    killBtn.classList.add('kill-btn');
  }

  // Слушаем изменения в базе
  playerRef.on("value", readAndUpdateUI);

  // Таймер для обновления интерфейса
  if (killCooldownInterval) clearInterval(killCooldownInterval);
  killCooldownInterval = setInterval(readAndUpdateUI, 1000);

  // Обработка клика по кнопке
  killBtn.onclick = async () => {
    const playerSnap = await playerRef.once("value");
    const player = playerSnap.val();
    let killsLeft = (typeof player.killsLeft === 'number') ? player.killsLeft : KILL_LIMIT;
    let killAvailableAt = player.killAvailableAt || 0;
    const now = Date.now();

    if (killsLeft <= 0) return alert("У тебя закончились убийства!");
    if (killAvailableAt > now) {
      alert(`Подожди ${Math.ceil((killAvailableAt - now)/1000)} сек. до следующего убийства!`);
      return;
    }

    const target = prompt("Кого убить? Введи номер игрока (1–60):");
    if (!target || isNaN(target) || target < 1 || target > 60 || Number(target) === Number(playerNumber)) {
      return alert("Некорректный номер.");
    }

    // Проверяем статус цели
    const statusSnap = await db.ref("players/" + target + "/status").once("value");
    if (statusSnap.val() !== "alive") {
      alert("Этот игрок уже мёртв!");
      return;
    }

    // Убиваем игрока
    await db.ref("players/" + target).update({ status: "dead" });

    // Сохраняем кулдаун и лимит
    killsLeft -= 1;
    killAvailableAt = Date.now() + KILL_COOLDOWN;
    await playerRef.update({
      killsLeft: killsLeft,
      killAvailableAt: killAvailableAt
    });

    // Кнопка сразу блокируется
    killBtn.disabled = true;
    readAndUpdateUI();
    alert(`Игрок №${target} был убит!`);
  };
}

// Функция для активации HUD импостера
function enableImposterHUD(playerRole, playerStatus) {
  const card = document.getElementById('playerCard');
  if (!card) return;
  card.onclick = null;

  // Только если ты импостер и жив
  if (playerRole === "imposter" && playerStatus === "alive") {
    card.onclick = () => {
      showScreen('imposterHUD');
      const playerRef = db.ref("players/" + playerNumber);
      setupImposterTools(playerRef);
    };
    card.style.cursor = "pointer";
  } else {
    card.onclick = null;
    card.style.cursor = "default";
  }
}



// === Глобальная переменная для таймера собрания
window.meetingTimerInterval = null;

// ==================== Проверка голосования в Firebase ====================
window.db.ref("meetings").on("value", snap => {
  const m = snap.val();
  const hudScreen = document.getElementById("hudScreen");
  const meetingSection = document.getElementById("meetingSection");
  const meetingTarget = document.getElementById("meetingTarget");
  const meetingTimer = document.getElementById("meetingTimer");
  const kickCount = document.getElementById("meetingKickCount");
  const skipCount = document.getElementById("meetingSkipCount");

if (!hudScreen || !meetingSection || !meetingTarget) return;

if (m && m.active) {
  hudScreen.style.display = "none";
  meetingSection.style.display = "block";

  // 👇 СКРЫВАЕМ HUD импостера, если открыт
  const imposterHUD = document.getElementById("imposterHUD");
  if (imposterHUD) {
    imposterHUD.style.display = "none";
    imposterHUD.classList.remove("active");
  }

  meetingTarget.innerText = `Цель: Игрок №${m.target}`;
  if (m && m.active && m.timerSet === false) {
    if (meetingSound) meetingSound.play();
  }
  if (meetingTimer && m.startedAt) {
    if (window.meetingTimerInterval) clearInterval(window.meetingTimerInterval);

    const MEETING_DURATION = 30000; // в миллисекундах (30 сек)

    function updateMeetingTimerDisplay() {
      const now = Date.now();
      const elapsed = now - m.startedAt;
      const remaining = Math.max(0, MEETING_DURATION - elapsed);
      const seconds = (remaining / 1000).toFixed(3); // округление до 1 знака после запятой
      meetingTimer.innerText = seconds;

      if (remaining <= 0 && window.meetingTimerInterval) {
        clearInterval(window.meetingTimerInterval);
        countVotes(m); // Завершаем голосование
      }
    }

    updateMeetingTimerDisplay(); // запустить сразу
    window.meetingTimerInterval = setInterval(updateMeetingTimerDisplay, 100); // обновляем 10 раз/сек
  }
  window.db.ref("meetings/votes").on("value", (snapshot) => {
    const votes = snapshot.val() || {};
    let kick = 0, skip = 0;
    Object.values(votes).forEach(v => {
      if (v === "kick") kick++;
      else if (v === "skip") skip++;
    });
    if (kickCount) kickCount.innerText = `Кик: ${kick}`;
    if (skipCount) skipCount.innerText = `Оставить: ${skip}`;
  });

} else {
  meetingSection.style.display = "none";
  if (window.meetingTimerInterval) clearInterval(window.meetingTimerInterval);
  localStorage.removeItem("voted");
  db.ref("players/" + playerNumber).once("value").then(snap => {
    if (snap.val()?.status !== "alive") {
      hudScreen.style.display = "none";
    } else {
      hudScreen.style.display = "block"; // 👈 возвращаем HUD если игрок жив!
    }
  });
}
});



// ==================== Глобальный слушатель кика ====================
let lastKickedShownAt = 0;

db.ref("game/lastKicked").on("value", (snap) => {
  const data = snap.val();
  if (!data || !data.number || !data.role || !data.shownAt) return;

  if (data.shownAt <= lastKickedShownAt) return;
  lastKickedShownAt = data.shownAt;

  let playerRoleStr;
  if (data.number === "skip") {
    playerRoleStr = "Никто не был исключён";
  } else {
    playerRoleStr = `Игрок №${data.number} — ${data.role === "imposter" ? "Импостер" : "Мирный"}`;
  }
  showImposterImage(playerRoleStr, { timeout: 2500 });
});

function countVotes(meeting) {
  const votes = meeting.votes || {};
  let kick = 0, skip = 0;
  Object.values(votes).forEach(v => {
    if (v === "kick") kick++;
    else if (v === "skip") skip++;
  });

  const kickCount = document.getElementById("meetingKickCount");
  const skipCount = document.getElementById("meetingSkipCount");
  if (kickCount) kickCount.innerText = `Кик: ${kick}`;
  if (skipCount) skipCount.innerText = `Оставить: ${skip}`;

  if (kick > skip && meeting.target) {
    const kickedPlayer = meeting.target;
    db.ref("players/" + kickedPlayer + "/role").once("value", snap => {
      const playerRole = snap.val();

      // 🟥 Убиваем игрока
      db.ref("players/" + kickedPlayer).update({ status: "dead" });

      // 🟡 Сохраняем lastKicked в game
      db.ref("game/lastKicked").set({
        number: kickedPlayer,
        role: playerRole,
        shownAt: Date.now()
      });

      // ✅ Удаляем через 5 секунд, чтобы не повторно не показалось
      setTimeout(() => {
        db.ref("game/lastKicked").remove();
      }, 5000);
    });
  }
  
}





// ==================== Показ изображения роли (с печатной машинкой!) ====================
function showImposterImage(playerRoleString) {
  console.log("🔔 Показ роли запускается:", playerRoleString);
  if (window._roleRevealRunning) return;
  window._roleRevealRunning = true;

  const imageContainer = document.getElementById('imposterImage');
  const roleTextElement = document.getElementById('imposterRoleText');
  if (!imageContainer || !roleTextElement) return;

  let numberText = "";
  let roleText = "";
  const match = playerRoleString.match(/^Игрок №(\d+)\s*—\s*(Импостер|Мирный)$/i);
  if (match) {
    numberText = `Игрок №${match[1]}`;
    roleText = match[2];
  } else {
    numberText = playerRoleString;
    roleText = "";
  }

  imageContainer.style.display = "flex";
  imageContainer.classList.add("visible");
  roleTextElement.classList.add("visible");
  roleTextElement.style.color = "white";
  roleTextElement.textContent = "";

  let i = 0;
  function typeNumberText() {
    if (i < numberText.length) {
      roleTextElement.textContent = numberText.slice(0, i + 1);
      i++;
      setTimeout(typeNumberText, 100);
    } else {
      setTimeout(() => {
        roleTextElement.classList.remove("visible");
        setTimeout(() => {
          // Теперь здесь цвет будет красным для "Импостер"
          roleTextElement.textContent = roleText;
          if (roleText.toLowerCase().includes("импостер")) {
            roleTextElement.style.color = "red";
          } else if (roleText.toLowerCase().includes("мирный")) {
            roleTextElement.style.color = "dodgerblue";
          } else {
            roleTextElement.style.color = "white";
          }
          roleTextElement.classList.add("visible");

          setTimeout(() => {
            imageContainer.classList.remove("visible");
            setTimeout(() => {
              imageContainer.style.display = "none";
              document.body.removeAttribute("style");
              window._roleRevealRunning = false;
            }, 1000);
          }, 4000);
        }, 1000);
      }, 500);
    }
  }

  typeNumberText();
}




function updateVotingButtons() {
  const voteKickBtn = document.getElementById("voteKickBtn");
  const voteSkipBtn = document.getElementById("voteSkipBtn");
  // Проверяем, жив ли игрок
  db.ref("players/" + playerNumber).once("value", snap => {
    if (!snap.exists() || snap.val().status !== "alive") {
      hideVotingButtons();
      return;
    }
    if (voteKickBtn && voteSkipBtn) {
      voteKickBtn.style.display = 'inline-block';
      voteSkipBtn.style.display = 'inline-block';
      voteKickBtn.disabled = false;
      voteSkipBtn.disabled = false;
    }
  });
}

function hideVotingButtons() {
  const voteKickBtn = document.getElementById("voteKickBtn");
  const voteSkipBtn = document.getElementById("voteSkipBtn");
  if (voteKickBtn && voteSkipBtn) {
    voteKickBtn.style.display = "none";
    voteSkipBtn.style.display = "none";
    voteKickBtn.disabled = true;
    voteSkipBtn.disabled = true;
  }
}

// --- Обработчики кнопок с защитой ---
const voteKickBtn = document.getElementById("voteKickBtn");
if (voteKickBtn) {
  voteKickBtn.onclick = async () => {
    const snap = await db.ref("players/" + playerNumber).once("value");
    if (!snap.exists() || snap.val().status !== "alive") {
      alert("Мертвые не могут голосовать!");
      hideVotingButtons();
      return;
    }
    db.ref(`meetings/votes/${playerNumber}`).set("kick").then(() => {
      hideVotingButtons();
    });
  };
}

const voteSkipBtn = document.getElementById("voteSkipBtn");
if (voteSkipBtn) {
  voteSkipBtn.onclick = async () => {
    const snap = await db.ref("players/" + playerNumber).once("value");
    if (!snap.exists() || snap.val().status !== "alive") {
      alert("Мертвые не могут голосовать!");
      hideVotingButtons();
      return;
    }
    db.ref(`meetings/votes/${playerNumber}`).set("skip").then(() => {
      hideVotingButtons();
    });
  };
}

// --- Следим за митингом и состоянием голосования ---
db.ref("meetings").on("value", (snapshot) => {
  const meetingData = snapshot.val();
  if (!meetingData) return;
  // Обновлять только если игрок еще не голосовал
  if (meetingData.active && !(meetingData.votes && meetingData.votes[playerNumber])) {
    updateVotingButtons();
  }
});

db.ref("meetings/votes").on("value", (snapshot) => {
  const votes = snapshot.val();
  if (votes && !votes[playerNumber]) {
    updateVotingButtons();
  }
});

// --- Обновление инфы о подозреваемом (без изменений) ---
function updateMyVoteInfo() {
  Promise.all([
    db.ref("suspicion").once("value"),
    db.ref("players").once("value")
  ]).then(([suspicionSnap, playersSnap]) => {
    const suspicion = suspicionSnap.val() || {};
    const players = playersSnap.val() || {};
    let myTarget = null;

    Object.entries(suspicion).forEach(([target, voters]) => {
      if (
        voters && voters[playerNumber] &&
        players[target] && players[target].status === "alive"
      ) {
        myTarget = target;
      }
    });

    const voteInfoEl = document.getElementById("myVoteInfo");
    if (voteInfoEl) {
      voteInfoEl.innerText = myTarget
        ? `Вы подозреваете игрока №${myTarget}`
        : `Вы пока никого не подозреваете`;
    }
  });
}


function checkVotingWindow() {
  const voteBtn = document.getElementById("voteBtn");
  const cooldownTimer = document.getElementById("cooldownTimer");
  if (window.voteCooldownTimer) clearInterval(window.voteCooldownTimer);

  db.ref("game/startedAt").once("value", snap => {
    const startedAt = snap.val() || 0;
    const now = Date.now();
    if (!startedAt) {
      if (voteBtn) {
        voteBtn.disabled = true;
        voteBtn.innerText = "Ожидание старта...";
      }
      if (cooldownTimer) cooldownTimer.innerText = "";
      return;
    }

    if (now < startedAt + 60 * 1000) {
      if (voteBtn) {
        voteBtn.disabled = true;
        const left = (startedAt + 60 * 1000) - now;
        voteBtn.innerText = `Голосовать можно через ${formatTime(left)}`;
      }
      if (cooldownTimer) cooldownTimer.innerText = "";
      window.voteCooldownTimer = setInterval(() => {
        const t = (startedAt + 60 * 1000) - Date.now();
        if (t <= 0) {
          clearInterval(window.voteCooldownTimer);
          checkVotingWindow();
        } else if (voteBtn) {
          voteBtn.innerText = `Голосовать можно через ${formatTime(t)}`;
        }
      }, 1000);
      return;
    }

    db.ref("players/" + playerNumber + "/voteCooldownUntil").once("value", snap2 => {
      const cooldownUntil = snap2.val() || 0;
      const now2 = Date.now();
      if (cooldownUntil && now2 < cooldownUntil) {
        if (voteBtn) {
          voteBtn.disabled = true;
          voteBtn.innerText = `Голосовать можно через ${formatTime(cooldownUntil - now2)}`;
        }
        if (cooldownTimer) cooldownTimer.innerText = "";
        window.voteCooldownTimer = setInterval(() => {
          const t = cooldownUntil - Date.now();
          if (t <= 0) {
            clearInterval(window.voteCooldownTimer);
            checkVotingWindow();
          } else if (voteBtn) {
            voteBtn.innerText = `Голосовать можно через ${formatTime(t)}`;
          }
        }, 1000);
      } else {
        if (voteBtn) {
          voteBtn.disabled = false;
          voteBtn.innerText = "Голосовать";
          canVote = true;
        }
        if (cooldownTimer) cooldownTimer.innerText = "";
      }
    });
  });
}
