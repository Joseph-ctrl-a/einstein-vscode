import * as vscode from 'vscode';
import * as path from 'path';
import { CredentialManager } from './credentialManager';
import { checkAuth, submitFile, AuthError, NetworkError } from './einsteinClient';

const C = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    dim:    '\x1b[2m',
    green:  '\x1b[32m',
    red:    '\x1b[31m',
    yellow: '\x1b[33m',
    cyan:   '\x1b[36m',
    blue:   '\x1b[34m',
    white:  '\x1b[97m',
};

export class EinsteinPty implements vscode.Pseudoterminal {
    private writeEmitter = new vscode.EventEmitter<string>();
    onDidWrite = this.writeEmitter.event;

    private line = '';
    private busy = false;
    private lastTabPartial = ''; // tracks what was typed when Tab was last pressed

    constructor(private readonly credentials: CredentialManager) {}

    open(): void {
        this.printBanner();
        this.prompt();
    }

    close(): void {}

    handleInput(data: string): void {
        if (this.busy) { return; }

        if (data === '\t') {
            // Reset last tab partial on any non-tab keypress (handled below for others)
            this.busy = true;
            this.handleTab().finally(() => { this.busy = false; });
            return;
        }

        // Any key other than Tab resets the double-tab state
        this.lastTabPartial = '';

        if (data === '\r') {
            this.write('\r\n');
            const cmd = this.line.trim();
            this.line = '';
            if (cmd) {
                this.run(cmd);
            } else {
                this.prompt();
            }
        } else if (data === '\x7f') {
            // Backspace
            if (this.line.length > 0) {
                this.line = this.line.slice(0, -1);
                this.write('\b \b');
            }
        } else if (data === '\x03') {
            // Ctrl+C
            this.line = '';
            this.write('^C\r\n');
            this.prompt();
        } else if (data >= ' ') {
            // Printable character — echo and append
            this.line += data;
            this.write(data);
        }
    }

    private async handleTab(): Promise<void> {
        const parts = this.line.trimStart().split(/\s+/);
        // Only complete when the user is typing a filename argument
        const isEinsteinCmd = parts[0]?.toLowerCase() === 'einstein' && parts.length >= 2;
        const isBlankArg   = parts[0]?.toLowerCase() === 'einstein' && parts.length === 1;

        if (isBlankArg) {
            // `einstein [TAB]` — show all submittable files
            const files = await vscode.workspace.findFiles(
                '**/*.{py,c,h,java,js,ts,cpp,cs,rb,sh}',
                '**/node_modules/**',
                50
            );
            if (files.length === 0) { this.write('\x07'); return; }
            const names = [...new Set(files.map(f => path.basename(f.fsPath)))].sort();
            this.write('\r\n');
            this.writeColumns(names);
            this.reprompWithLine();
            return;
        }

        if (!isEinsteinCmd) {
            this.write('\x07'); // bell — nothing to complete
            return;
        }

        const partial = parts[parts.length - 1];

        const files = await vscode.workspace.findFiles(
            `**/${partial}*`,
            '**/node_modules/**',
            50
        );

        if (files.length === 0) {
            this.write('\x07'); // bell — no matches
            return;
        }

        const names = [...new Set(files.map(f => path.basename(f.fsPath)))].sort();

        if (names.length === 1) {
            // Unique match — complete fully
            const completion = names[0].slice(partial.length);
            this.line += completion;
            this.write(completion);
            this.lastTabPartial = '';
            return;
        }

        const lcp = longestCommonPrefix(names);

        if (lcp.length > partial.length) {
            // Can extend to the shared prefix
            const completion = lcp.slice(partial.length);
            this.line += completion;
            this.write(completion);
            this.lastTabPartial = lcp;
            return;
        }

        // Already at longest common prefix — show all options (bash-style)
        // If the user presses Tab again on the same partial, show immediately;
        // first Tab just rings the bell as a hint there are multiple options.
        if (this.lastTabPartial !== partial) {
            this.lastTabPartial = partial;
            this.write('\x07'); // bell on first Tab
            return;
        }

        // Second Tab on same partial — list all matches
        this.write('\r\n');
        this.writeColumns(names);
        this.reprompWithLine();
    }

    private async run(cmd: string): Promise<void> {
        this.busy = true;
        try {
            await this.dispatch(cmd);
        } catch (e) {
            this.writeLine(`${C.red}Unexpected error: ${e instanceof Error ? e.message : String(e)}${C.reset}`);
        } finally {
            this.busy = false;
            this.prompt();
        }
    }

