const DEFAULT_SETTINGS = {
  focus: { minutes: 25, seconds: 0 },
  short: { minutes: 5, seconds: 0 },
  long: { minutes: 15, seconds: 0 }
};
const STORAGE_KEYS = {
  settings: "pomodoro-settings",
  tasks: "pomodoro-tasks",
  session: "pomodoro-session",
  completed: "pomodoro-completed",
  cycles: "pomodoro-cycles",
  longBreakDue: "pomodoro-long-break-due",
  darkMode: "pomodoro-dark-mode"
};

const elements = {
  display: document.querySelector("#timer-display"),
  ring: document.querySelector("#timer-ring"),
  label: document.querySelector("#timer-label"),
  round: document.querySelector("#timer-round"),
  start: document.querySelector("#start-button"),
  reset: document.querySelector("#reset-button"),
  taskForm: document.querySelector("#task-form"),
  taskInput: document.querySelector("#task-input"),
  taskList: document.querySelector("#task-list"),
  taskCount: document.querySelector("#task-count"),
  emptyState: document.querySelector("#empty-state"),
  settingsButton: document.querySelector("#settings-button"),
  themeToggle: document.querySelector("#theme-toggle"),
  settingsForm: document.querySelector("#settings-form"),
  settingsDialog: document.querySelector("#settings-dialog"),
  focusMinutes: document.querySelector("#focus-minutes"),
  focusSeconds: document.querySelector("#focus-seconds"),
  shortMinutes: document.querySelector("#short-minutes"),
  shortSeconds: document.querySelector("#short-seconds"),
  longMinutes: document.querySelector("#long-minutes"),
  longSeconds: document.querySelector("#long-seconds"),
  resetSettings: document.querySelector("#reset-settings"),
  pomodoroTotal: document.querySelector("#pomodoro-total"),
  currentYear: document.querySelector("#current-year")
};

const modes = {
  pomodoro: { label: "Hora de focar", duration: 25 * 60 },
  short: { label: "Respire um pouco", duration: 5 * 60 },
  long: { label: "Descanse de verdade", duration: 15 * 60 }
};

let settings = normalizeSettings(readStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS));
let tasks = readStorage(STORAGE_KEYS.tasks, []);
let mode = "pomodoro";
let remaining = modes[mode].duration;
let intervalId = null;
let session = Number(localStorage.getItem(STORAGE_KEYS.session) || 1);
let completedSessions = Number(localStorage.getItem(STORAGE_KEYS.completed) || 0);
let completedCycles = Number(localStorage.getItem(STORAGE_KEYS.cycles) || 0);
let longBreakDue = localStorage.getItem(STORAGE_KEYS.longBreakDue) === "true";
let darkMode = localStorage.getItem(STORAGE_KEYS.darkMode) !== "false";
let audioContext = null;

function readStorage(key, fallback) {
  return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
}

function normalizeSettings(savedSettings) {
  return ["focus", "short", "long"].reduce((normalized, key) => {
    const saved = savedSettings[key];
    normalized[key] = typeof saved === "number"
      ? { minutes: saved, seconds: 0 }
      : {
        minutes: saved?.minutes ?? DEFAULT_SETTINGS[key].minutes,
        seconds: saved?.seconds ?? DEFAULT_SETTINGS[key].seconds
      };
    return normalized;
  }, {});
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatTime(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remainingSeconds = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function updateModeDurations() {
  modes.pomodoro.duration = settings.focus.minutes * 60 + settings.focus.seconds;
  modes.short.duration = settings.short.minutes * 60 + settings.short.seconds;
  modes.long.duration = settings.long.minutes * 60 + settings.long.seconds;
  remaining = modes[mode].duration;
}

function renderTimer() {
  const total = modes[mode].duration;
  const time = formatTime(remaining);

  elements.display.textContent = time;
  elements.display.dateTime = `PT${Math.floor(remaining / 60)}M${remaining % 60}S`;
  elements.label.textContent = modes[mode].label;
  elements.round.textContent = getRoundLabel();
  elements.pomodoroTotal.textContent = completedCycles;
  elements.ring.style.setProperty("--progress", `${((total - remaining) / total) * 360}deg`);
  document.title = `${time} · Foco`;
}

function getRoundLabel() {
  if (mode === "pomodoro") return `Sessão ${session} de 4`;
  if (mode === "short") return `Pausa curta ${((completedSessions - 1) % 3) + 1} de 3`;
  return "Pausa longa 1 de 1";
}

function setTimerButton(isRunning) {
  elements.start.querySelector("span:last-child").textContent = isRunning ? "Pausar" : "Começar";
  elements.start.querySelector(".play-icon").textContent = isRunning ? "Ⅱ" : "▶";
}

function stopTimer() {
  clearInterval(intervalId);
  intervalId = null;
  setTimerButton(false);
}

function setMode(nextMode) {
  stopTimer();
  changeMode(nextMode);
}

function changeMode(nextMode) {
  mode = nextMode;
  remaining = modes[mode].duration;
  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.mode === mode);
  });
  renderTimer();
}

