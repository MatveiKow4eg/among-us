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

  // Если нет активного собрания — ничего не делаем
  if (!m || !m.active) return;

  // Если таймер уже установлен — ничего не делаем
  if (m.timerSet) return;

  // Отмечаем, что таймер установлен
  await db.ref("meetings/timerSet").set(true);

  // Очищаем предыдущий таймер
  if (votingMeetingTimer) clearTimeout(votingMeetingTimer);

  console.log("⏳ Собрание началось, таймер на 20 секунд...");

votingMeetingTimer = setTimeout(async () => {
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

  await db.ref("game/globalCooldownUntil").set(Date.now() + 60000);
  await db.ref("suspicion").remove();
  await db.ref("meetings").set(null);

  console.log("✅ Собрание завершено");
}, 20000);

});

// ==================== Отображение голосов ====================
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

db.ref("suspicion").on("value", (snapshot) => {
  const data = snapshot.val() || {};
  Object.entries(data).forEach(([target, voters]) => {
    if (Object.keys(voters).length === 10) {
      // Создаём собрание
      db.ref("meetings").set({
        active: true,
        target: Number(target),
        votes: {},
        timerSet: false,
        startedAt: Date.now()
      });
      db.ref("suspicion").remove();
    }
  });
});
