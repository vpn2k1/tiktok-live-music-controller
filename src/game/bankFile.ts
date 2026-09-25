/**
 * Question/word bank files. Banks are stored as "a | b | c" lines; streamers can
 * also bring CSV / TSV exported from Excel or Google Sheets. Lines starting with
 * "#" are comments (the sample files use them for instructions).
 */

/** Splits one CSV line (comma or semicolon, "quoted, fields" and "" escapes). */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (char === delimiter) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  // Spreadsheets pad short rows with empty cells.
  while (cells.length > 1 && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function csvDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 20).join('\n');
  return (sample.match(/;/g)?.length ?? 0) > (sample.match(/,/g)?.length ?? 0) ? ';' : ',';
}

/**
 * Converts an imported file to bank text: ".csv" rows (comma or semicolon) and
 * tab-separated rows (paste from a spreadsheet, ".tsv") become "a | b | c";
 * "|" lines stay as they are; comments and blank lines are dropped.
 */
export function bankFileToText(content: string, fileName = ''): string {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const isCsv = /\.csv$/i.test(fileName);
  const delimiter = csvDelimiter(lines);
  return lines
    .map((line) => {
      const cells = isCsv ? splitCsvLine(line, delimiter) : line.includes('\t') ? splitCsvLine(line, '\t') : null;
      // "|" separates bank fields, so a "|" inside a cell becomes "/".
      return cells ? cells.map((cell) => cell.replace(/\|/g, '/')).join(' | ') : line;
    })
    .join('\n');
}

export interface BankReport {
  /** Lines the game can use. */
  valid: number;
  /** 1-based line numbers (in the bank text) the game skips. */
  invalid: number[];
}

/** Checks every non-empty line of a bank with the game's own line parser. */
export function checkBankLines(text: string, isValid: (line: string) => boolean): BankReport {
  const report: BankReport = { valid: 0, invalid: [] };
  text.split('\n').forEach((line, index) => {
    if (!line.trim()) return;
    if (isValid(line)) report.valid += 1;
    else report.invalid.push(index + 1);
  });
  return report;
}
