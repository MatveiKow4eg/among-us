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
    meetingTarget.innerText = `Цель: Игрок №${m.target}`;
    if (meetingTimer && m.startedAt) {
      if (window.meetingTimerInterval) clearInterval(window.meetingTimerInterval);
      function updateMeetingTimerDisplay() {
        const now = Date.now();
        const secondsLeft = Math.max(0, 20 - Math.floor((now - m.startedAt) / 1000));
        meetingTimer.innerText = secondsLeft;
        if (secondsLeft <= 0 && window.meetingTimerInterval) {
          clearInterval(window.meetingTimerInterval);
          countVotes(m);
        }
      }
      updateMeetingTimerDisplay();
      window.meetingTimerInterval = setInterval(updateMeetingTimerDisplay, 1000);
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
db.ref("game/lastKicked").on("value", snap => {
  const data = snap.val();
  if (!data) return;
  if (data.shownAt && data.shownAt !== lastKickedShownAt) {
    lastKickedShownAt = data.shownAt;
    document.getElementById("hudScreen").style.display = "none";
    document.getElementById("meetingSection").style.display = "none";
    showImposterImage(
      `Игрок №${data.number} — ${data.role === "imposter" ? "Импостер" : "Мирный"}`
    );
    setTimeout(() => {
      document.getElementById("hudScreen").style.display = "block";
    }, 6500);
  }
});

// ==================== Подсчёт голосов ====================
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
      // отмечаем игрока как убитого
      db.ref("players/" + kickedPlayer).update({ status: "dead" });
      // обновляем поле lastKicked
      db.ref("game/lastKicked").set({
        number: kickedPlayer,
        role: playerRole,
        shownAt: Date.now()
      });
      // Локальный вызов showImposterImage УДАЛЁН!
    });
  }
}

// ==================== Показ изображения роли (с печатной машинкой!) ====================
function showImposterImage(playerRoleString) {
  const imageContainer = document.getElementById('imposterImage');
  const roleTextElement = document.getElementById('imposterRoleText');
  if (!imageContainer || !roleTextElement) return;

  // Парсим номер и роль
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

  // Показываем контейнер и сразу делаем текст видимым!
  imageContainer.style.display = "flex";
  imageContainer.classList.add("visible");
  roleTextElement.classList.add("visible");
  roleTextElement.style.color = "white";
  roleTextElement.textContent = "";

  // Печатная машинка для "Игрок №..."
  let i = 0;
  function typeNumberText() {
    if (i <= numberText.length) {
      roleTextElement.textContent = numberText.slice(0, i);
      i++;
      setTimeout(typeNumberText, 200);
    } else {
      // Пауза, затем плавно скрываем текст
      setTimeout(() => {
        roleTextElement.classList.remove("visible"); // исчезает через opacity
        setTimeout(() => {
          // Показываем роль плавно
          roleTextElement.textContent = roleText;
          roleTextElement.style.color = roleText.toLowerCase().includes("импостер") ? "red" : "dodgerblue";
          roleTextElement.classList.add("visible"); // плавно появляется
          // Через 5 секунд скрываем весь экран
          setTimeout(() => {
            imageContainer.classList.remove("visible");
            setTimeout(() => {
              imageContainer.style.display = "none";
            }, 1000); // время transition: opacity 1s
          }, 4000);
        }, 1000); // ждём, пока opacity дойдёт до 0 (1s из transition)
      }, 1500); // пауза после печатной машинки
    }
  }
  typeNumberText();
}


// === Дальше идут кнопки и голоса (можно не менять)
function updateVotingButtons() {
  const voteKickBtn = document.getElementById("voteKickBtn");
  const voteSkipBtn = document.getElementById("voteSkipBtn");
  if (voteKickBtn && voteSkipBtn) {
    voteKickBtn.style.display = 'inline-block';
    voteSkipBtn.style.display = 'inline-block';
  }
}

function hideVotingButtons() {
  const voteKickBtn = document.getElementById("voteKickBtn");
  const voteSkipBtn = document.getElementById("voteSkipBtn");
  if (voteKickBtn && voteSkipBtn) {
    voteKickBtn.style.display = "none";
    voteSkipBtn.style.display = "none";
  }
}

const voteKickBtn = document.getElementById("voteKickBtn");
if (voteKickBtn) {
  voteKickBtn.onclick = () => {
    db.ref(`meetings/votes/${playerNumber}`).set("kick").then(() => {
      hideVotingButtons();
    });
  };
}

const voteSkipBtn = document.getElementById("voteSkipBtn");
if (voteSkipBtn) {
  voteSkipBtn.onclick = () => {
    db.ref(`meetings/votes/${playerNumber}`).set("skip").then(() => {
      hideVotingButtons();
    });
  };
}

db.ref("meetings").on("value", (snapshot) => {
  const meetingData = snapshot.val();
  if (!meetingData) return;
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