function finishTimer() {
  const finishedMode = mode;
  playCompletionSound();

  if (mode === "pomodoro") {
    completedSessions += 1;
    const isLongBreak = completedSessions % 4 === 0;
    longBreakDue = isLongBreak;
    session = isLongBreak ? 1 : session + 1;
    save(STORAGE_KEYS.completed, completedSessions);
    save(STORAGE_KEYS.session, session);
    localStorage.setItem(STORAGE_KEYS.longBreakDue, longBreakDue);
    changeMode(isLongBreak ? "long" : "short");
  } else if (mode === "long" && longBreakDue) {
    completedCycles += 1;
    longBreakDue = false;
    save(STORAGE_KEYS.cycles, completedCycles);
    localStorage.setItem(STORAGE_KEYS.longBreakDue, "false");
    changeMode("pomodoro");
  } else {
    longBreakDue = false;
    localStorage.setItem(STORAGE_KEYS.longBreakDue, "false");
    changeMode("pomodoro");
  }

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Temporizador concluído!", {
      body: finishedMode === "pomodoro" ? "Hora de fazer uma pausa." : "Hora de focar novamente."
    });
  }
}

function playCompletionSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  audioContext ??= new AudioContext();
  const startTime = audioContext.currentTime;
  [659.25, 783.99, 1046.5].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const time = startTime + index * 0.16;

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.16, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(time);
    oscillator.stop(time + 0.15);
  });
}

function toggleTimer() {
  if (intervalId) {
    stopTimer();
    return;
  }

  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }

  if (audioContext?.state === "suspended") audioContext.resume();
  setTimerButton(true);
  intervalId = setInterval(() => {
    remaining -= 1;

    if (remaining <= 0) {
      remaining = 0;
      finishTimer();
    }

    renderTimer();
  }, 1000);
}

function renderTasks() {
  elements.taskList.replaceChildren();

  tasks.forEach((task, index) => {
    const item = document.createElement("li");
    const checkButton = document.createElement("button");
    const text = document.createElement("span");
    const deleteButton = document.createElement("button");

    item.className = `task-item${task.done ? " completed" : ""}`;
    checkButton.className = "check";
    checkButton.type = "button";
    checkButton.ariaLabel = task.done ? "Desmarcar tarefa" : "Concluir tarefa";
    text.className = "task-text";
    text.textContent = task.text;
    deleteButton.className = "delete-task";
    deleteButton.type = "button";
    deleteButton.ariaLabel = "Excluir tarefa";
    deleteButton.textContent = "×";

    checkButton.addEventListener("click", () => {
      tasks[index].done = !tasks[index].done;
      save(STORAGE_KEYS.tasks, tasks);
      renderTasks();
    });

    deleteButton.addEventListener("click", () => {
      tasks.splice(index, 1);
      save(STORAGE_KEYS.tasks, tasks);
      renderTasks();
    });

    item.append(checkButton, text, deleteButton);
    elements.taskList.appendChild(item);
  });

  const completed = tasks.filter((task) => task.done).length;
  elements.taskCount.textContent = `${completed}/${tasks.length}`;
  elements.emptyState.hidden = tasks.length > 0;
}

