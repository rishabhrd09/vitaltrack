const header = document.querySelector(".site-header");
const menu = document.querySelector(".menu-toggle");
const nav = document.querySelector("#site-nav");
function closeMenu() {
  header.classList.remove("menu-open");
  menu.setAttribute("aria-expanded", "false");
  menu.setAttribute("aria-label", "Open navigation");
}
menu.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  header.classList.toggle("menu-open", open);
  menu.setAttribute("aria-expanded", String(open));
  menu.setAttribute(
    "aria-label",
    open ? "Close navigation" : "Open navigation",
  );
});
nav.addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menu.getAttribute("aria-expanded") === "true") {
    closeMenu();
    menu.focus();
  }
});
document.querySelectorAll("[data-appearance]").forEach((button) =>
  button.addEventListener("click", () => {
    const appearance = button.dataset.appearance;
    document.querySelector("#overview-image").src =
      `/assets/app-overview-${appearance}.jpg`;
    document.querySelector("#appearance-caption").textContent =
      `${appearance === "dark" ? "Dark" : "Light"} appearance`;
    document
      .querySelectorAll("[data-appearance]")
      .forEach((control) =>
        control.setAttribute("aria-pressed", String(control === button)),
      );
  }),
);
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  tabs.forEach((button) => {
    const selected = button === tab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    document.getElementById(button.getAttribute("aria-controls")).hidden =
      !selected;
  });
}
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    let next;
    if (["ArrowDown", "ArrowRight"].includes(event.key))
      next = (index + 1) % tabs.length;
    else if (["ArrowUp", "ArrowLeft"].includes(event.key))
      next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      selectTab(tabs[next]);
      tabs[next].focus();
    }
  });
});
const dialog = document.querySelector("#screenshot-dialog");
let screenshotTrigger;
document.querySelectorAll("[data-enlarge]").forEach((button) =>
  button.addEventListener("click", () => {
    const source = document.getElementById(button.dataset.enlarge);
    const image = document.querySelector("#dialog-image");
    image.src = source.src;
    image.alt = source.alt;
    screenshotTrigger = button;
    dialog.showModal();
  }),
);
document
  .querySelector("#close-screenshot")
  .addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => screenshotTrigger?.focus());
dialog.addEventListener("click", (event) => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    dialog.close();
});
