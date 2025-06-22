const db = window.db;

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
    if (el) {
      el.style.display = "none";
      el.classList.remove("active");
    }
  });
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

function handleGameResetToWaiting() {
  resetAllScreens();
  const waitingScreen = document.getElementById("waitingScreen");
  if (waitingScreen) waitingScreen.style.display = "flex";
  localStorage.removeItem("voted");
}

// ==================== Старт ====================
document.addEventListener("DOMContentLoaded", () => {
  const registerBtn = document.getElementById("registerBtn");
  if (registerBtn) {
    registerBtn.onclick = () => {
      const input = document.getElementById("playerInput");
      const num = input.value.trim();
      if (!/^[1-9][0-9]?$|^60$/.test(num)) return alert("Введите номер от 1 до 60");
      initHUD(num);
    };
  }

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
  const waitingScreen = document.getElementById("waitingScreen");
  if (waitingScreen) waitingScreen.style.display = "flex";

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

  const waitingScreen = document.getElementById("waitingScreen");
  if (waitingScreen) waitingScreen.style.display = "none";
  if (countdownScreen) {
    countdownScreen.classList.add("active");
    countdownScreen.style.display = "flex";
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
          if (roleText) roleText.innerText = role === "imposter" ? "🟥 Ты ИМПОСТЕР!" : "🟦 Ты мирный.";
          if (roleScreen) roleScreen.classList.add("active");
          setTimeout(() => {
            if (roleScreen) roleScreen.classList.remove("active");
            showHUD(playerRef);
          }, 2000);
        });
      }
    }, 1000);
  }, 3000);
}

function showHUD(playerRef) {
  const hudScreen = document.getElementById("hudScreen");
  const roleButton = document.getElementById("roleButton");
  const playerNumberEl = document.getElementById("playerNumber");
  const playerAvatar = document.getElementById("playerAvatar");
  if (hudScreen) hudScreen.style.display = "block";
  if (roleButton) roleButton.style.display = "block";
  if (playerNumberEl) playerNumberEl.innerText = playerNumber;
  if (playerAvatar) playerAvatar.src = `avatars/${['red','blue','orange','black','white','pink'][(playerNumber - 1) % 6]}.webp`;

  setupPlayerUI(playerRef);
  checkVotingWindow();
  updateMyVoteInfo();
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
    if (statusEl) {
      statusEl.innerText = player.status === "dead" ? "Мёртв" : "Жив";
      statusEl.classList.toggle("dead", player.status === "dead");
    }
    if (voteBtn) voteBtn.style.display = player.status === "dead" ? "none" : "block";
    if (taskSection) taskSection.style.display = player.role === "imposter" ? "none" : "block";
  });

  const roleButton = document.getElementById("roleButton");
  if (roleButton) {
    roleButton.onclick = () => {
      db.ref("players/" + playerNumber + "/role").once("value", snap => {
        const role = snap.val();
        const roleDisplay = document.getElementById("roleDisplay");
        if (roleDisplay) {
          roleDisplay.innerText = role === "imposter" ? "🟥 Ты ИМПОСТЕР!" : "🟦 Ты мирный.";
          roleDisplay.style.display = "block";
          setTimeout(() => roleDisplay.style.display = "none", 2000);
        }
      });
    };
  }

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

      // ✅ ПРОВЕРКА: жив ли игрок, за которого голосуем
      db.ref("players/" + target + "/alive").once("value", aliveSnap => {
        const isAlive = aliveSnap.val();
        if (!isAlive) {
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

// === Глобальная переменная для таймера собрания
window.meetingTimerInterval = null;

// Проверяем голосование в Firebase
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
    meetingTarget.innerText = `Цель: Игрок №${m.target}`;

    // Таймер собрания, который обновляется каждую секунду
    if (meetingTimer && m.startedAt) {
      if (window.meetingTimerInterval) clearInterval(window.meetingTimerInterval);

      function updateMeetingTimerDisplay() {
        const now = Date.now();
        const secondsLeft = Math.max(0, 20 - Math.floor((now - m.startedAt) / 1000));
        meetingTimer.innerText = secondsLeft;
        if (secondsLeft <= 0 && window.meetingTimerInterval) {
          clearInterval(window.meetingTimerInterval);
          // Когда таймер достигает 0, начинаем подсчет голосов
          countVotes(m); // Вызов функции подсчета голосов
        }
      }
      updateMeetingTimerDisplay();
      window.meetingTimerInterval = setInterval(updateMeetingTimerDisplay, 1000);  // обновляем каждую секунду
    }

// Подсчет голосов (будет вызван после 20 секунд)
function countVotes(meeting) {
  const votes = meeting.votes || {};  // Инициализируем пустым объектом, если votes не существует
  let kick = 0, skip = 0;

  // Проходим по всем голосам
  Object.values(votes).forEach(v => {
    if (v === "kick") kick++;
    else if (v === "skip") skip++;
  });

  // Отображение количества голосов
  if (kickCount) kickCount.innerText = `Кик: ${kick}`;
  if (skipCount) skipCount.innerText = `Оставить: ${skip}`;

  console.log(`Голоса за кик: ${kick}, Голоса за пропуск: ${skip}`);  // Лог для проверки голосов

  // Если голосов за "kick" больше, чем за "skip", кикнем игрока
  if (kick > skip && meeting.target) {
    const kickedPlayer = meeting.target;  // Игрок, который был кикнут
    console.log(`Решение принято: кикнут игрок №${kickedPlayer}`);

    // Получаем роль кикнутого игрока из базы данных
    db.ref("players/" + kickedPlayer + "/role").once("value", snap => {
      const playerRole = snap.val();  // Роль кикнутого игрока (например, "imposter" или "crew")
      console.log(`Роль кикнутого игрока: ${playerRole}`);

      // Обновляем статус игрока в Firebase на "мертвого"
      db.ref("players/" + kickedPlayer).update({ status: "dead" });

      // Показываем видео с ролью кикнутого игрока
      if (playerRole === "imposter") {
        console.log("Показываем видео для импостера");
        showImposterVideo("Импостер");  // Показываем видео с ролью "Импостер"
      } else {
        console.log("Показываем видео для мирного");
        showImposterVideo("Мирный");  // Показываем видео с ролью "Мирный"
      }
    });
  }
}


    // Подключаем слушатель изменений для голосов
    window.db.ref("meetings/votes").on("value", (snapshot) => {
      const votes = snapshot.val() || {};  // Инициализируем как пустой объект, если нет данных
      let kick = 0;
      let skip = 0;

      // Подсчитываем количество голосов
      Object.values(votes).forEach(vote => {
        if (vote === "kick") kick++;
        else if (vote === "skip") skip++;
      });

      // Обновляем отображение голосов в реальном времени
      if (kickCount) kickCount.innerText = `Кик: ${kick}`;
      if (skipCount) skipCount.innerText = `Оставить: ${skip}`;
    });

  } else {
    meetingSection.style.display = "none";
    if (window.meetingTimerInterval) clearInterval(window.meetingTimerInterval);
    localStorage.removeItem("voted");
    db.ref("players/" + playerNumber).once("value").then(snap => {
      if (snap.val()?.status === "alive") {
        hudScreen.style.display = "block";
        checkVotingWindow();
      } else {
        hudScreen.style.display = "none";
      }
    });
  }
});

