"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EinsteinPty = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const einsteinClient_1 = require("./einsteinClient");
const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    blue: '\x1b[34m',
    white: '\x1b[97m',
};
class EinsteinPty {
    constructor(credentials) {
        this.credentials = credentials;
        this.writeEmitter = new vscode.EventEmitter();
        this.onDidWrite = this.writeEmitter.event;
        this.line = '';
        this.busy = false;
        this.lastTabPartial = ''; // tracks what was typed when Tab was last pressed
    }
    open() {
        this.printBanner();
        this.prompt();
    }
    close() { }
    handleInput(data) {
        if (this.busy) {
            return;
        }
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
            }
            else {
                this.prompt();
            }
        }
        else if (data === '\x7f') {
            // Backspace
            if (this.line.length > 0) {
                this.line = this.line.slice(0, -1);
                this.write('\b \b');
            }
        }
        else if (data === '\x03') {
            // Ctrl+C
            this.line = '';
            this.write('^C\r\n');
            this.prompt();
        }
        else if (data >= ' ') {
            // Printable character — echo and append
            this.line += data;
            this.write(data);
        }
    }
    async handleTab() {
        const parts = this.line.trimStart().split(/\s+/);
        // Only complete when the user is typing a filename argument
        const isEinsteinCmd = parts[0]?.toLowerCase() === 'einstein' && parts.length >= 2;
        const isBlankArg = parts[0]?.toLowerCase() === 'einstein' && parts.length === 1;
        if (isBlankArg) {
            // `einstein [TAB]` — show all submittable files
            const files = await vscode.workspace.findFiles('**/*.{py,c,h,java,js,ts,cpp,cs,rb,sh}', '**/node_modules/**', 50);
            if (files.length === 0) {
                this.write('\x07');
                return;
            }
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
        const files = await vscode.workspace.findFiles(`**/${partial}*`, '**/node_modules/**', 50);
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
    async run(cmd) {
        this.busy = true;
        try {
            await this.dispatch(cmd);
        }
        catch (e) {
            this.writeLine(`${C.red}Unexpected error: ${e instanceof Error ? e.message : String(e)}${C.reset}`);
        }
        finally {
            this.busy = false;
            this.prompt();
        }
    }
    async dispatch(cmd) {
        const parts = cmd.trim().split(/\s+/);
        const verb = parts[0].toLowerCase();
        if (verb === 'einstein') {
            await this.handleSubmit(parts.slice(1).join(' ').trim());
        }
        else if (verb === 'help') {
            this.printHelp();
        }
        else if (verb === 'clear') {
            this.write('\x1b[2J\x1b[H');
        }
        else if (verb === 'set' && parts[1]?.toLowerCase() === 'module') {
            await this.handleSetModule(parts.slice(2).join('').trim());
        }
        else if (verb === 'set' && parts[1]?.toLowerCase() === 'credentials') {
            await this.handleSetCredentials();
        }
        else {
            this.writeLine(`${C.yellow}Unknown command "${verb}". Type ${C.bold}help${C.reset}${C.yellow} for usage.${C.reset}`);
        }
    }
    async handleSubmit(filename) {
        // Resolve which file to submit
        const filePath = await this.resolveFile(filename);
        if (!filePath) {
            return;
        }
        // Resolve module code
        const module = await this.resolveModule();
        if (!module) {
            return;
        }
        // Resolve credentials
        const creds = await this.resolveCredentials();
        if (!creds) {
            return;
        }
        const fileName = path.basename(filePath);
        this.write('\r\n');
        this.writeLine(`${C.dim}${'─'.repeat(48)}${C.reset}`);
        this.writeLine(`${C.bold}einstein ${fileName}${C.reset}  ${C.dim}(${module.toUpperCase()})${C.reset}`);
        this.writeLine(`${C.dim}Uploading…${C.reset}`);
        try {
            const task = path.basename(filePath, path.extname(filePath));
            const result = await (0, einsteinClient_1.submitFile)(filePath, module, task, creds.username, creds.password);
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
            }
            else {
                const nameWidth = Math.max(...testResults.map(t => t.name.length), 24);
                for (const t of testResults) {
                    const padded = t.name.padEnd(nameWidth);
                    if (t.passed) {
                        this.writeLine(`  ${C.green}✓${C.reset}  ${padded}  ${C.green}passed${C.reset}`);
                    }
                    else {
                        this.writeLine(`  ${C.red}✗${C.reset}  ${padded}  ${C.red}failed${C.reset}`);
                    }
                }
                this.write('\r\n');
                if (failCount === 0) {
                    this.writeLine(`${C.bold}${C.green}All ${total} tests passed ✓${C.reset}`);
                }
                else {
                    this.writeLine(`${C.bold}${passCount}/${total} tests passed${C.reset}  ${C.dim}(${failCount} failed)${C.reset}`);
                }
            }
            this.write('\r\n');
            this.writeLine(`${C.cyan}${reportUrl}${C.reset}`);
            this.writeLine(`${C.dim}${'─'.repeat(48)}${C.reset}`);
        }
        catch (e) {
            if (e instanceof einsteinClient_1.AuthError) {
                this.writeLine(`${C.red}Authentication failed. Run: ${C.bold}set credentials${C.reset}`);
            }
            else if (e instanceof einsteinClient_1.NetworkError) {
                this.writeLine(`${C.red}Network error: ${e.message}${C.reset}`);
            }
            else {
                this.writeLine(`${C.red}Error: ${e instanceof Error ? e.message : String(e)}${C.reset}`);
            }
        }
    }
    async resolveFile(filename) {
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
    async resolveModule() {
        const config = vscode.workspace.getConfiguration('einstein');
        const saved = config.get('defaultModule', '');
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
        if (!input?.trim()) {
            return undefined;
        }
        const module = input.trim().toLowerCase();
        await config.update('defaultModule', module, vscode.ConfigurationTarget.Workspace);
        this.writeLine(`${C.dim}Module set to ${module.toUpperCase()} (saved for this workspace)${C.reset}`);
        return module;
    }
    async resolveCredentials() {
        const existing = await this.credentials.get();
        if (existing) {
            return existing;
        }
        this.writeLine(`${C.yellow}No credentials saved. Opening prompt…${C.reset}`);
        const creds = await this.credentials.promptAndStore();
        if (!creds) {
            this.writeLine(`${C.red}Credentials required to submit.${C.reset}`);
            return undefined;
        }
        return creds;
    }
    async handleSetModule(module) {
        let code = module.toLowerCase();
        if (!code) {
            const input = await vscode.window.showInputBox({
                title: 'Einstein — Module Code',
                prompt: 'Enter your module code (e.g. ca116, csc1035)',
                ignoreFocusOut: true
            });
            if (!input?.trim()) {
                return;
            }
            code = input.trim().toLowerCase();
        }
        const config = vscode.workspace.getConfiguration('einstein');
        await config.update('defaultModule', code, vscode.ConfigurationTarget.Workspace);
        this.writeLine(`${C.green}Module set to ${code.toUpperCase()}${C.reset}`);
    }
    async handleSetCredentials() {
        this.writeLine(`${C.dim}Opening credential prompt…${C.reset}`);
        const creds = await this.credentials.promptAndStore();
        if (!creds) {
            return;
        }
        this.writeLine(`${C.dim}Verifying…${C.reset}`);
        try {
            await (0, einsteinClient_1.checkAuth)(creds.username, creds.password);
            this.writeLine(`${C.green}Credentials saved and verified ✓${C.reset}`);
        }
        catch {
            this.writeLine(`${C.yellow}Credentials saved (could not reach server to verify).${C.reset}`);
        }
    }
    printBanner() {
        this.write('\x1b[2J\x1b[H'); // clear screen
        this.writeLine(`${C.bold}${C.cyan}⚡ Einstein${C.reset}  ${C.dim}DCU Assignment Submission Tool${C.reset}`);
        this.writeLine(`${C.dim}Type ${C.reset}${C.bold}help${C.reset}${C.dim} for usage.${C.reset}`);
        this.write('\r\n');
    }
    printHelp() {
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
    reprompWithLine() {
        this.write(`${C.bold}${C.cyan}einstein>${C.reset} ${this.line}`);
    }
    writeColumns(names) {
        const col = Math.max(...names.map(n => n.length)) + 2;
        const termWidth = 80;
        const perRow = Math.max(1, Math.floor(termWidth / col));
        for (let i = 0; i < names.length; i += perRow) {
            const row = names.slice(i, i + perRow).map(n => n.padEnd(col)).join('');
            this.writeLine(row);
        }
        this.write('\r\n');
    }
    prompt() {
        this.write(`${C.bold}${C.cyan}einstein>${C.reset} `);
    }
    writeLine(text) {
        this.writeEmitter.fire(text + '\r\n');
    }
    write(text) {
        this.writeEmitter.fire(text);
    }
}
exports.EinsteinPty = EinsteinPty;
function longestCommonPrefix(strs) {
    if (strs.length === 0) {
        return '';
    }
    let prefix = strs[0];
    for (let i = 1; i < strs.length; i++) {
        while (!strs[i].startsWith(prefix)) {
            prefix = prefix.slice(0, -1);
            if (!prefix) {
                return '';
            }
        }
    }
    return prefix;
}
