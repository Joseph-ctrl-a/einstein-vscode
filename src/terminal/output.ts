import { C } from "../colors";
import { Format } from "../utils";

export function createOutput(emit: (text: string) => void) {
  const write = (text: string) => emit(text);
  const writeLine = (text: string) => emit(text + "\r\n");

  return {
    write,
    writeLine,

    prompt() {
      write(`${C.bold}${C.cyan}einstein>${C.reset} `);
    },

    repromptWithLine(line: string) {
      write(`${C.bold}${C.cyan}einstein>${C.reset} ${line}`);
    },

    banner() {
      write("\x1b[2J\x1b[H");
      writeLine(
        `${C.bold}${C.cyan}⚡ Einstein${C.reset}  ${C.dim}DCU Assignment Submission Tool${C.reset}`
      );
      writeLine(
        `${C.dim}Type ${C.reset}${C.bold}help${C.reset}${C.dim} for usage.${C.reset}`
      );
      write("\r\n");
    },

    help() {
      [
        "",
        `${C.bold}Usage:${C.reset}`,
        `  ${C.cyan}einstein <file>${C.reset}          Submit a file  ${C.dim}(e.g. einstein task1.py)${C.reset}`,
        `  ${C.cyan}einstein${C.reset}                 Submit the currently open file`,
        `  ${C.cyan}set module <code>${C.reset}        Set your module  ${C.dim}(e.g. set module ca116)${C.reset}`,
        `  ${C.cyan}set credentials${C.reset}          Update your DCU username/password`,
        `  ${C.cyan}clear${C.reset}                    Clear the terminal`,
        `  ${C.cyan}help${C.reset}                     Show this message`,
        "",
      ].forEach((l) => writeLine(l));
    },

    clear() {
      write("\x1b[2J\x1b[H");
    },

    divider() {
      writeLine(`${C.dim}${"─".repeat(48)}${C.reset}`);
    },

    submissionHeader(fileName: string, module: string) {
      write("\r\n");
      writeLine(`${C.dim}${"─".repeat(48)}${C.reset}`);
      writeLine(
        `${C.bold}einstein ${fileName}${C.reset}  ${
          C.dim
        }(${module.toUpperCase()})${C.reset}`
      );
      writeLine(`${C.dim}Uploading…${C.reset}`);
    },

    testResults(
      results: { name: string; passed: boolean }[],
      passCount: number,
      failCount: number
    ) {
      write("\r\n");
      if (results.length === 0) return;

      const nameWidth = Math.max(...results.map((t) => t.name.length), 24);
      results
        .map((t) => Format.testResult(t, nameWidth))
        .forEach((l) => writeLine(l));
      write("\r\n");
      writeLine(Format.summary(passCount, failCount, results.length));
    },

    rawOutput(lines: string[]) {
      writeLine(
        `${C.yellow}No test results found in server response.${C.reset}`
      );
      write("\r\n");
      writeLine(`${C.dim}Raw output:${C.reset}`);
      lines.slice(0, 20).forEach((l) => writeLine(`  ${C.dim}${l}${C.reset}`));
    },

    reportUrl(url: string) {
      writeLine(`${C.cyan}${url}${C.reset}`);
    },

    info(text: string) {
      writeLine(`${C.dim}${text}${C.reset}`);
    },
    success(text: string) {
      writeLine(`${C.green}${text}${C.reset}`);
    },
    warn(text: string) {
      writeLine(`${C.yellow}${text}${C.reset}`);
    },
    error(text: string) {
      writeLine(`${C.red}${text}${C.reset}`);
    },

    fileList(names: string[]) {
      write("\r\n");
      Format.columns(names).forEach((row) => writeLine(row));
    },
  };
}

export type Output = ReturnType<typeof createOutput>;