// Функция для эффекта печатной машинки (с HTML)
// Печатаем обычный текст, затем добавляем цветной <span> с ролью
function typeTextWithRole(element, staticText, roleText, roleColor, speed = 50) {
  element.textContent = ""; // очищаем
  let i = 0;

  const interval = setInterval(() => {
    element.textContent += staticText[i];
    i++;
    if (i >= staticText.length) {
      clearInterval(interval);

      // ✅ Добавляем роль как <span>
      const span = document.createElement("span");
      span.textContent = roleText;
      span.style.color = roleColor;
      span.style.fontWeight = "bold";
      element.appendChild(span);
    }
  }, speed);
}


// Функция отображения видео с ролью
function showImposterVideo(playerRole) {
  console.log("showImposterVideo вызвана с ролью:", playerRole);

  const videoContainer = document.getElementById('imposterVideoContainer');
  const videoElement = document.getElementById('imposterVideo');
  const roleTextElement = document.getElementById('imposterRoleText');

  if (videoContainer && videoElement && roleTextElement) {
    console.log("Контейнер с видео найден.");

    videoContainer.style.display = 'flex';

    // Определяем цвет роли
    let roleColor = "white";
    if (playerRole.toLowerCase().includes("импостер")) {
      roleColor = "red";
    } else {
      roleColor = "dodgerblue";
    }

    // Печатаем текст с эффектом
    typeTextWithRole(roleTextElement, "Он был...: ", playerRole, roleColor, 100);
    console.log("Текст для видео установлен: ", playerRole);

    // Воспроизводим видео (но не ждём завершения)
    videoElement.currentTime = 0; // на всякий случай — с начала
    videoElement.play();

    // ❗ Через 5 секунд скрываем видео и возвращаем HUD
    setTimeout(() => {
      console.log("Прошло 5 секунд, возвращаем HUD.");
      videoContainer.style.display = 'none';

      // Переход на HUD (пример: показать HUD-экран)
      const hudScreen = document.getElementById("hudScreen");
      if (hudScreen) {
        hudScreen.style.display = "flex";
      }

    }, 5000); // 5000 мс = 5 секунд

  } else {
    console.error('Ошибка: элементы для видео не найдены.');
  }
}





// Обработчик кнопок голосования
const voteKickBtn = document.getElementById("voteKickBtn");
if (voteKickBtn) {
  voteKickBtn.onclick = () => {
    db.ref(`meetings/votes/${playerNumber}`).set("kick");
    voteKickBtn.style.display = "none";
    const voteSkipBtn = document.getElementById("voteSkipBtn");
    if (voteSkipBtn) voteSkipBtn.style.display = "none";
  };
}

const voteSkipBtn = document.getElementById("voteSkipBtn");
if (voteSkipBtn) {
  voteSkipBtn.onclick = () => {
    db.ref(`meetings/votes/${playerNumber}`).set("skip");
    voteKickBtn.style.display = "none";
    voteSkipBtn.style.display = "none";
  };
}


function updateMyVoteInfo() {
  db.ref("suspicion").once("value", snap => {
    const suspicion = snap.val() || {};
    let myTarget = null;
    Object.entries(suspicion).forEach(([target, voters]) => {
      if (voters && voters[playerNumber]) {
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
