// "노이즈 문구 제거" DB를 치환 DB와 같은 HTML-표-as-.xls 형식으로 입출력한다.
// 1행은 제목(<td colspan='2'>), 2행은 헤더 라벨, 이후 각 행이
// [노이즈 문구, 대소문자구분안함(Y/N)] 2칸으로 되어 있다.

export type ParsedMangoNoisePhraseRow = {
  phrase: string;
  caseInsensitive: boolean;
};

const HEADER_PHRASE_LABEL = "노이즈 문구";

export function parseMangoNoisePhraseXls(fileText: string): ParsedMangoNoisePhraseRow[] {
  const doc = new DOMParser().parseFromString(fileText, "text/html");
  const rows = Array.from(doc.querySelectorAll("table tr"));
  const parsed: ParsedMangoNoisePhraseRow[] = [];

  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll("td"));
    // 제목 행은 colspan=2 인 셀 하나뿐이라 길이가 2보다 작다.
    if (cells.length < 2) {
      continue;
    }

    const phrase = normalizeCellText(cells[0]);
    if (!phrase || phrase === HEADER_PHRASE_LABEL) {
      continue;
    }

    const flag = normalizeCellText(cells[1]);
    parsed.push({
      phrase,
      caseInsensitive: flag.toUpperCase() === "Y",
    });
  }

  return parsed;
}

function normalizeCellText(cell: Element): string {
  return (cell.textContent ?? "").replace(/\s+/g, " ").trim();
}

export type MangoNoisePhraseRowForExport = {
  phrase: string;
  caseInsensitive: boolean;
};

const TITLE_ROW_HTML =
  "<tr><td colspan='2' style='height:35px;font-size:13pt'><b>노이즈 문구 제거 조건</b></td></tr>";
const HEADER_ROW_HTML =
  "<tr>" +
  "<td align='center' bgcolor='#FFFF00' style='font-weight:bold;height:30px'>노이즈 문구</td>" +
  "<td align='center' bgcolor='#FFFF00' style='font-weight:bold;height:30px'>대소문자구분안함</td>" +
  "</tr>";

export function buildMangoNoisePhraseXls(rules: MangoNoisePhraseRowForExport[]): string {
  const dataRowsHtml = rules
    .map(
      (rule) =>
        "<tr>" +
        `<td style='mso-number-format:"\\@";' bgcolor='#ffffff'>${escapeCellHtml(rule.phrase)}</td>` +
        `<td style='mso-number-format:"\\@";' bgcolor='#ffffff'>${rule.caseInsensitive ? "Y" : "N"}</td>` +
        "</tr>",
    )
    .join("");

  return [
    "<head>",
    '<meta http-equiv="Content-Type" content="application/vnd.ms-excel;charset=utf-8">',
    "</head>",
    "<style>",
    "TD {font-size:12px; color: #2D2D2D;}",
    "</style>",
    "",
    "<table border='1'>",
    TITLE_ROW_HTML + HEADER_ROW_HTML + dataRowsHtml,
    "</table>",
  ].join("\n");
}

function escapeCellHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/ /g, "&nbsp;");
}