    private async dispatch(cmd: string): Promise<void> {
        const parts = cmd.trim().split(/\s+/);
        const verb = parts[0].toLowerCase();

        if (verb === 'einstein') {
            await this.handleSubmit(parts.slice(1).join(' ').trim());
        } else if (verb === 'help') {
            this.printHelp();
        } else if (verb === 'clear') {
            this.write('\x1b[2J\x1b[H');
        } else if (verb === 'set' && parts[1]?.toLowerCase() === 'module') {
            await this.handleSetModule(parts.slice(2).join('').trim());
        } else if (verb === 'set' && parts[1]?.toLowerCase() === 'credentials') {
            await this.handleSetCredentials();
        } else {
            this.writeLine(`${C.yellow}Unknown command "${verb}". Type ${C.bold}help${C.reset}${C.yellow} for usage.${C.reset}`);
        }
    }

    private async handleSubmit(filename: string): Promise<void> {
        // Resolve which file to submit
        const filePath = await this.resolveFile(filename);
        if (!filePath) { return; }

        // Resolve module code
        const module = await this.resolveModule();
        if (!module) { return; }

        // Resolve credentials
        const creds = await this.resolveCredentials();
        if (!creds) { return; }

        const fileName = path.basename(filePath);

        this.write('\r\n');
        this.writeLine(`${C.dim}${'─'.repeat(48)}${C.reset}`);
        this.writeLine(`${C.bold}einstein ${fileName}${C.reset}  ${C.dim}(${module.toUpperCase()})${C.reset}`);
        this.writeLine(`${C.dim}Uploading…${C.reset}`);

        try {
            const task = path.basename(filePath, path.extname(filePath));
            const result = await submitFile(filePath, module, task, creds.username, creds.password);

            this.write('\r\n');

            const { testResults, passCount, failCount, reportUrl } = result;
            const total = testResults.length;

            if (total === 0) {
                this.writeLine(`${C.yellow}No test results found in server response.${C.reset}`);
                this.write('\r\n');
                this.writeLine(`${C.dim}Raw output:${C.reset}`);
                for (const line of result.rawOutput.split('\n').slice(0, 20)) {
                    this.writeLine(`  ${C.dim}${line}${C.reset}`);
                }
            } else {
                const nameWidth = Math.max(...testResults.map(t => t.name.length), 24);
                for (const t of testResults) {
                    const padded = t.name.padEnd(nameWidth);
                    if (t.passed) {
                        this.writeLine(`  ${C.green}✓${C.reset}  ${padded}  ${C.green}passed${C.reset}`);
                    } else {
                        this.writeLine(`  ${C.red}✗${C.reset}  ${padded}  ${C.red}failed${C.reset}`);
                    }
                }

                this.write('\r\n');
                if (failCount === 0) {
                    this.writeLine(`${C.bold}${C.green}All ${total} tests passed ✓${C.reset}`);
                } else {
                    this.writeLine(`${C.bold}${passCount}/${total} tests passed${C.reset}  ${C.dim}(${failCount} failed)${C.reset}`);
                }
            }

            this.write('\r\n');
            this.writeLine(`${C.cyan}${reportUrl}${C.reset}`);
            this.writeLine(`${C.dim}${'─'.repeat(48)}${C.reset}`);

        } catch (e) {
            if (e instanceof AuthError) {
                this.writeLine(`${C.red}Authentication failed. Run: ${C.bold}set credentials${C.reset}`);
            } else if (e instanceof NetworkError) {
                this.writeLine(`${C.red}Network error: ${(e as Error).message}${C.reset}`);
            } else {
                this.writeLine(`${C.red}Error: ${e instanceof Error ? e.message : String(e)}${C.reset}`);
            }
        }
    }

    private async resolveFile(filename: string): Promise<string | undefined> {
        if (!filename) {
            // No filename given — try the active editor
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.uri.scheme === 'file') {
                return editor.document.uri.fsPath;
            }
            this.writeLine(`${C.yellow}Usage: ${C.bold}einstein <filename>${C.reset}`);
            return undefined;
        }

        // If absolute path, use directly
        if (path.isAbsolute(filename)) {
            return filename;
        }

        // Search workspace for the file
        const matches = await vscode.workspace.findFiles(`**/${filename}`, '**/node_modules/**', 10);

        if (matches.length === 0) {
            this.writeLine(`${C.red}File not found: ${filename}${C.reset}`);
            return undefined;
        }

        if (matches.length === 1) {
            return matches[0].fsPath;
        }

        // Multiple matches — let user pick via QuickPick
        const items = matches.map(u => ({
            label: path.basename(u.fsPath),
            description: vscode.workspace.asRelativePath(u.fsPath),
            fsPath: u.fsPath
        }));

        const picked = await vscode.window.showQuickPick(items, {
            title: `Multiple files named "${filename}" found — pick one`,
            placeHolder: 'Select file to submit'
        });

