// Проверяем, находимся ли мы на странице "voting.html"
if (window.location.pathname.includes("voting.html")) {
  const votesList = document.getElementById("votesList");
  if (!votesList) throw new Error("votesList не найден!");

  // ==================== Голоса за подозреваемых (suspicion) ====================
  window.db.ref("suspicion").on("value", (snapshot) => {
    const votes = snapshot.val() || {};  // Инициализируем как пустой объект, если данных нет
    votesList.innerHTML = "";  // Очищаем список перед обновлением

    // Если нет данных в Firebase
    if (Object.keys(votes).length === 0) {
      votesList.innerHTML = "<li>Нет активных голосований</li>";
      return;
    }

    // Получаем текущий номер игрока (например, его можно хранить в localStorage или получать динамически)
    const playerNumber = 'номер игрока'; // Это должен быть реальный номер игрока

    // Проходим по каждому подозреваемому в ветке suspicion
    Object.entries(votes).forEach(([target, voters]) => {
      // Фильтруем голоса, чтобы оставить только действующие (где expireAt существует)
      const activeVoters = Object.entries(voters || {})
        .map(([voter]) => voter); // Получаем список всех голосующих

      // Создаём элемент списка для каждого подозреваемого
      const li = document.createElement("li");

      // Формируем текст для отображения
      li.textContent = `Игрок №${target} — голосуют: ${activeVoters.length > 0 ? activeVoters.join(", ") : "никто"}`;

      // Добавляем этот элемент в список голосов
      votesList.appendChild(li);

      // Если за игрока проголосовало 10 или больше человек
      if (activeVoters.length >= 10) {
        // Удаляем запись о голосах этого игрока из ветки "suspicion"
        window.db.ref(`suspicion/${target}`).remove()
          .then(() => {
            console.log(`Запись за игрока ${target} успешно удалена из suspicion.`);
          })
          .catch((error) => {
            console.error(`Ошибка при удалении записи за игрока ${target}:`, error);
          });

        // Создаём собрание для этого подозреваемого
        window.db.ref("meetings").set({
          active: true,
          target: Number(target),
          votes: {},
          timerSet: false,
          startedAt: Date.now()
        });
      }
    });
  });
}
