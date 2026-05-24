// Path: C:\smart-store\apps\chrome-extension\src\presentation\popup\popup.ts
const outputElement = document.querySelector<HTMLElement>("#output");

if (!outputElement) {
  throw new Error("Popup output element not found.");
}

outputElement.textContent = isExtensionRuntimeAvailable()
  ? "설치됨"
  : "Chrome 확장으로 설치해야 동작합니다.";

function isExtensionRuntimeAvailable(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.runtime?.id === "string"
  );
}
