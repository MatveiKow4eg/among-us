// ==================== Firebase конфиг ====================
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

const votesList = document.getElementById("votesList");

// ==================== Таймер собрания ХОСТ ====================
let votingMeetingTimer = null;

db.ref("meetings").on("value", async (snap) => {
  const m = snap.val();
  if (m?.active && !m.timerSet) {
    // Ставим флаг чтобы только один раз таймер запускался
    await db.ref("meetings/timerSet").set(true);

    // Если уже есть таймер — сбросить
    if (votingMeetingTimer) clearTimeout(votingMeetingTimer);

    votingMeetingTimer = setTimeout(async () => {
      // Итоги голосования (повторно читаем meeting, чтобы взять последние голоса)
      const mSnap = await db.ref("meetings").once("value");
      const meeting = mSnap.val();
      if (!meeting) return;

const votes = meeting.votes || {};
let kick = 0, skip = 0;
Object.values(votes).forEach(v => {
  if (v === "kick") kick++;
  else if (v === "skip") skip++;
});

const totalVotes = kick + skip;
if (totalVotes > 0 && (kick / totalVotes) > 0.5) {
  await db.ref(`players/${meeting.target}/status`).set("dead");
}

      // Ставим глобальный кулдаун
      await db.ref("game/globalCooldownUntil").set(Date.now() + 60000);

      // Очищаем suspicion и meeting
      await db.ref("suspicion").remove();
      await db.ref("meetings").set(null);

    }, 20000); // 20 секунд!
  }
});

// ==================== Голоса в режиме наблюдения ====================
db.ref("suspicion").on("value", (snapshot) => {
  const votes = snapshot.val();
  votesList.innerHTML = "";
  if (!votes) {
    votesList.innerHTML = "<li>Нет активных голосований</li>";
    return;
  }
  Object.entries(votes).forEach(([target, voters]) => {
    const votersArr = Object.keys(voters || {});
    const li = document.createElement("li");
    li.textContent = `Игрок №${target} — голосуют: ${votersArr.length > 0 ? votersArr.join(", ") : "никто"}`;
    votesList.appendChild(li);
  });
});
