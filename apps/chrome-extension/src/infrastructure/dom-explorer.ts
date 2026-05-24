// Path: C:\smart-store\apps\chrome-extension\src\infrastructure\dom-explorer.ts
import type {
  SelectorCandidate,
  SelectorCandidateInspection,
  SelectorMatchSample,
} from "../application/index.js";

const SAMPLE_LIMIT = 3;

export class DomExplorer {
  public constructor(private readonly documentRef: Document) {}

  public inspectCandidate(
    candidate: SelectorCandidate,
    root: ParentNode = this.documentRef,
  ): SelectorCandidateInspection {
    const elements = this.findElements(candidate, root);

    return {
      candidate,
      matchedCount: elements.length,
      samples: elements.slice(0, SAMPLE_LIMIT).map((element) => this.toSample(element)),
    };
  }

  public queryCandidate(
    candidate: SelectorCandidate,
    root: ParentNode = this.documentRef,
  ): Element[] {
    return this.findElements(candidate, root);
  }

  public findRowCandidates(): Element[] {
    const seen = new Set<Element>();
    const candidates = [
      ...Array.from(this.documentRef.querySelectorAll("[role='row']")),
      ...Array.from(this.documentRef.querySelectorAll("table tbody tr")),
      ...Array.from(this.documentRef.querySelectorAll("tbody tr")),
      ...Array.from(this.documentRef.querySelectorAll("[class*='row']")),
    ];

    return candidates.filter((element) => {
      if (seen.has(element)) {
        return false;
      }

      seen.add(element);
      return true;
    });
  }

  private findElements(
    candidate: SelectorCandidate,
    root: ParentNode = this.documentRef,
  ): Element[] {
    switch (candidate.strategy) {
      case "css":
        return this.queryCss(candidate.value, root);
      case "aria":
        return this.queryByAria(candidate.value, root);
      case "data":
        return this.queryByData(candidate.value, root);
      case "name":
        return this.queryByName(candidate.value, root);
      case "text":
        return this.queryByText(candidate.value, root);
      case "todo":
        return [];
    }
  }

  private queryCss(selector: string, root: ParentNode): Element[] {
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  private queryByAria(value: string, root: ParentNode): Element[] {
    const normalized = normalize(value);
    const elements = root.querySelectorAll(
      "button, a, input, select, textarea, label, summary, [role], [aria-label], [aria-labelledby]",
    );

    return Array.from(elements).filter((element) => {
      const ariaLabel = normalize(element.getAttribute("aria-label"));
      const labelledBy = normalize(this.resolveLabelledByText(element));
      const role = normalize(element.getAttribute("role"));
      return (
        ariaLabel.includes(normalized) ||
        labelledBy.includes(normalized) ||
        role.includes(normalized)
      );
    });
  }

  private queryByData(value: string, root: ParentNode): Element[] {
    const normalized = normalize(value);
    const elements = root.querySelectorAll("*");

    return Array.from(elements).filter((element) => {
      const entries = Object.entries((element as HTMLElement).dataset ?? {});
      return entries.some(([key, dataValue]) => {
        return (
          normalize(key).includes(normalized) ||
          normalize(dataValue).includes(normalized)
        );
      });
    });
  }

  private queryByName(value: string, root: ParentNode): Element[] {
    const normalized = normalize(value);
    const elements = root.querySelectorAll("[name], [id]");

    return Array.from(elements).filter((element) => {
      return (
        normalize(element.getAttribute("name")).includes(normalized) ||
        normalize(element.getAttribute("id")).includes(normalized)
      );
    });
  }

  private queryByText(value: string, root: ParentNode): Element[] {
    const normalized = normalize(value);
    const elements = root.querySelectorAll(
      "button, a, label, summary, section, article, div, span, h1, h2, h3, h4, h5",
    );

    return Array.from(elements).filter((element) => {
      const text = normalize(element.textContent);
      return text.includes(normalized);
    });
  }

  private toSample(element: Element): SelectorMatchSample {
    const htmlElement = element as HTMLElement;

    return {
      tagName: element.tagName.toLowerCase(),
      role: element.getAttribute("role") ?? undefined,
      id: htmlElement.id || undefined,
      name: element.getAttribute("name") ?? undefined,
      ariaLabel: element.getAttribute("aria-label") ?? undefined,
      dataAttributes: Object.keys(htmlElement.dataset ?? {}),
      textSnippet: normalize(htmlElement.innerText || htmlElement.textContent).slice(0, 120),
      domPath: buildDomPath(element),
    };
  }

  private resolveLabelledByText(element: Element): string {
    const ids = (element.getAttribute("aria-labelledby") ?? "")
      .split(/\s+/)
      .map((id) => id.trim())
      .filter(Boolean);

    return ids
      .map((id) => this.documentRef.getElementById(id)?.textContent ?? "")
      .join(" ");
  }
}

function buildDomPath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && segments.length < 5) {
    const tag = current.tagName.toLowerCase();
    const id = current.getAttribute("id");
    const className = (current.getAttribute("class") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join(".");
    const segment = [
      tag,
      id ? `#${id}` : "",
      className ? `.${className}` : "",
    ].join("");
    segments.unshift(segment);
    current = current.parentElement;
  }

  return segments.join(" > ");
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}
