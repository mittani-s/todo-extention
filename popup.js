const STORAGE_KEY = "todos";
const MAX_LENGTH = 200;
const UNDO_MS = 5000;
const CHECK_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.2 8.3 6.4 11.2 12.8 4.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const input = document.querySelector("#new-todo");
const form = document.querySelector("#composer");
const list = document.querySelector("#list");
const count = document.querySelector("#count");
const clearButton = document.querySelector("#clear");
const undoBar = document.querySelector("#undo");
const undoText = document.querySelector("#undo-text");
const undoButton = document.querySelector("#undo-btn");
const filterButtons = [...document.querySelectorAll(".filters button")];

const state = {
  todos: [],
  filter: "active",
};

let undoTimer = 0;
let undoSnapshot = null;
let lastCompositionEnd = 0;
let suppressSubmitUntil = 0;

function hasChromeStorage() {
  return typeof chrome !== "undefined" && !!chrome.storage?.local;
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneTodos(todos) {
  return todos.map((todo) => ({ ...todo }));
}

function sanitize(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((todo) => todo && typeof todo.id === "string" && typeof todo.text === "string")
    .map((todo) => ({
      id: todo.id,
      text: todo.text.trim().slice(0, MAX_LENGTH),
      done: Boolean(todo.done),
      createdAt: typeof todo.createdAt === "number" ? todo.createdAt : Date.now(),
    }))
    .filter((todo) => todo.text);
}

function remaining() {
  return state.todos.filter((todo) => !todo.done).length;
}

function visibleTodos() {
  if (state.filter === "done") return state.todos.filter((todo) => todo.done);
  if (state.filter === "active") return state.todos.filter((todo) => !todo.done);
  return state.todos;
}

async function load() {
  try {
    if (hasChromeStorage()) {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      state.todos = sanitize(data[STORAGE_KEY]);
    } else {
      state.todos = sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
    }
  } catch {
    state.todos = [];
  }
  render();
  input.focus();
}

async function save() {
  const payload = cloneTodos(state.todos);
  try {
    if (hasChromeStorage()) {
      await chrome.storage.local.set({ [STORAGE_KEY]: payload });
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    count.textContent = "保存できない";
  }
}

function pushUndo(message, snapshot) {
  undoSnapshot = snapshot;
  undoText.textContent = message;
  undoBar.hidden = false;
  window.clearTimeout(undoTimer);
  undoTimer = window.setTimeout(dismissUndo, UNDO_MS);
}

function dismissUndo() {
  undoSnapshot = null;
  undoBar.hidden = true;
}

function restoreUndo() {
  if (!undoSnapshot) return;
  const current = new Map(state.todos.map((todo) => [todo.id, todo]));
  const restored = undoSnapshot.map((todo) => {
    const latest = current.get(todo.id);
    current.delete(todo.id);
    return latest ?? todo;
  });
  state.todos = [...restored, ...current.values()];
  dismissUndo();
  save();
  render();
  input.focus();
}

function addLines(lines) {
  const cleaned = lines.map((line) => line.trim().slice(0, MAX_LENGTH)).filter(Boolean);
  if (!cleaned.length) return false;
  if (state.filter === "done") state.filter = "active";
  const now = Date.now();
  for (const text of cleaned) {
    state.todos.push({ id: uid(), text, done: false, createdAt: now });
  }
  return true;
}

function addFromInput() {
  if (!addLines(input.value.split(/\r\n|[\r\n]/))) {
    input.value = "";
    return;
  }
  input.value = "";
  save();
  render({ scroll: "end" });
  input.focus();
}

function toggle(id) {
  const todo = state.todos.find((item) => item.id === id);
  if (!todo) return;
  todo.done = !todo.done;
  save();
  render();
}

function remove(id) {
  const snapshot = cloneTodos(state.todos);
  const todo = state.todos.find((item) => item.id === id);
  if (!todo) return;
  state.todos = state.todos.filter((item) => item.id !== id);
  save();
  pushUndo(`「${todo.text}」を削除した`, snapshot);
  render();
}

function clearDone() {
  if (!state.todos.some((todo) => todo.done)) return;
  const snapshot = cloneTodos(state.todos);
  const removed = snapshot.length - snapshot.filter((todo) => !todo.done).length;
  state.todos = state.todos.filter((todo) => !todo.done);
  save();
  pushUndo(`完了 ${removed}件を消した`, snapshot);
  render();
}

function updateText(id, text) {
  const todo = state.todos.find((item) => item.id === id);
  if (!todo) return;
  const next = text.trim().slice(0, MAX_LENGTH);
  if (!next || next === todo.text) return;
  todo.text = next;
  save();
}

function emptyMessage() {
  if (state.todos.length === 0) return "まだない。上に書いて Enter。";
  if (state.filter === "active") return "残っていることはない。";
  if (state.filter === "done") return "完了したものはまだない。";
  return "まだない。";
}

function countLabel() {
  const left = remaining();
  const done = state.todos.length - left;
  if (state.todos.length === 0) return "残り 0";
  if (state.filter === "done") return `完了 ${done}`;
  if (state.filter === "all") return `${state.todos.length}件`;
  return left === 0 ? "残っていない" : `残り ${left}`;
}

function renderItem(todo) {
  const li = document.createElement("li");
  li.className = todo.done ? "item is-done" : "item";
  li.dataset.id = todo.id;

  const check = document.createElement("button");
  check.type = "button";
  check.className = "check";
  check.setAttribute("role", "checkbox");
  check.setAttribute("aria-checked", String(todo.done));
  check.setAttribute("aria-label", todo.done ? `「${todo.text}」を未完了に戻す` : `「${todo.text}」を完了にする`);
  check.innerHTML = CHECK_SVG;

  const text = document.createElement("button");
  text.type = "button";
  text.className = "text";
  text.textContent = todo.text;
  text.title = todo.text;

  const del = document.createElement("button");
  del.type = "button";
  del.className = "delete";
  del.setAttribute("aria-label", `「${todo.text}」を削除`);
  del.textContent = "×";

  li.append(check, text, del);
  return li;
}

function render(options = {}) {
  const active = document.activeElement;
  const focusId = active?.closest?.(".item")?.dataset.id;
  const focusKind = active?.classList?.contains("check")
    ? "check"
    : active?.classList?.contains("delete")
      ? "delete"
      : null;

  const items = visibleTodos();
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = emptyMessage();
    list.append(empty);
  } else {
    for (const todo of items) list.append(renderItem(todo));
  }

  count.textContent = countLabel();
  const doneCount = state.todos.length - remaining();
  clearButton.hidden = doneCount === 0;
  for (const button of filterButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.filter === state.filter));
  }

  if (options.scroll === "end") list.scrollTop = list.scrollHeight;

  if (focusId && focusKind && items.some((todo) => todo.id === focusId)) {
    list.querySelector(`.item[data-id="${CSS.escape(focusId)}"] .${focusKind}`)?.focus();
  }
}

