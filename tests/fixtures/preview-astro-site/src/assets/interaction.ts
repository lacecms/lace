document.querySelector("#note-actions")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const { updateLabel } = await import("./labels");
  if (button instanceof HTMLElement) updateLabel(button);
});
