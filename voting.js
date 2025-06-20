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

db.ref("Voting").on("value", (snap) => {
  const data = snap.val() || {};
  votesList.innerHTML = "";

  if (Object.keys(data).length === 0) {
    votesList.innerHTML = "<li>Нет активных голосов</li>";
    return;
  }

  // Группировка: против кого голосуют
  const grouped = {};
  Object.entries(data).forEach(([voter, target]) => {
    if (!grouped[target]) grouped[target] = [];
    grouped[target].push(voter);
  });

  Object.entries(grouped).forEach(([target, voters]) => {
    const li = document.createElement("li");
    li.innerHTML = `👤 Игрок №<b>${target}</b> получил ${voters.length} голосов от: ${voters.join(", ")}`;
    votesList.appendChild(li);
  });
});