        return picked?.fsPath;
    }

    private async resolveModule(): Promise<string | undefined> {
        const config = vscode.workspace.getConfiguration('einstein');
        const saved: string = config.get('defaultModule', '');
        if (saved.trim()) {
            return saved.trim().toLowerCase();
        }

        // Ask via QuickPick so it floats above the terminal nicely
        const input = await vscode.window.showInputBox({
            title: 'Einstein — Module Code',
            prompt: 'Enter your module code (e.g. ca116, csc1035)',
            ignoreFocusOut: true,
            validateInput: v => v.trim() ? undefined : 'Module code cannot be empty'
        });

        if (!input?.trim()) { return undefined; }
        const module = input.trim().toLowerCase();

        await config.update('defaultModule', module, vscode.ConfigurationTarget.Workspace);
        this.writeLine(`${C.dim}Module set to ${module.toUpperCase()} (saved for this workspace)${C.reset}`);

        return module;
    }

    private async resolveCredentials(): Promise<{ username: string; password: string } | undefined> {
        const existing = await this.credentials.get();
        if (existing) { return existing; }

        this.writeLine(`${C.yellow}No credentials saved. Opening prompt…${C.reset}`);
        const creds = await this.credentials.promptAndStore();
        if (!creds) {
            this.writeLine(`${C.red}Credentials required to submit.${C.reset}`);
            return undefined;
        }
        return creds;
    }

    private async handleSetModule(module: string): Promise<void> {
        let code = module.toLowerCase();
        if (!code) {
            const input = await vscode.window.showInputBox({
                title: 'Einstein — Module Code',
                prompt: 'Enter your module code (e.g. ca116, csc1035)',
                ignoreFocusOut: true
            });
            if (!input?.trim()) { return; }
            code = input.trim().toLowerCase();
        }
        const config = vscode.workspace.getConfiguration('einstein');
        await config.update('defaultModule', code, vscode.ConfigurationTarget.Workspace);
        this.writeLine(`${C.green}Module set to ${code.toUpperCase()}${C.reset}`);
    }

    private async handleSetCredentials(): Promise<void> {
        this.writeLine(`${C.dim}Opening credential prompt…${C.reset}`);
        const creds = await this.credentials.promptAndStore();
        if (!creds) { return; }

        this.writeLine(`${C.dim}Verifying…${C.reset}`);
        try {
            await checkAuth(creds.username, creds.password);
            this.writeLine(`${C.green}Credentials saved and verified ✓${C.reset}`);
        } catch {
            this.writeLine(`${C.yellow}Credentials saved (could not reach server to verify).${C.reset}`);
        }
    }

    private printBanner(): void {
        this.write('\x1b[2J\x1b[H'); // clear screen
        this.writeLine(`${C.bold}${C.cyan}⚡ Einstein${C.reset}  ${C.dim}DCU Assignment Submission Tool${C.reset}`);
        this.writeLine(`${C.dim}Type ${C.reset}${C.bold}help${C.reset}${C.dim} for usage.${C.reset}`);
        this.write('\r\n');
    }

    private printHelp(): void {
        this.write('\r\n');
        this.writeLine(`${C.bold}Usage:${C.reset}`);
        this.writeLine(`  ${C.cyan}einstein <file>${C.reset}          Submit a file  ${C.dim}(e.g. einstein task1.py)${C.reset}`);
        this.writeLine(`  ${C.cyan}einstein${C.reset}                 Submit the currently open file`);
        this.writeLine(`  ${C.cyan}set module <code>${C.reset}        Set your module  ${C.dim}(e.g. set module ca116)${C.reset}`);
        this.writeLine(`  ${C.cyan}set credentials${C.reset}          Update your DCU username/password`);
        this.writeLine(`  ${C.cyan}clear${C.reset}                    Clear the terminal`);
        this.writeLine(`  ${C.cyan}help${C.reset}                     Show this message`);
        this.write('\r\n');
    }

    private reprompWithLine(): void {
        this.write(`${C.bold}${C.cyan}einstein>${C.reset} ${this.line}`);
    }

    private writeColumns(names: string[]): void {
        const col = Math.max(...names.map(n => n.length)) + 2;
        const termWidth = 80;
        const perRow = Math.max(1, Math.floor(termWidth / col));
        for (let i = 0; i < names.length; i += perRow) {
            const row = names.slice(i, i + perRow).map(n => n.padEnd(col)).join('');
            this.writeLine(row);
        }
        this.write('\r\n');
    }

    private prompt(): void {
        this.write(`${C.bold}${C.cyan}einstein>${C.reset} `);
    }

    private writeLine(text: string): void {
        this.writeEmitter.fire(text + '\r\n');
    }

    private write(text: string): void {
        this.writeEmitter.fire(text);
    }
}

function longestCommonPrefix(strs: string[]): string {
    if (strs.length === 0) { return ''; }
    let prefix = strs[0];
    for (let i = 1; i < strs.length; i++) {
        while (!strs[i].startsWith(prefix)) {
            prefix = prefix.slice(0, -1);
            if (!prefix) { return ''; }
        }
    }
    return prefix;
}