function updateSettings() {
  settings = {
    focus: readDuration("focus"),
    short: readDuration("short"),
    long: readDuration("long")
  };
  save(STORAGE_KEYS.settings, settings);
  updateModeDurations();
  setMode(mode);
}

function restoreDefaults() {
  settings = normalizeSettings(DEFAULT_SETTINGS);
  save(STORAGE_KEYS.settings, settings);
  updateModeDurations();
  setDurationFields(settings);
  setMode(mode);
}

function readDuration(name) {
  const minutes = Number(elements[`${name}Minutes`].value);
  const seconds = Number(elements[`${name}Seconds`].value);
  return { minutes, seconds };
}

function setDurationFields(nextSettings) {
  ["focus", "short", "long"].forEach((name) => {
    elements[`${name}Minutes`].value = nextSettings[name].minutes;
    elements[`${name}Seconds`].value = nextSettings[name].seconds;
  });
}

function validateDurations() {
  const names = ["focus", "short", "long"];

  for (const name of names) {
    const minutesInput = elements[`${name}Minutes`];
    const secondsInput = elements[`${name}Seconds`];
    const minutes = minutesInput.value.trim();
    const seconds = secondsInput.value.trim();

    minutesInput.setCustomValidity("");
    secondsInput.setCustomValidity("");

    if (!minutes || !seconds) {
      (minutes ? secondsInput : minutesInput).setCustomValidity("Preencha minutos e segundos.");
      return false;
    }

    if (Number(minutes) === 0 && Number(seconds) === 0) {
      minutesInput.setCustomValidity("Preencha minutos ou segundos: os dois campos não podem ser zero.");
      return false;
    }
  }

  return true;
}

document.querySelectorAll(".duration-inputs input").forEach((input) => {
  input.addEventListener("input", () => {
    const name = input.id.replace(/-(minutes|seconds)$/, "");
    elements[`${name}Minutes`].setCustomValidity("");
    elements[`${name}Seconds`].setCustomValidity("");
  });
});

function applyTheme() {
  document.documentElement.classList.toggle("dark", darkMode);
  elements.themeToggle.setAttribute("aria-pressed", String(darkMode));
  elements.themeToggle.setAttribute("aria-label", darkMode ? "Desligar modo escuro" : "Ligar modo escuro");
  elements.themeToggle.title = darkMode ? "Modo escuro ativado" : "Modo claro ativado";
}

function openSettings() {
  setDurationFields(settings);
  elements.settingsDialog.showModal();
}

elements.start.addEventListener("click", toggleTimer);
elements.reset.addEventListener("click", () => {
  stopTimer();
  remaining = modes[mode].duration;
  renderTimer();
});

document.querySelectorAll(".mode-tab").forEach((tab) => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
});

elements.taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = elements.taskInput.value.trim();

  if (!text) return;

  tasks.push({ text, done: false });
  elements.taskInput.value = "";
  save(STORAGE_KEYS.tasks, tasks);
  renderTasks();
});

elements.settingsButton.addEventListener("click", openSettings);
elements.resetSettings.addEventListener("click", () => {
  restoreDefaults();
});
elements.themeToggle.addEventListener("click", () => {
  darkMode = !darkMode;
  localStorage.setItem(STORAGE_KEYS.darkMode, darkMode);
  applyTheme();
});
elements.settingsForm.addEventListener("submit", (event) => {
  if (event.submitter?.value !== "default") return;

  if (!validateDurations() || !elements.settingsForm.checkValidity()) {
    event.preventDefault();
    elements.settingsForm.reportValidity();
    return;
  }

  updateSettings();
});

updateModeDurations();
applyTheme();
elements.currentYear.textContent = new Date().getFullYear();
renderTimer();
renderTasks();