function startEdit(item, id) {
  const todo = state.todos.find((entry) => entry.id === id);
  const textButton = item.querySelector(".text");
  if (!todo || !textButton) return;

  const editor = document.createElement("input");
  editor.type = "text";
  editor.className = "edit";
  editor.value = todo.text;
  editor.maxLength = MAX_LENGTH;
  editor.setAttribute("aria-label", "やることの編集");
  textButton.replaceWith(editor);
  editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);

  let closed = false;
  const close = (commit) => {
    if (closed) return;
    closed = true;
    if (commit) updateText(id, editor.value);
    const updated = renderItem(todo);
    editor.replaceWith(updated.querySelector(".text"));
    for (const selector of [".check", ".delete"]) {
      item.querySelector(selector).setAttribute(
        "aria-label",
        updated.querySelector(selector).getAttribute("aria-label"),
      );
    }
  };

  editor.addEventListener("compositionend", () => {
    lastCompositionEnd = Date.now();
  });
  editor.addEventListener("blur", () => close(true));
  editor.addEventListener("keydown", (event) => {
    if (enterIsComposing(event)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      close(true);
      item.querySelector(".text").focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(false);
      item.querySelector(".text").focus();
    }
  });
}

input.addEventListener("compositionend", () => {
  lastCompositionEnd = Date.now();
});

function enterIsComposing(event) {
  return event.isComposing || event.keyCode === 229 || Date.now() - lastCompositionEnd < 80;
}

input.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  // Confirming an IME conversion also produces Enter. Ignore that one.
  if (enterIsComposing(event)) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  suppressSubmitUntil = Date.now() + 50;
  addFromInput();
});

input.addEventListener("paste", (event) => {
  const text = event.clipboardData?.getData("text") ?? "";
  if (!/[\r\n]/.test(text)) return;
  event.preventDefault();
  if (!addLines(text.split(/\r\n|[\r\n]/))) return;
  input.value = "";
  save();
  render({ scroll: "end" });
  input.focus();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (Date.now() < suppressSubmitUntil) return;
  if (document.activeElement === input && Date.now() - lastCompositionEnd < 80) return;
  addFromInput();
});

list.addEventListener("click", (event) => {
  const item = event.target.closest(".item");
  if (!item) return;
  const id = item.dataset.id;
  if (event.target.closest(".check")) toggle(id);
  else if (event.target.closest(".delete")) remove(id);
  else if (event.target.closest(".text")) startEdit(item, id);
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    render();
  });
});

clearButton.addEventListener("click", clearDone);
undoButton.addEventListener("click", restoreUndo);

load();
